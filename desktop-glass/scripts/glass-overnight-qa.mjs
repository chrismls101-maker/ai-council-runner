#!/usr/bin/env node
// IIVO Glass — self-contained overnight QA runner.
//
// Designed to run UNATTENDED from a terminal (Cursor does not need to stay
// alive). It keeps the Mac awake, starts the real server if possible, runs the
// full validation matrix sequentially with per-command timeouts, never lets a
// hung child block the run, then writes a brutally honest REPORT.md.
//
// Run:  caffeinate -dimsu npm run glass:qa:overnight
//   (the script also starts its own `caffeinate` as a backup.)
//
// Output:
//   /tmp/iivo-glass-overnight/REPORT.md         (+ copy to desktop-glass/OVERNIGHT_QA_REPORT.md)
//   /tmp/iivo-glass-overnight/logs/<step>.log   (one log per command)
//   /tmp/iivo-glass-overnight/server.log        (real server output, if started)

import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  copyFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const GLASS_ROOT = resolve(__dirname, "..");
const OUT = "/tmp/iivo-glass-overnight";
const LOGS = join(OUT, "logs");
const MIN = 60_000;
const API_URL = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

mkdirSync(LOGS, { recursive: true });

const startedAt = new Date();
const steps = [];
let serverStartedByUs = false;
let serverProc = null;
let serverHealthy = false;
let caffeinateProc = null;

function log(msg) {
  const line = `[overnight ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(join(OUT, "runner.log"), line + "\n");
  } catch {
    /* best effort */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Kill an entire process group (npm -> node -> playwright -> electron chains).
function killTree(proc, signal = "SIGTERM") {
  if (!proc || proc.killed) return;
  try {
    process.kill(-proc.pid, signal);
  } catch {
    try {
      proc.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function tail(text, n = 25) {
  const lines = text.split("\n");
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}

/**
 * Run one command, streaming combined output to a log file, enforcing a
 * timeout, and killing the whole process group on timeout.
 * @returns {Promise<{status:string, code:number|null, durationMs:number, logFile:string, tailText:string}>}
 */
function runStep({ name, file, command, args, cwd = REPO_ROOT, timeoutMs, critical = false, phase = "" }) {
  return new Promise((resolveStep) => {
    const logFile = join(LOGS, file);
    const fd = openSync(logFile, "w");
    const header = `# ${name}\n# ${command} ${args.join(" ")}\n# cwd: ${cwd}\n# started: ${new Date().toISOString()}\n\n`;
    appendFileSync(logFile, header);
    log(`▶ ${name} (timeout ${Math.round(timeoutMs / MIN)}m)`);
    const t0 = Date.now();

    let captured = header;
    const child = spawn(command, args, {
      cwd,
      detached: true, // own process group so we can kill the whole tree
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onData = (buf) => {
      const s = buf.toString();
      captured += s;
      try {
        appendFileSync(fd, s);
      } catch {
        /* ignore */
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      log(`⏱ TIMEOUT ${name} — killing process tree`);
      killTree(child, "SIGTERM");
      setTimeout(() => killTree(child, "SIGKILL"), 5_000);
    }, timeoutMs);

    const finish = (code) => {
      clearTimeout(timer);
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
      const durationMs = Date.now() - t0;
      const status = timedOut ? "timeout" : code === 0 ? "pass" : "fail";
      const record = { name, phase, status, code, durationMs, critical, logFile, tailText: tail(captured) };
      steps.push(record);
      const mark = status === "pass" ? "✅" : status === "timeout" ? "⏱" : "❌";
      log(`${mark} ${name} — ${status} (${Math.round(durationMs / 1000)}s, exit ${code})`);
      resolveStep(record);
    };

    child.on("error", (err) => {
      onData(`\n[spawn error] ${err.message}\n`);
      finish(127);
    });
    child.on("close", (code) => finish(code));
  });
}

// --- macOS keep-awake (backup; user is told to also wrap with caffeinate) ----
function startCaffeinate() {
  if (os.platform() !== "darwin") return;
  try {
    caffeinateProc = spawn("caffeinate", ["-dimsu"], { detached: true, stdio: "ignore" });
    caffeinateProc.unref();
    log("☕ caffeinate started (Mac will not sleep)");
  } catch {
    log("caffeinate unavailable — relying on outer `caffeinate -dimsu` wrapper");
  }
}

