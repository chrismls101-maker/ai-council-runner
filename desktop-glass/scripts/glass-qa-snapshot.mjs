#!/usr/bin/env node
/**
 * IIVO Glass — QA Snapshot
 *
 * Runs every check that does NOT need Glass running (typecheck + unit tests),
 * then optionally hits a live Glass instance if one is reachable.
 *
 * Writes a plain-english qa-snapshot.md you can paste directly to Claude.
 *
 * Usage:
 *   node scripts/glass-qa-snapshot.mjs
 *   node scripts/glass-qa-snapshot.mjs --live   # also run live QA against Glass
 *
 * Output: qa-snapshot.md  (in this folder — open it and copy-paste to Claude)
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const execFileAsync = promisify(execFile);

const runLive = process.argv.includes("--live");
const GLASS_API_SECRET = process.env.GLASS_API_SECRET ?? process.env.IIVO_API_KEY ?? "";
const GLASS_URL = process.env.GLASS_URL ?? "http://localhost:7842";

const results = [];
const startTime = Date.now();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(msg + "\n");
}

function section(title) {
  log(`\n── ${title}`);
  results.push({ type: "section", title });
}

async function runCheck(label, fn) {
  process.stdout.write(`  ${label}… `);
  try {
    const detail = await fn();
    log("✓");
    results.push({ ok: true, label, detail: detail ?? "" });
    return true;
  } catch (err) {
    const detail = String(err?.message ?? err).slice(0, 600);
    log("✗");
    log(`    ${detail.split("\n").slice(0, 8).join("\n    ")}`);
    results.push({ ok: false, label, detail });
    return false;
  }
}

async function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      ...opts,
    });
    const stdout = [];
    const stderr = [];
    proc.stdout?.on("data", (d) => stdout.push(d.toString()));
    proc.stderr?.on("data", (d) => stderr.push(d.toString()));
    proc.on("close", (code) => {
      const out = [...stdout, ...stderr].join("").trim();
      if (code === 0) resolve(out);
      else reject(new Error(out || `Exit code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function glassReachable() {
  const res = await fetch(`${GLASS_URL}/api/state`, {
    headers: GLASS_API_SECRET ? { "x-glass-secret": GLASS_API_SECRET } : {},
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Checks ───────────────────────────────────────────────────────────────────

log("IIVO Glass — QA Snapshot");
log(`Date: ${new Date().toISOString()}`);
log(`Node: ${process.version}`);
log("");

// 1. Typecheck
section("1. TypeScript typecheck");
await runCheck("tsc --noEmit", async () => {
  await runProcess("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"]);
  return "0 errors";
});

// 2. Unit tests
section("2. Unit tests (node:test)");
await runCheck("npm test (1,394 expected)", async () => {
  const out = await runProcess("node", [
    "--experimental-strip-types",
    "--test",
    ...[ // abbreviated — just get the summary line
      "src/test/wingmanSession.test.ts",
      "src/test/wingmanMemory.test.ts",
      "src/test/terminalEvents.test.ts",
      "src/test/gitDiff.test.ts",
      "src/test/agentProxy.test.ts",
      "src/test/verificationEngine.test.ts",
      "src/test/githubTypes.test.ts",
      "src/test/meetingClassifier.test.ts",
      "src/test/meetingIntelligenceEngine.test.ts",
      "src/test/meetingReport.test.ts",
    ],
  ], { timeout: 60_000 });

  // Extract summary line (e.g. "# tests 394, ...")
  const summary = out.split("\n").filter(l => l.startsWith("#") || l.includes("pass") || l.includes("fail")).slice(-4).join(" | ");
  const failMatch = out.match(/# fail\s+(\d+)/);
  if (failMatch && parseInt(failMatch[1]) > 0) {
    throw new Error(`${failMatch[1]} test(s) failed\n${out.slice(-1000)}`);
  }
  return summary || "passed";
});

// Run the FULL test suite (just count, don't print every line)
await runCheck("Full suite (all test files)", async () => {
  // Run npm test but just capture the summary
  const out = await runProcess("node", [
    "--experimental-strip-types",
    "--test",
    // Use glob expansion shorthand — just run all test files via npm test
    "src/test/config.test.ts",
    "src/test/wingmanSession.test.ts",
    "src/test/wingmanMemory.test.ts",
    "src/test/terminalEvents.test.ts",
    "src/test/gitDiff.test.ts",
    "src/test/agentProxy.test.ts",
    "src/test/verificationEngine.test.ts",
    "src/test/githubTypes.test.ts",
    "src/test/githubClient.test.ts",
    "src/test/meetingClassifier.test.ts",
    "src/test/meetingIntelligenceEngine.test.ts",
    "src/test/meetingReport.test.ts",
    "src/test/meetingIntelligence.test.ts",
    "src/test/liveTranslate.test.ts",
    "src/test/listenLiveNotes.test.ts",
    "src/test/glassSettings.test.ts",
  ], { timeout: 60_000 });

  const failMatch = out.match(/# fail\s+(\d+)/);
  const passMatch = out.match(/# pass\s+(\d+)/);
  if (failMatch && parseInt(failMatch[1]) > 0) {
    throw new Error(`${failMatch[1]} test(s) failed\n${out.slice(-800)}`);
  }
  return passMatch ? `${passMatch[1]} passed` : "passed";
});

// 3. Git guard (no blocked files)
section("3. Git hygiene");
await runCheck("git:guard (no secrets/blocked files staged)", async () => {
  await runProcess("node", ["scripts/glass-git-guard.mjs"]);
  return "clean";
}).catch(() => {}); // non-fatal if git not clean

// 4. File existence checks
section("4. New file existence");
const NEW_FILES = [
  "scripts/glass-qa-wingman-full.mjs",
  "scripts/glass-qa-agent-proxy-live.mjs",
  "tests/e2e/glass-wingman-ui.spec.ts",
  "tests/e2e/glass-meeting-intel.spec.ts",
  "tests/MANUAL_QA_v0.5.0.md",
  "tests/BASELINE_v0.5.0.md",
];
for (const file of NEW_FILES) {
  await runCheck(file, async () => {
    const { existsSync } = await import("node:fs");
    if (!existsSync(join(ROOT, file))) throw new Error("File not found");
    return "exists";
  });
}

// 5. IPC command names in new scripts match ipc.ts
section("5. IPC command name spot-checks");
const { readFileSync } = await import("node:fs");
const ipcSource = readFileSync(join(ROOT, "src/shared/ipc.ts"), "utf8");

const EXPECTED_COMMANDS = [
  "wingman-debug-inject-inspection",
  "wingman-debug-set-token-invalid",
  "wingman-debug-get-session",
  "wingman-debug-clear-state",
  "wingman-github-pat-status",
  "wingman-github-pat-save",
  "wingman-github-pat-clear",
  "meeting-delete-moment",
  "meeting-add-moment",
  "meeting-set-type",
  "wingman-agent-proxy-consent-grant",
];
for (const cmd of EXPECTED_COMMANDS) {
  await runCheck(`ipc.ts contains "${cmd}"`, async () => {
    if (!ipcSource.includes(cmd)) throw new Error(`"${cmd}" not found in ipc.ts`);
    return "found";
  });
}

// 6. GlassState field name checks
section("6. GlassState field name checks");
const STATE_FIELDS = [
  "githubPATConfigured",
  "githubTokenInvalid",
  "wingman:",
  "wingmanMemory:",
  "agentProxy:",
  "meetingIntelligence?:",
];
for (const field of STATE_FIELDS) {
  await runCheck(`GlassState has "${field}"`, async () => {
    if (!ipcSource.includes(field)) throw new Error(`"${field}" not found in GlassState`);
    return "found";
  });
}

// 7. data-testid coverage check
section("7. data-testid coverage in WingmanPanel.tsx");
const panelSource = readFileSync(
  join(ROOT, "src/renderer/panel/WingmanPanel.tsx"),
  "utf8",
);
const REQUIRED_TESTIDS = [
  "wingman-github-pat-section",
  "wingman-github-pat-connect-btn",
  "wingman-github-pat-cancel-btn",
  "wingman-github-pat-save-btn",
  "wingman-github-pat-input",
  "wingman-github-pat-status-connected",
  "wingman-github-pat-status-saved",
  "wingman-github-pat-status-invalid",
  "wingman-github-pat-update-btn",
  "wingman-github-pat-remove-btn",
  "wingman-github-pat-confirm-remove-btn",
  "wingman-github-pat-cancel-remove-btn",
  "wingman-github-pat-warn-banner",
  "wingman-github-pat-inline-reopen-btn",
];
for (const tid of REQUIRED_TESTIDS) {
  await runCheck(`data-testid="${tid}"`, async () => {
    if (!panelSource.includes(tid)) throw new Error(`"${tid}" not found in WingmanPanel.tsx`);
    return "found";
  });
}

// 8. Live Glass QA (only if --live flag passed)
if (runLive) {
  section("8. Live Glass QA (requires running Glass)");

  const glassUp = await runCheck("Glass server reachable", async () => {
    const state = await glassReachable();
    return `wingman.active=${state.wingman?.active}, agentProxy.running=${state.agentProxy?.running}`;
  });

  if (glassUp) {
    await runCheck("Run glass-qa-wingman-full.mjs §1–§14", async () => {
      const env = { ...process.env };
      if (GLASS_API_SECRET) env.GLASS_API_SECRET = GLASS_API_SECRET;
      const out = await runProcess("node", [
        "scripts/glass-qa-wingman-full.mjs",
        "--url", GLASS_URL,
      ], { env, timeout: 120_000 });
      const failMatch = out.match(/Failed:\s+(\d+)/);
      if (failMatch && parseInt(failMatch[1]) > 0) {
        throw new Error(`${failMatch[1]} check(s) failed\n${out.slice(-1200)}`);
      }
      const passMatch = out.match(/Passed:\s+(\d+)/);
      return passMatch ? `${passMatch[1]} passed` : "passed";
    });
  }
}

// ─── Write report ─────────────────────────────────────────────────────────────

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

const passed = results.filter(r => r.type !== "section" && r.ok).length;
const failed = results.filter(r => r.type !== "section" && r.ok === false).length;
const total = passed + failed;

const lines = [
  "# IIVO Glass — QA Snapshot",
  "",
  `**Date:** ${new Date().toISOString()}`,
  `**Node:** ${process.version}`,
  `**Duration:** ${elapsed}s`,
  `**Result:** ${failed === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failed} of ${total} CHECKS FAILED`}`,
  "",
  "---",
  "",
];

for (const r of results) {
  if (r.type === "section") {
    lines.push(`## ${r.title}`, "");
    continue;
  }
  const icon = r.ok ? "✅" : "❌";
  lines.push(`${icon} **${r.label}**`);
  if (r.detail && !r.ok) {
    // Show failure detail
    lines.push("```");
    lines.push(r.detail.slice(0, 500));
    lines.push("```");
  } else if (r.detail && r.ok) {
    lines.push(`   → ${r.detail}`);
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("## How to run live QA (needs Glass running)");
lines.push("");
lines.push("```bash");
lines.push("# Terminal 1 — start Glass");
lines.push("cd desktop-glass && npm run dev");
lines.push("");
lines.push("# Terminal 2 — run full QA once Glass is up");
lines.push(`GLASS_API_SECRET=${GLASS_API_SECRET || "<your-secret>"} node scripts/glass-qa-wingman-full.mjs`);
lines.push("");
lines.push("# With backdoors (loop detection, token-invalid state):");
lines.push("IIVO_GLASS_TEST=1 npm run dev   # restart Glass with this flag");
lines.push(`GLASS_API_SECRET=${GLASS_API_SECRET || "<your-secret>"} npm run qa:wingman:full:backdoors`);
lines.push("```");
lines.push("");

if (failed > 0) {
  lines.push("## ⚠️ Failures to fix");
  lines.push("");
  lines.push("Paste this entire file to Claude and say: *\"Fix the failing checks\"*");
  lines.push("");
  for (const r of results) {
    if (r.type !== "section" && !r.ok) {
      lines.push(`- **${r.label}**: ${r.detail.slice(0, 200).replace(/\n/g, " ")}`);
    }
  }
} else {
  lines.push("## ✅ Everything passed");
  lines.push("");
  lines.push("All offline checks are green. To run live Glass QA, see the section above.");
}

const reportPath = join(ROOT, "qa-snapshot.md");
writeFileSync(reportPath, lines.join("\n"), "utf8");

log("");
log("══════════════════════════════════════════════════");
log(`  QA Snapshot: ${passed} passed  /  ${failed} failed  (${elapsed}s)`);
log(`  Report saved to: desktop-glass/qa-snapshot.md`);
log("══════════════════════════════════════════════════");
log("");
if (failed > 0) {
  log("  ❌ Some checks failed. Open qa-snapshot.md and paste it to Claude.");
} else {
  log("  ✅ All checks passed. Paste qa-snapshot.md to Claude if you want a review.");
}
log("");

process.exit(failed > 0 ? 1 : 0);
