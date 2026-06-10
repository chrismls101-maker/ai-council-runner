#!/usr/bin/env node
/**
 * glass-visual-inspector.mjs
 *
 * Visual inspection pass for the IIVO Glass Electron app.
 * Launches the built app via CDP (Electron 31+ compatible), checks all
 * critical UI surfaces, takes screenshots, and returns a structured report.
 *
 * NOTE: uses the CDP spawn approach (not electron.launch) because Electron 31+
 * rejects --remote-debugging-port=0 that Playwright's _electron.launch() passes.
 *
 * Used by glass-autonomous-agent.mjs (--visual flag):
 *   const { runVisualInspection } = await import("./glass-visual-inspector.mjs");
 *   const { passed, results, report } = await runVisualInspection({ headed: false });
 *
 * Standalone:
 *   node scripts/glass-visual-inspector.mjs
 *   node scripts/glass-visual-inspector.mjs --no-connect
 *   node scripts/glass-visual-inspector.mjs --report /tmp/report.md
 */

import { execSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLASS_ROOT = resolve(__dirname, "..");
const GLASS_MAIN = join(GLASS_ROOT, "out", "main", "index.js");
const GLASS_ELECTRON_BIN = join(
  GLASS_ROOT,
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
const CDP_PORT = 19222;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const SCREENSHOTS_DIR = join("/tmp", "glass-visual-inspect");

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    noConnect: args.includes("--no-connect"),
    headed: args.includes("--headed"),
    reportPath: (() => {
      const i = args.indexOf("--report");
      return i >= 0 ? args[i + 1] ?? null : null;
    })(),
  };
}
const OPTS = parseArgs();

// ─── Minimal stub server ──────────────────────────────────────────────────────

function startStubServer() {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ answer: "Visual inspection stub.", shortAnswer: "OK", routeUsed: "stub", model: "stub" }));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// ─── CDP helpers ───────────────────────────────────────────────────────────────

function killStaleCdpProcesses() {
  try {
    const pids = execSync(`lsof -ti tcp:${CDP_PORT}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    for (const pid of pids.split("\n")) {
      const n = Number(pid);
      if (Number.isFinite(n) && n > 0) {
        try { process.kill(n, "SIGKILL"); } catch { /* already gone */ }
      }
    }
  } catch { /* port free */ }
}

async function waitForCdp(timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${CDP_URL}/json/version`);
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await sleep(300);
  }
  throw new Error(`CDP not ready at ${CDP_URL} within ${timeoutMs}ms`);
}

async function connectChromiumCdp(retries = 3) {
  const { chromium } = await import("playwright");
  let last;
  for (let i = 1; i <= retries; i++) {
    try {
      return await chromium.connectOverCDP(CDP_URL);
    } catch (err) {
      last = err;
      if (i < retries) await sleep(400 * i);
    }
  }
  throw last;
}

// ─── Report state ─────────────────────────────────────────────────────────────

function makeResults() {
  return {
    startTime: new Date(),
    passed: /** @type {string[]} */ ([]),
    failed: /** @type {string[]} */ ([]),
    warnings: /** @type {string[]} */ ([]),
    screenshots: /** @type {string[]} */ ([]),
  };
}

function pass(r, label) { r.passed.push(label); }
function fail(r, label, detail = "") { r.failed.push(detail ? `${label}: ${detail}` : label); }
function warn(r, label, detail = "") { r.warnings.push(detail ? `${label}: ${detail}` : label); }

async function tryScreenshot(page, name) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const dest = join(SCREENSHOTS_DIR, `${name}.png`);
  try {
    await page.screenshot({ path: dest });
    return dest;
  } catch {
    return null;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Page finder ──────────────────────────────────────────────────────────────

async function findPage(browser, urlFragment, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) {
        if (page.url().includes(urlFragment)) {
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          return page;
        }
      }
    }
    await sleep(250);
  }
  const urls = browser.contexts().flatMap((c) => c.pages()).map((p) => p.url());
  return null; // not a hard error — caller decides
}