// --- real server lifecycle ----------------------------------------------------
async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startServerIfNeeded() {
  if (await checkHealth()) {
    log(`server already healthy at ${API_URL}`);
    serverHealthy = true;
    return;
  }
  log(`starting real server: npm run dev (health wait 60s) at ${API_URL}`);
  const serverLog = openSync(join(OUT, "server.log"), "w");
  serverProc = spawn("npm", ["run", "dev"], {
    cwd: REPO_ROOT,
    detached: true,
    env: { ...process.env },
    stdio: ["ignore", serverLog, serverLog],
  });
  serverStartedByUs = true;
  try {
    writeFileSync(join(OUT, "server.pid"), String(serverProc.pid));
  } catch {
    /* ignore */
  }
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    if (await checkHealth()) {
      serverHealthy = true;
      log("✅ server healthy");
      return;
    }
  }
  log("❌ server did not become healthy within 60s — live QA will be BLOCKED");
}

function stopServer() {
  if (serverStartedByUs && serverProc) {
    log("stopping server we started");
    killTree(serverProc, "SIGTERM");
    setTimeout(() => killTree(serverProc, "SIGKILL"), 5_000);
  }
}

function stopCaffeinate() {
  if (caffeinateProc) {
    try {
      caffeinateProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

// --- report -------------------------------------------------------------------
function readCopilotResult() {
  try {
    return JSON.parse(readFileSync(join(OUT, "copilot-qa-result.json"), "utf8"));
  } catch {
    return null;
  }
}

function parseE2eRepeat(record) {
  if (!record) return null;
  const t = record.tailText;
  const m = t.match(/(\d+)\s*\/\s*(\d+)\s+runs?\s+passed/i) || t.match(/passed\s+(\d+)\s*\/\s*(\d+)/i);
  return { raw: tail(t, 8), matched: m ? `${m[1]}/${m[2]}` : "see log" };
}

async function writeReport() {
  const endedAt = new Date();
  const copilot = readCopilotResult();
  const e2eRecord = steps.find((s) => s.name.includes("E2E repeat"));
  const e2e = parseE2eRepeat(e2eRecord);
  const liveRecords = steps.filter((s) => s.phase === "live");

  const pass = steps.filter((s) => s.status === "pass").length;
  const fail = steps.filter((s) => s.status === "fail").length;
  const timeout = steps.filter((s) => s.status === "timeout").length;
  const skipped = steps.filter((s) => s.status === "skip").length;

  // git context (read-only)
  let branch = "(unknown)";
  let commit = "(unknown)";
  let treeStatus = "(unknown)";
  try {
    const { execSync } = await import("node:child_process");
    branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const st = execSync("git status --short", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    treeStatus = st ? st : "clean";
  } catch {
    /* ignore */
  }

  const fmtDur = (ms) => `${Math.round(ms / 1000)}s`;
  const recommend =
    fail === 0 && timeout === 0
      ? serverHealthy
        ? "READY for real manual workflow testing (all automated + live checks green)."
        : "NEEDS MANUAL QA — automated suite green but live AI was NOT verified (server offline)."
      : "NOT READY — automated failures present (see below). Fix before manual workflow testing.";

  const rows = steps
    .map((s) => {
      const mark = s.status === "pass" ? "✅" : s.status === "timeout" ? "⏱" : s.status === "skip" ? "⏭️" : "❌";
      return `| ${mark} ${s.name} | ${s.status} | ${s.code ?? "-"} | ${fmtDur(s.durationMs)} | \`${s.logFile}\` |`;
    })
    .join("\n");

  const failureDetail = steps
    .filter((s) => s.status === "fail" || s.status === "timeout")
    .map((s) => `### ❌ ${s.name} (${s.status}, exit ${s.code})\n\n\`\`\`\n${s.tailText}\n\`\`\``)
    .join("\n\n");

  const report = `# IIVO Glass — Overnight QA Report

- **Start:** ${startedAt.toISOString()}
- **End:** ${endedAt.toISOString()}
- **Duration:** ${fmtDur(endedAt - startedAt)}
- **Branch / commit:** \`${branch}\` @ \`${commit}\`
- **Working tree:** ${treeStatus === "clean" ? "clean" : "DIRTY (see below)"}
- **Server:** ${serverHealthy ? `REAL (live AI) @ ${API_URL}` : "STUB only (real server unavailable)"}
- **Commands run:** ${steps.length}
- **Totals:** ✅ ${pass} pass · ❌ ${fail} fail · ⏱ ${timeout} timeout · ⏭️ ${skipped} skipped

## Recommendation
**${recommend}**

## Command results
| Step | Status | Exit | Duration | Log |
|------|--------|------|----------|-----|
${rows}

## Counted automated assertions
- **Copilot/journey QA:** ${copilot ? `${copilot.passed}/${copilot.total} assertions passed` : "(result file missing)"}
- **E2E repeat:** ${e2e ? e2e.matched : "(not run)"}
${copilot && copilot.failures && copilot.failures.length ? `- Copilot failures:\n${copilot.failures.map((f) => `  - ${f}`).join("\n")}` : ""}

## Live AI
${
  serverHealthy
    ? liveRecords.length
      ? liveRecords.map((r) => `- ${r.status === "pass" ? "✅" : "❌"} ${r.name} (${fmtDur(r.durationMs)})`).join("\n")
      : "- (no live steps recorded)"
    : "- BLOCKED: real server never became healthy. Live answers, real GPT route, and stub-rejection were NOT proven this run."
}

## Coverage map
- **Copilot behavior (off/passive/coaching/diagnostic, backoff, decisions, debrief):** ${copilot ? "covered (deterministic)" : "unknown"}
- **Session type detection (9 types + mixed) + semantic refine gating:** ${copilot ? "covered" : "unknown"}
- **Diagnostic root-cause (approval-gated, no Council):** ${copilot ? "covered" : "unknown"}
- **Visual ask / retention / privacy (no base64, no silent upload):** ${copilot ? "covered" : "unknown"}
- **Setup/status grid (online/offline, vision/stt, mic-not-on-launch, system audio not green):** ${copilot ? "covered" : "unknown"}
- **Electron stability:** see E2E repeat result above.
- **Open in IIVO handoff (user action only, summary payload):** ${copilot ? "covered" : "unknown"}

## What failed
${failureDetail || "Nothing failed."}

${treeStatus !== "clean" ? `## Dirty working tree\n\`\`\`\n${treeStatus}\n\`\`\`` : ""}

## What was stubbed vs live
- **Stub (deterministic):** all unit suites, Copilot QA, journeys A–D, E2E repeat (Electron + stub server).
- **Live (real GPT):** ${serverHealthy ? "glass:qa:live + glass:e2e:live (3×)" : "NONE this run (server offline)"}.

## Still requires HUMAN manual QA (cannot be proven overnight)
- Real packaged **Screen Recording** visual ask (real macOS TCC).
- Real **microphone** voice dictation.
- Real **BlackHole / system audio** with YouTube / audio playback signal.
- Real **Session Copilot** while actually watching / working.
- Subjective **overlay click-through** feel.
- Whether the **answers are genuinely useful** in your real workflow.
- Whether it **feels ready for Voice Mode** next.

## Notes
- This runner does not commit anything. Any safe fixes are left as working-tree changes for review.
- Per-command full logs are in \`${LOGS}\`. Server log: \`${join(OUT, "server.log")}\`.
`;

  writeFileSync(join(OUT, "REPORT.md"), report);
  try {
    copyFileSync(join(OUT, "REPORT.md"), join(GLASS_ROOT, "OVERNIGHT_QA_REPORT.md"));
  } catch {
    /* ignore */
  }

  // Final console summary.
  console.log("\n" + "#".repeat(64));
  console.log(`# OVERNIGHT QA COMPLETE — ${pass} pass, ${fail} fail, ${timeout} timeout`);
  console.log(`# Server: ${serverHealthy ? "REAL/live" : "STUB only"}`);
  console.log(`# Copilot assertions: ${copilot ? `${copilot.passed}/${copilot.total}` : "n/a"}`);
  console.log(`# E2E repeat: ${e2e ? e2e.matched : "n/a"}`);
  console.log(`# Recommendation: ${recommend}`);
  console.log(`# Report: ${join(OUT, "REPORT.md")}`);
  console.log("#".repeat(64));
}

// --- step definitions ---------------------------------------------------------
// Quick env/guard checks (Phase 2) — non-critical, short timeout.
const ENV_STEPS = [
  { name: "Phase2: git status", file: "01-git-status.log", command: "git", args: ["status", "--short"], timeoutMs: 2 * MIN, phase: "env" },
  { name: "Phase2: git log", file: "02-git-log.log", command: "git", args: ["log", "--oneline", "-12"], timeoutMs: 2 * MIN, phase: "env" },
  { name: "Phase2: wip status", file: "03-wip-status.log", command: "npm", args: ["run", "glass:wip:status"], timeoutMs: 3 * MIN, phase: "env" },
  { name: "Phase2: git guard", file: "04-git-guard.log", command: "npm", args: ["run", "glass:git:guard"], timeoutMs: 3 * MIN, phase: "env" },
  { name: "Phase2: git guard all", file: "05-git-guard-all.log", command: "npm", args: ["run", "glass:git:guard:all"], timeoutMs: 3 * MIN, phase: "env" },
];

// Baseline validation (Phase 4) — 10 min each.
const BASELINE_STEPS = [
  { name: "Phase4: validate clean (strict)", file: "10-validate-clean.log", command: "npm", args: ["run", "glass:validate:clean", "--", "--strict"], timeoutMs: 10 * MIN },
  { name: "Phase4: glass typecheck", file: "11-glass-typecheck.log", command: "npm", args: ["run", "glass:typecheck"], timeoutMs: 10 * MIN },
  { name: "Phase4: glass build", file: "12-glass-build.log", command: "npm", args: ["run", "glass:build"], timeoutMs: 10 * MIN },
  { name: "Phase4: glass test", file: "13-glass-test.log", command: "npm", args: ["run", "glass:test"], timeoutMs: 10 * MIN },
  { name: "Phase4: glass qa auto", file: "14-glass-qa-auto.log", command: "npm", args: ["run", "glass:qa:auto"], timeoutMs: 10 * MIN },
  { name: "Phase4: test glass-ask", file: "15-test-glass-ask.log", command: "npm", args: ["run", "test:glass-ask"], timeoutMs: 10 * MIN },
  { name: "Phase4: root typecheck", file: "16-typecheck.log", command: "npm", args: ["run", "typecheck"], timeoutMs: 10 * MIN },
  { name: "Phase4: root build", file: "17-build.log", command: "npm", args: ["run", "build"], timeoutMs: 10 * MIN },
  { name: "Phase4: test lens", file: "18-test-lens.log", command: "npm", args: ["run", "test:lens"], timeoutMs: 10 * MIN },
  { name: "Phase4: test context-guard", file: "19-test-context-guard.log", command: "npm", args: ["run", "test:context-guard"], timeoutMs: 10 * MIN },
  { name: "Phase4: test routing", file: "20-test-routing.log", command: "npm", args: ["run", "test:routing"], timeoutMs: 10 * MIN },
  { name: "Phase4: test response-contracts", file: "21-test-response-contracts.log", command: "npm", args: ["run", "test:response-contracts"], timeoutMs: 10 * MIN },
  { name: "Phase4: test execution-mode", file: "22-test-execution-mode.log", command: "npm", args: ["run", "test:execution-mode"], timeoutMs: 10 * MIN },
  { name: "Phase4: test daily-friction", file: "23-test-daily-friction.log", command: "npm", args: ["run", "test:daily-friction"], timeoutMs: 10 * MIN },
  { name: "Phase4: test followup", file: "24-test-followup.log", command: "npm", args: ["run", "test:followup"], timeoutMs: 10 * MIN },
];

// Copilot + journeys (Phase 7/8) — deterministic.
const COPILOT_STEP = {
  name: "Phase7/8: Copilot + journeys QA",
  file: "30-copilot-overnight-qa.log",
  command: "npm",
  args: ["run", "glass:qa:copilot:overnight"],
  timeoutMs: 5 * MIN,
};

// E2E stress (Phase 5) — invoke the script directly so the "10" arg passes
// cleanly through the npm nesting. 60 min ceiling.
const E2E_STEP = {
  name: "Phase5: E2E repeat 10",
  file: "31-e2e-repeat-10.log",
  command: "node",
  args: ["scripts/glass-e2e-repeat.mjs", "10"],
  cwd: GLASS_ROOT,
  timeoutMs: 60 * MIN,
};

// Live AI (Phase 6) — only when the real server is healthy.
const LIVE_STEPS = [
  { name: "Phase6: live QA (qa:live)", file: "40-qa-live.log", command: "npm", args: ["run", "glass:qa:live"], timeoutMs: 10 * MIN, phase: "live" },
  { name: "Phase6: live E2E #1", file: "41-e2e-live-1.log", command: "npm", args: ["run", "glass:e2e:live"], timeoutMs: 10 * MIN, phase: "live" },
  { name: "Phase6: live E2E #2", file: "42-e2e-live-2.log", command: "npm", args: ["run", "glass:e2e:live"], timeoutMs: 10 * MIN, phase: "live" },
  { name: "Phase6: live E2E #3", file: "43-e2e-live-3.log", command: "npm", args: ["run", "glass:e2e:live"], timeoutMs: 10 * MIN, phase: "live" },
];

function recordSkip(def, reason) {
  steps.push({ name: def.name, phase: def.phase ?? "", status: "skip", code: null, durationMs: 0, critical: false, logFile: "(skipped)", tailText: reason });
  log(`⏭️ SKIP ${def.name} — ${reason}`);
}

// Smoke mode: verify runner mechanics (timeout, tree-kill, report) fast,
// without the multi-hour suite or starting the server.
const SMOKE = process.env.GLASS_OVERNIGHT_SMOKE === "1";

async function runSmoke() {
  log("SMOKE MODE — validating runner mechanics only");
  await runStep({ name: "smoke: passing step", file: "smoke-pass.log", command: "node", args: ["-e", "console.log('ok')"], timeoutMs: 30_000 });
  await runStep({ name: "smoke: failing step", file: "smoke-fail.log", command: "node", args: ["-e", "process.exit(3)"], timeoutMs: 30_000 });
  await runStep({ name: "smoke: timeout+treekill", file: "smoke-timeout.log", command: "node", args: ["-e", "setInterval(()=>{},1000)"], timeoutMs: 3_000 });
  await writeReport();
}

// --- main ---------------------------------------------------------------------
async function main() {
  log(`IIVO Glass overnight QA starting · repo ${REPO_ROOT}`);
  startCaffeinate();

  if (SMOKE) {
    await runSmoke();
    return;
  }

  // Phase 2 — environment / guards (continue regardless).
  for (const def of ENV_STEPS) await runStep(def);

  // Phase 3 — start real server (best effort).
  await startServerIfNeeded();

  // Phase 4 — baseline validation.
  for (const def of BASELINE_STEPS) await runStep(def);

  // Phase 7/8 — Copilot + journeys.
  await runStep(COPILOT_STEP);

  // Phase 5 — E2E stress.
  await runStep(E2E_STEP);

  // Phase 6 — live AI (only if healthy).
  if (serverHealthy) {
    for (const def of LIVE_STEPS) await runStep(def);
  } else {
    for (const def of LIVE_STEPS) recordSkip(def, "real server offline — live AI not verified");
  }

  await writeReport();
}

let exiting = false;
async function shutdown(reason) {
  if (exiting) return;
  exiting = true;
  log(`shutting down (${reason})`);
  stopServer();
  stopCaffeinate();
}

process.on("SIGINT", async () => {
  await shutdown("SIGINT");
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await shutdown("SIGTERM");
  process.exit(143);
});

main()
  .then(async () => {
    await shutdown("done");
    const hardFail = steps.some((s) => s.status === "fail" || s.status === "timeout");
    process.exit(hardFail ? 1 : 0);
  })
  .catch(async (err) => {
    log(`fatal: ${err?.stack || err}`);
    try {
      await writeReport();
    } catch {
      /* ignore */
    }
    await shutdown("fatal");
    process.exit(1);
  });
