/**
 * Launch or attach to IIVO Glass over CDP and automate Listen mode for live QA.
 *
 * Requires IIVO_GLASS_E2E=1 (CDP port 19222) — the harness sets this when launching.
 * Uses the REAL IIVO server (IIVO_GLASS_LIVE_E2E=1), not the E2E stub.
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GLASS_ROOT = path.resolve(__dirname, "../..");
export const GLASS_MAIN = path.join(GLASS_ROOT, "out/main/index.js");
export const GLASS_ELECTRON_BIN = path.join(
  GLASS_ROOT,
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
export const GLASS_CDP_PORT = 19222;
export const GLASS_CDP_URL = `http://127.0.0.1:${GLASS_CDP_PORT}`;
const CDP_STARTUP_TIMEOUT_MS = 45_000;

export function glassBuildNeeded() {
  return !existsSync(GLASS_MAIN) || !existsSync(GLASS_ELECTRON_BIN);
}

export function ensureGlassBuilt(log = console.log) {
  if (!existsSync(GLASS_ELECTRON_BIN)) {
    log("Installing Electron (first run)…");
    const install = spawnSync("npm", ["install"], { cwd: GLASS_ROOT, stdio: "inherit" });
    if (install.status !== 0) throw new Error("npm install failed in desktop-glass");
  }
  if (!existsSync(GLASS_MAIN)) {
    log("Building IIVO Glass (out/main missing)…");
    const build = spawnSync("npm", ["run", "build"], { cwd: GLASS_ROOT, stdio: "inherit" });
    if (build.status !== 0) throw new Error("glass build failed — run npm run glass:build");
  }
}

function killStaleCdp() {
  try {
    const out = execSync(`lsof -ti tcp:${GLASS_CDP_PORT}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    for (const pid of out.split("\n")) {
      const n = Number(pid);
      if (Number.isFinite(n) && n > 0) {
        try {
          process.kill(n, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }
  } catch {
    /* free */
  }
}