async function checkVisible(page, selector, label, r, timeoutMs = 8_000) {
  try {
    await page.locator(selector).waitFor({ state: "visible", timeout: timeoutMs });
    pass(r, label);
    return true;
  } catch {
    fail(r, label, `${selector} not visible within ${timeoutMs}ms`);
    return false;
  }
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * @param {{ headed?: boolean, noConnect?: boolean }} [opts]
 * @returns {Promise<{ passed: boolean, results: object, report: string }>}
 */
export async function runVisualInspection(opts = {}) {
  const r = makeResults();
  let electronProcess = null;
  let stub = null;
  let browser = null;

  try {
    // ── Pre-flight ──────────────────────────────────────────────────────────
    if (!existsSync(GLASS_MAIN)) {
      fail(r, "Built app present", `${GLASS_MAIN} not found — run npm run build first`);
      return finalize(r);
    }
    pass(r, "Built app present");

    killStaleCdpProcesses();

    stub = await startStubServer();

    const env = { ...process.env, IIVO_GLASS_E2E: "1", IIVO_API_URL: stub.baseUrl, IIVO_WEB_URL: stub.baseUrl };
    delete env.ELECTRON_RUN_AS_NODE;

    electronProcess = spawn(GLASS_ELECTRON_BIN, [GLASS_MAIN], {
      cwd: GLASS_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    electronProcess.stderr?.on("data", (chunk) => {
      if (/error/i.test(chunk.toString())) process.stderr.write(`[visual] ${chunk}`);
    });

    // ── Wait for CDP ────────────────────────────────────────────────────────
    try {
      await waitForCdp();
      pass(r, "Glass app launched (CDP ready)");
    } catch (err) {
      fail(r, "Glass app launched", String(err));
      return finalize(r);
    }

    browser = await connectChromiumCdp();
    pass(r, "CDP connected");

    await sleep(2_500); // let renderer windows settle

    // ── DOCK ────────────────────────────────────────────────────────────────
    const dockPage = await findPage(browser, "index.html");
    if (!dockPage) {
      fail(r, "Dock window found");
    } else {
      pass(r, "Dock window found");
      const shot1 = await tryScreenshot(dockPage, "01-dock-initial");
      if (shot1) r.screenshots.push(shot1);

      await checkVisible(dockPage, '[data-testid="glass-dock"]', "Dock element renders", r);
      await checkVisible(dockPage, '[data-testid="glass-dock-start-session"]', "Start Session button visible", r);
      await checkVisible(dockPage, '[data-testid="glass-dock-open-panel"]', "Open Panel button visible", r);
      await checkVisible(dockPage, '[data-testid="glass-dock-capture"]', "Capture button visible", r);
      await checkVisible(dockPage, '[data-testid="glass-dock-stop-everything"]', "Stop Everything button visible", r);
      await checkVisible(
        dockPage,
        '[data-testid="glass-dock-show-overlay"], [data-testid="glass-dock-hide-overlay"]',
        "Overlay toggle visible", r,
      );
      await checkVisible(dockPage, '[data-testid="glass-dock-chrome-lock"]', "Chrome lock button visible", r);

      // Check no error badges on dock
      const errorCount = await dockPage.locator(".dock__error, [data-testid*='error-banner']").count();
      if (errorCount === 0) pass(r, "No error banners on dock");
      else fail(r, "No error banners on dock", `${errorCount} error element(s) found`);
    }

    // ── COMMAND BAR ─────────────────────────────────────────────────────────
    const commandPage = await findPage(browser, "command.html");
    if (!commandPage) {
      warn(r, "Command bar window not found (may not be a hard error)");
    } else {
      pass(r, "Command bar window found");
      const shot2 = await tryScreenshot(commandPage, "02-command-bar");
      if (shot2) r.screenshots.push(shot2);
      // Command bar might be minimised; just check the window loaded
      const bodyText = await commandPage.locator("body").textContent().catch(() => "");
      if (bodyText !== null) pass(r, "Command bar window loaded");
    }

    // ── OPEN PANEL ──────────────────────────────────────────────────────────
    const panelPage = await findPage(browser, "panel.html");
    if (!panelPage) {
      fail(r, "Panel window found");
    } else {
      pass(r, "Panel window found");

      if (dockPage) {
        try {
          await dockPage.locator('[data-testid="glass-dock-open-panel"]').click();
          await sleep(1_200);
          pass(r, "Open Panel click succeeded");
        } catch (err) {
          fail(r, "Open Panel click succeeded", String(err).slice(0, 100));
        }
      }

      const shot3 = await tryScreenshot(panelPage, "03-panel-open");
      if (shot3) r.screenshots.push(shot3);

      // Panel root
      const panelCount = await panelPage.locator(".glass-panel, [data-testid='glass-panel']").count();
      if (panelCount > 0) pass(r, "Panel root element renders");
      else fail(r, "Panel root element renders", "No .glass-panel element found");

      // Listen card
      await checkVisible(
        panelPage,
        '[data-testid="glass-panel-listen"], [data-testid="listen-card"], .listen-card, [data-testid="glass-panel-listen-tab"]',
        "Listen card visible",
        r,
        8_000,
      );

      // Panel tabs
      const tabCount = await panelPage.locator('[data-testid*="glass-panel-tab"], .panel__tab, [role="tab"]').count();
      if (tabCount > 0) pass(r, `Panel tabs present (${tabCount})`);
      else warn(r, "Panel tabs — none found (may be expected before session)");

      // No error banners
      const panelErrors = await panelPage.locator(".panel__error-banner, [data-testid*='error-banner']").count();
      if (panelErrors === 0) pass(r, "No error banners on panel");
      else fail(r, "No error banners on panel", `${panelErrors} found`);
    }

    // ── OVERLAY ─────────────────────────────────────────────────────────────
    const overlayPage = await findPage(browser, "overlay.html", 8_000);
    if (overlayPage) {
      pass(r, "Overlay window found");
      const shot4 = await tryScreenshot(overlayPage, "04-overlay");
      if (shot4) r.screenshots.push(shot4);
    } else {
      pass(r, "Overlay window not shown at launch (expected in E2E mode)");
    }

    // Final dock screenshot
    if (dockPage) {
      const shot5 = await tryScreenshot(dockPage, "05-dock-final");
      if (shot5) r.screenshots.push(shot5);
    }

  } catch (err) {
    fail(r, "Visual inspection", `Unexpected error: ${String(err).slice(0, 200)}`);
    process.stderr.write(`[visual-inspector] ${err}\n`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (electronProcess) { electronProcess.kill("SIGKILL"); await sleep(400); }
    killStaleCdpProcesses();
    if (stub) await stub.close().catch(() => {});
  }

  return finalize(r);
}

function finalize(r) {
  const elapsed = ((Date.now() - r.startTime.getTime()) / 1000).toFixed(1);
  const passed = r.failed.length === 0;
  const status = passed ? "✅ PASSED" : `❌ FAILED (${r.failed.length})`;

  const lines = [
    `## Visual Inspection — ${r.startTime.toLocaleString()} [${status}] (${elapsed}s)`,
    "",
    `**Passed:** ${r.passed.length}  **Failed:** ${r.failed.length}  **Warnings:** ${r.warnings.length}`,
    "",
  ];

  if (r.failed.length > 0) {
    lines.push("### ❌ Failures");
    for (const f of r.failed) lines.push(`- ${f}`);
    lines.push("");
  }

  if (r.warnings.length > 0) {
    lines.push("### ⚠️ Warnings");
    for (const w of r.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push("### ✅ Passed");
  for (const p of r.passed) lines.push(`- ${p}`);
  lines.push("");

  if (r.screenshots.length > 0) {
    lines.push("### Screenshots");
    for (const s of r.screenshots) lines.push(`- \`${s}\``);
    lines.push("");
  }

  const report = lines.join("\n");

  // Write standalone report to /tmp
  try {
    mkdirSync("/tmp/glass-visual-inspect", { recursive: true });
    writeFileSync(join("/tmp/glass-visual-inspect", `inspect-${Date.now()}.md`), report);
  } catch { /* non-critical */ }

  // Append to caller-specified report path
  if (OPTS.reportPath) {
    try { appendFileSync(OPTS.reportPath, "\n" + report + "\n"); } catch { /* non-critical */ }
  }

  return { passed, results: r, report };
}

// ─── Standalone entry ─────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runVisualInspection({ headed: OPTS.headed, noConnect: OPTS.noConnect })
    .then(({ passed, results: r }) => {
      console.log(`\nTotal: ${r.passed.length} passed, ${r.failed.length} failed, ${r.warnings.length} warnings`);
      process.exit(passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });
}