function cdpInUse() {
  try {
    return execSync(`lsof -ti tcp:${GLASS_CDP_PORT}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim().length > 0;
  } catch {
    return false;
  }
}

async function waitForCdp(url, electronProcess, timeoutMs = CDP_STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (electronProcess?.exitCode != null) {
      throw new Error(`Glass exited before CDP ready (code ${electronProcess.exitCode})`);
    }
    try {
      const res = await fetch(`${url}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`CDP not ready at ${url} within ${timeoutMs}ms`);
}

async function waitForPage(browser, htmlFile, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) {
        if (page.url().includes(htmlFile)) {
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
          return page;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Window ${htmlFile} not found`);
}

export async function getGlassPages(browser) {
  const [command, dock, panel] = await Promise.all([
    waitForPage(browser, "command.html"),
    waitForPage(browser, "index.html"),
    waitForPage(browser, "panel.html"),
  ]);
  return { command, dock, panel };
}

export async function readGlassState(commandPage) {
  return commandPage.evaluate(async () => window.glass.getState());
}

export async function launchGlassForListenLive({ apiUrl, webUrl, log = console.log }) {
  ensureGlassBuilt(log);
  killStaleCdp();

  const env = {
    ...process.env,
    IIVO_GLASS_E2E: "1",
    IIVO_GLASS_LIVE_E2E: "1",
    IIVO_API_URL: apiUrl,
    IIVO_WEB_URL: webUrl,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  log("Launching IIVO Glass (automation mode, real server)…");
  const electronProcess = spawn(GLASS_ELECTRON_BIN, [GLASS_MAIN], {
    cwd: GLASS_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  electronProcess.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await waitForCdp(GLASS_CDP_URL, electronProcess);
  const browser = await chromium.connectOverCDP(GLASS_CDP_URL);
  const pages = await getGlassPages(browser);
  return { browser, electronProcess, pages, launched: true, stderr };
}

export async function attachGlassForListenLive({ log = console.log }) {
  if (!cdpInUse()) {
    throw new Error(
      "No Glass on CDP port 19222. Start with:\n" +
        "  IIVO_GLASS_E2E=1 IIVO_GLASS_LIVE_E2E=1 npm run glass:dev\n" +
        "Or omit --attach to let the harness launch Glass for you.",
    );
  }
  log("Attaching to IIVO Glass on CDP :19222…");
  await waitForCdp(GLASS_CDP_URL, null, 10_000);
  const browser = await chromium.connectOverCDP(GLASS_CDP_URL);
  const pages = await getGlassPages(browser);
  return { browser, electronProcess: null, pages, launched: false };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Automate Listen mode: session + coaching + video_learning + system audio + Listen click.
 * Does NOT enable microphone or Voice mode.
 */
export async function automateListenMode({ command, dock, panel, log = console.log }) {
  log("Automating Listen mode (computer audio only, mic off)…");

  await command.evaluate(() => {
    window.glass.send({ type: "stop-everything" });
    window.glass.send({ type: "copilot-set-mode", mode: "off" });
    window.glass.send({ type: "session-end" });
  });
  await sleep(400);

  await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  await panel.waitForSelector('[data-testid="glass-mode-panel"]', { timeout: 15_000 });

  log("  Running setup check (virtual audio / STT probes)…");
  await command.evaluate(() => window.glass.send({ type: "run-setup-check" }));
  await sleep(4000);

  let state = await readGlassState(command);
  log(`  System audio status: ${state.systemAudioStatus ?? "unknown"}`);

  if (state.systemAudioStatus === "requires_virtual_device") {
    return {
      ok: false,
      category: "blackhole_no_signal",
      cause: state.systemAudioDetail ?? "Virtual audio device not detected.",
      fix: "Install BlackHole, create Multi-Output Device, select BlackHole in Glass Advanced → Audio.",
      state,
    };
  }

  await panel.locator('[data-testid="glass-mode-card-listen"]').click();
  await sleep(1500);

  state = await readGlassState(command);
  if (state.copilot?.config?.sessionType !== "video_learning" && !state.copilot?.active) {
    await sleep(1000);
    state = await readGlassState(command);
  }

  if (!state.privacy?.listening) {
    if (state.systemAudioStatus === "available") {
      log("  Starting system audio listening via request-start-listening…");
      await command.evaluate(() => window.glass.send({ type: "request-start-listening" }));
      await sleep(2000);
      state = await readGlassState(command);
    }
  }

  if (!state.privacy?.listening && state.systemAudioStatus === "available") {
    await command.evaluate(() => {
      window.glass.send({ type: "transcription-set-mode", mode: "system_audio" });
      window.glass.send({ type: "start-listening" });
    });
    await command.evaluate(() => window.glass.send({ type: "request-start-listening" }));
    await sleep(2500);
    state = await readGlassState(command);
  }

  const micListening = state.transcriptionMode?.startsWith("microphone");
  if (micListening) {
    return {
      ok: false,
      category: "mic_accidentally_active",
      cause: "Transcription mode is microphone, not system_audio.",
      fix: "Click Listen again; harness will force system_audio.",
      state,
    };
  }

  if (!state.privacy?.listening) {
    const setupVisible = await panel
      .locator('[data-testid="glass-listen-setup-needed"]')
      .isVisible()
      .catch(() => false);
    return {
      ok: false,
      category: setupVisible ? "system_audio_not_selected" : "transcript_chunks_missing",
      cause: setupVisible
        ? "Listen mode needs system audio setup."
        : `Listening not active (systemAudio=${state.systemAudioStatus}).`,
      fix: "Confirm BlackHole is routing Mac audio and video is playing with sound.",
      state,
    };
  }

  log("  Listen mode active · transcription: system_audio · mic off");
  return { ok: true, state };
}

export async function closeGlassSession({ browser, electronProcess, log = console.log }) {
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  if (electronProcess && electronProcess.exitCode == null) {
    log("Closing IIVO Glass…");
    electronProcess.kill("SIGTERM");
    await sleep(500);
    if (electronProcess.exitCode == null) electronProcess.kill("SIGKILL");
  }
}

export function printSetupInstructions(log = console.log) {
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("  IIVO Glass Live Listen — what you need running");
  log("══════════════════════════════════════════════════════════════");
  log("");
  log("  1. IIVO server (required) — in a separate terminal:");
  log("       npm run dev");
  log("     This serves API + STT at http://localhost:3001");
  log("");
  log("  2. You do NOT need a separate test server.");
  log("     This harness is the test — it calls your real server.");
  log("");
  log("  3. BlackHole (or Loopback) routing Mac audio to Glass.");
  log("");
  log("  4. YouTube (or your video) playing with the tab frontmost.");
  log("     Vision is optional — window title + audio are enough.");
  log("");
  log("  AUTO MODE (default): harness launches Glass and clicks Listen.");
  log("  You do NOT need to open the app manually unless using --attach.");
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("");
}
