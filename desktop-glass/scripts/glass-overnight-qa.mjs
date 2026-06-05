#!/usr/bin/env node
// IIVO Glass — multi-mode QA runner (quick / standard / deep / overnight).
//
// Modes:
//   quick     — ~3–5 min validation (NOT long-duration stress)
//   standard  — ~20–30 min stress (E2E×25, live E2E×10, copilot×5, …)
//   deep      — ~60–120 min stress (E2E×50, live E2E×25, API asks×25, …)
//   overnight — time-boxed cycles until --hours budget expires (live AI capped)
//
// Examples:
//   npm run glass:qa:overnight -- --mode quick
//   npm run glass:qa:overnight -- --mode standard
//   npm run glass:qa:overnight -- --mode deep
//   caffeinate -dimsu npm run glass:qa:overnight -- --mode overnight --hours 6
//   npm run glass:qa:overnight -- --mode overnight --minutes 2   # short time-box test
//
// Output: /tmp/iivo-glass-overnight/REPORT.md (+ desktop-glass/OVERNIGHT_QA_REPORT.md)

import { spawn, execSync } from "node:child_process";
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
const HOUR = 60 * MIN;
const API_URL = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const E2E_TESTS_PER_RUN = 27; // critical + copilot + multidisplay (live spec skipped in stub)

mkdirSync(LOGS, { recursive: true });

// --- CLI ---------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let mode = "quick";
  let hours = 6;
  let minutes = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mode" && args[i + 1]) mode = args[i + 1];
    if (args[i] === "--hours" && args[i + 1]) hours = parseFloat(args[i + 1]);
    if (args[i] === "--minutes" && args[i + 1]) minutes = parseFloat(args[i + 1]);
  }
  if (!["quick", "standard", "deep", "overnight"].includes(mode)) {
    console.error(`Unknown mode "${mode}". Use: quick | standard | deep | overnight`);
    process.exit(2);
  }
  return { mode, hours, minutes };
}

const { mode: MODE, hours: OVERNIGHT_HOURS, minutes: OVERNIGHT_MINUTES } = parseArgs();

const skipHeavyPreamble =
  MODE === "overnight" && OVERNIGHT_MINUTES != null && OVERNIGHT_MINUTES <= 5;

/** @type {Record<string, object>} */
const MODE_CONFIG = {
  quick: {
    label: "quick",
    stressTest: false,
    disclaimer: "Quick validation only — not long-duration stress.",
    intendedDuration: "3–5 minutes",
    runBaseline: true,
    runEnv: true,
    e2eRepeat: 10,
    e2eTimeoutMin: 60,
    copilotPasses: 1,
    copilotStressLoops: 0,
    visualPrivacyPasses: 1,
    setupStatusPasses: 1,
    liveQaLive: 1,
    liveE2e: 3,
    liveApiAsks: 0,
    liveApiRateLimitMs: 0,
    liveAiCap: 10,
    stopEverythingLoops: 0,
    processCleanupChecks: 1,
  },
  standard: {
    label: "standard",
    stressTest: true,
    disclaimer: null,
    intendedDuration: "20–30 minutes",
    runBaseline: true,
    runEnv: true,
    e2eRepeat: 25,
    e2eTimeoutMin: 90,
    copilotPasses: 5,
    copilotStressLoops: 5,
    visualPrivacyPasses: 5,
    setupStatusPasses: 5,
    liveQaLive: 1,
    liveE2e: 10,
    liveApiAsks: 0,
    liveApiRateLimitMs: 0,
    liveAiCap: 15,
    stopEverythingLoops: 0,
    processCleanupChecks: 2,
  },
  deep: {
    label: "deep",
    stressTest: true,
    disclaimer: null,
    intendedDuration: "60–120 minutes",
    runBaseline: true,
    runEnv: true,
    e2eRepeat: 50,
    e2eTimeoutMin: 180,
    copilotPasses: 10,
    copilotStressLoops: 35,
    visualPrivacyPasses: 10,
    setupStatusPasses: 10,
    liveQaLive: 1,
    liveE2e: 25,
    liveApiAsks: 25,
    liveApiRateLimitMs: 3000,
    liveAiCap: 50,
    stopEverythingLoops: 10,
    processCleanupChecks: 5,
  },
  overnight: {
    label: "overnight",
    stressTest: true,
    disclaimer: null,
    intendedDuration: OVERNIGHT_MINUTES != null ? `${OVERNIGHT_MINUTES} minutes (test)` : `${OVERNIGHT_HOURS} hours`,
    runBaseline: true,
    runEnv: true,
    e2eRepeatPerCycle: 1,
    e2eTimeoutMin: 15,
    copilotPasses: 0, // per-cycle instead
    copilotStressLoopsPerCycle: 1,
    visualPrivacyPassesPerCycle: 1,
    setupStatusPassesPerCycle: 1,
    liveQaLive: 1,
    liveE2ePerCycle: 0,
    liveApiAsksPerCycle: 1,
    liveApiRateLimitMs: 4000,
    liveAiCap: 75,
    stopEverythingLoopsPerCycle: 1,
    processCleanupChecksPerCycle: 1,
    criticalFailureThreshold: 3,
  },
};

const cfg = MODE_CONFIG[MODE];
const startedAt = new Date();
const timeBudgetMs =
  MODE === "overnight"
    ? OVERNIGHT_MINUTES != null
      ? OVERNIGHT_MINUTES * MIN
      : OVERNIGHT_HOURS * HOUR
    : null;

// --- global state --------------------------------------------------------------
const steps = [];
/** @type {Record<string, number>} */
const failuresByCategory = {};
/** @type {Map<string, {pass:number, fail:number}>} */
const flakyTracker = new Map();
/** @type {Record<string, number>} */
const criticalFailureStreak = {};

const stats = {
  mode: MODE,
  intendedDuration: cfg.intendedDuration,
  stressTest: cfg.stressTest,
  disclaimer: cfg.disclaimer,
  totalCommands: 0,
  totalAssertions: 0,
  e2eRepeatRuns: 0,
  e2eTestExecutions: 0,
  copilotScenarioExecutions: 0,
  copilotStressLoops: 0,
  liveAiCalls: 0,
  liveAiCap: cfg.liveAiCap,
  cyclesCompleted: 0,
  processCleanupChecks: 0,
};

let serverStartedByUs = false;
let serverProc = null;
let serverHealthy = false;
let caffeinateProc = null;
let stepCounter = 0;

function log(msg) {
  const line = `[qa:${MODE} ${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(join(OUT, "runner.log"), line + "\n");
  } catch {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function killTree(proc, signal = "SIGTERM") {
  if (!proc || proc.killed) return;
  try {
    process.kill(-proc.pid, signal);
  } catch {
    try {
      proc.kill(signal);
    } catch {
      /* gone */
    }
  }
}

function tail(text, n = 25) {
  return text.split("\n").slice(Math.max(0, text.split("\n").length - n)).join("\n");
}

function trackFlaky(name, status) {
  const e = flakyTracker.get(name) ?? { pass: 0, fail: 0 };
  if (status === "pass") e.pass += 1;
  else if (status === "fail" || status === "timeout") e.fail += 1;
  flakyTracker.set(name, e);
}

function recordCategoryFailure(category) {
  failuresByCategory[category] = (failuresByCategory[category] ?? 0) + 1;
}

function timeRemaining() {
  if (!timeBudgetMs) return Infinity;
  return timeBudgetMs - (Date.now() - startedAt.getTime());
}

function budgetExpired() {
  return timeBudgetMs != null && timeRemaining() <= 0;
}

function liveCapReached() {
  return stats.liveAiCalls >= stats.liveAiCap;
}

function nextLogFile(prefix) {
  stepCounter += 1;
  const safe = String(prefix)
    .replace(/[/\\:?*|"<>∞]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${String(stepCounter).padStart(3, "0")}-${safe}.log`;
}

function runStep({ name, file, command, args, cwd = REPO_ROOT, timeoutMs, phase = "", category = "general", meta = {} }) {
  return new Promise((resolveStep) => {
    stats.totalCommands += 1;
    const logFile = join(LOGS, file ?? nextLogFile(name));
    const fd = openSync(logFile, "w");
    const header = `# ${name}\n# ${command} ${args.join(" ")}\n# mode: ${MODE}\n# started: ${new Date().toISOString()}\n\n`;
    appendFileSync(logFile, header);
    log(`▶ ${name} (timeout ${Math.round(timeoutMs / MIN)}m)`);
    const t0 = Date.now();
    let captured = header;

    const child = spawn(command, args, {
      cwd,
      detached: true,
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
      log(`⏱ TIMEOUT ${name}`);
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
      const record = { name, phase, category, status, code, durationMs, logFile, tailText: tail(captured), ...meta };
      steps.push(record);
      trackFlaky(name, status);
      if (status !== "pass") recordCategoryFailure(category);
      const mark = status === "pass" ? "✅" : status === "timeout" ? "⏱" : "❌";
      log(`${mark} ${name} — ${status} (${Math.round(durationMs / 1000)}s)`);
      resolveStep(record);
    };

    child.on("error", (err) => {
      onData(`\n[spawn error] ${err.message}\n`);
      finish(127);
    });
    child.on("close", (code) => finish(code));
  });
}

function recordSkip(name, reason, category = "general") {
  steps.push({ name, phase: "", category, status: "skip", code: null, durationMs: 0, logFile: "(skipped)", tailText: reason });
  log(`⏭️ SKIP ${name} — ${reason}`);
}

async function runCopilotQa(pass, total) {
  const r = await runStep({
    name: `Copilot QA pass ${pass} of ${total}`,
    command: "npm",
    args: ["run", "glass:qa:copilot:overnight"],
    timeoutMs: 5 * MIN,
    category: "copilot",
    phase: "copilot",
  });
  stats.copilotScenarioExecutions += 1;
  try {
    const j = JSON.parse(readFileSync(join(OUT, "copilot-qa-result.json"), "utf8"));
    stats.totalAssertions += j.total ?? 0;
  } catch {
    /* ignore */
  }
  return r;
}

async function runCopilotStress(loops, label = "") {
  const r = await runStep({
    name: `Copilot stress${label ? ` ${label}` : ""} (${loops} loops)`,
    command: "node",
    args: ["--experimental-strip-types", "scripts/glass-copilot-stress-qa.mjs", "--loops", String(loops)],
    cwd: GLASS_ROOT,
    timeoutMs: Math.max(5, loops) * MIN,
    category: "copilot-stress",
    phase: "copilot",
  });
  stats.copilotStressLoops += loops;
  try {
    const j = JSON.parse(readFileSync(join(OUT, "copilot-stress-result.json"), "utf8"));
    stats.totalAssertions += j.total ?? 0;
  } catch {
    /* ignore */
  }
  return r;
}

async function runVisualPrivacy(pass, total) {
  return runStep({
    name: `Visual privacy pass ${pass} of ${total}`,
    command: "node",
    args: [
      "--experimental-strip-types",
      "--test",
      "src/test/glassScreenshotRetention.test.ts",
      "src/test/sessionPayload.test.ts",
      "src/test/visualAskQuality.test.ts",
      "src/test/visualImageOptimizerConfig.test.ts",
    ],
    cwd: GLASS_ROOT,
    timeoutMs: 5 * MIN,
    category: "visual-privacy",
    phase: "privacy",
  });
}

async function runSetupStatus(pass, total) {
  return runStep({
    name: `Setup status pass ${pass} of ${total}`,
    command: "node",
    args: [
      "--experimental-strip-types",
      "--test",
      "src/test/glassCapabilities.test.ts",
      "src/test/panelStatusGrid.test.ts",
      "src/test/systemAudioProbe.test.ts",
      "src/test/listeningLimit.test.ts",
    ],
    cwd: GLASS_ROOT,
    timeoutMs: 5 * MIN,
    category: "setup-status",
    phase: "setup",
  });
}

async function runE2eRepeat(count, label = "") {
  const r = await runStep({
    name: `E2E repeat ${count}${label ? ` ${label}` : ""}`,
    command: "node",
    args: ["scripts/glass-e2e-repeat.mjs", String(count)],
    cwd: GLASS_ROOT,
    timeoutMs: cfg.e2eTimeoutMin * MIN,
    category: "e2e",
    phase: "e2e",
    meta: { e2eRepeatCount: count },
  });
  stats.e2eRepeatRuns += 1;
  stats.e2eTestExecutions += count * E2E_TESTS_PER_RUN;
  return r;
}

async function runLiveE2e(n, total) {
  if (!serverHealthy || liveCapReached()) {
    recordSkip(`Live E2E ${n}/${total}`, serverHealthy ? "live AI cap reached" : "server offline", "live");
    return null;
  }
  stats.liveAiCalls += 1;
  return runStep({
    name: `Live E2E ${n}/${total}`,
    command: "npm",
    args: ["run", "glass:e2e:live"],
    timeoutMs: 10 * MIN,
    category: "live-e2e",
    phase: "live",
  });
}

async function runLiveApiAsk(n, total, prompt) {
  if (!serverHealthy || liveCapReached()) {
    recordSkip(`Live API ask ${n}/${total}`, serverHealthy ? "live AI cap reached" : "server offline", "live-api");
    return null;
  }
  if (cfg.liveApiRateLimitMs > 0 && n > 1) await sleep(cfg.liveApiRateLimitMs);
  stats.liveAiCalls += 1;
  return runStep({
    name: `Live API ask ${n}/${total}`,
    command: "node",
    args: ["scripts/glass-live-ask-once.mjs", prompt ?? `Stress ask #${n}: What is IIVO Glass? One sentence.`],
    cwd: GLASS_ROOT,
    timeoutMs: 2 * MIN,
    category: "live-api",
    phase: "live",
  });
}

async function runProcessCleanup(label = "") {
  stats.processCleanupChecks += 1;
  return runStep({
    name: `Process cleanup check${label ? ` ${label}` : ""}`,
    command: "node",
    args: [
      "-e",
      `const {execSync}=require('node:child_process');
let n=0;
try{const o=execSync('pgrep -fl "Electron.*desktop-glass" 2>/dev/null||true',{encoding:'utf8'}).trim();n=o?o.split('\\n').filter(Boolean).length:0;}catch{}
console.log('stale Electron processes:',n);
if(n>3){console.error('Too many stale Electron processes:',n);process.exit(1);}
console.log('cleanup ok');`,
    ],
    timeoutMs: 30_000,
    category: "process-cleanup",
    phase: "stability",
  });
}

// --- server / caffeinate -----------------------------------------------------
function startCaffeinate() {
  if (os.platform() !== "darwin") return;
  try {
    caffeinateProc = spawn("caffeinate", ["-dimsu"], { detached: true, stdio: "ignore" });
    caffeinateProc.unref();
    log("☕ caffeinate started");
  } catch {
    log("caffeinate unavailable");
  }
}

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
    serverHealthy = true;
    log(`server healthy at ${API_URL}`);
    return;
  }
  log("starting npm run dev (60s health wait)");
  const serverLog = openSync(join(OUT, "server.log"), "w");
  serverProc = spawn("npm", ["run", "dev"], { cwd: REPO_ROOT, detached: true, stdio: ["ignore", serverLog, serverLog] });
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
  log("❌ server not healthy — live QA BLOCKED");
}

function stopServer() {
  if (serverStartedByUs && serverProc) killTree(serverProc, "SIGTERM");
}
function stopCaffeinate() {
  if (caffeinateProc) try { caffeinateProc.kill("SIGTERM"); } catch { /* ignore */ }
}

// --- baseline / env step lists -----------------------------------------------
const ENV_STEPS = [
  { name: "git status", command: "git", args: ["status", "--short"], timeoutMs: 2 * MIN, category: "env" },
  { name: "git log", command: "git", args: ["log", "--oneline", "-12"], timeoutMs: 2 * MIN, category: "env" },
  { name: "wip status", command: "npm", args: ["run", "glass:wip:status"], timeoutMs: 3 * MIN, category: "env" },
  { name: "git guard", command: "npm", args: ["run", "glass:git:guard"], timeoutMs: 3 * MIN, category: "env" },
  { name: "git guard all", command: "npm", args: ["run", "glass:git:guard:all"], timeoutMs: 3 * MIN, category: "env" },
];

const BASELINE_STEPS = [
  { name: "validate clean", command: "npm", args: ["run", "glass:validate:clean", "--", "--strict"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "glass typecheck", command: "npm", args: ["run", "glass:typecheck"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "glass build", command: "npm", args: ["run", "glass:build"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "glass test", command: "npm", args: ["run", "glass:test"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "glass qa auto", command: "npm", args: ["run", "glass:qa:auto"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test glass-ask", command: "npm", args: ["run", "test:glass-ask"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "root typecheck", command: "npm", args: ["run", "typecheck"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "root build", command: "npm", args: ["run", "build"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test lens", command: "npm", args: ["run", "test:lens"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test context-guard", command: "npm", args: ["run", "test:context-guard"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test routing", command: "npm", args: ["run", "test:routing"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test response-contracts", command: "npm", args: ["run", "test:response-contracts"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test execution-mode", command: "npm", args: ["run", "test:execution-mode"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test daily-friction", command: "npm", args: ["run", "test:daily-friction"], timeoutMs: 10 * MIN, category: "baseline" },
  { name: "test followup", command: "npm", args: ["run", "test:followup"], timeoutMs: 10 * MIN, category: "baseline" },
];

// --- mode runners ------------------------------------------------------------
async function runQuickStandardDeep() {
  if (cfg.runEnv) {
    for (const s of ENV_STEPS) await runStep({ ...s, phase: "env" });
  }
  await startServerIfNeeded();

  if (cfg.runBaseline) {
    for (const s of BASELINE_STEPS) await runStep({ ...s, phase: "baseline" });
  }

  for (let i = 1; i <= cfg.copilotPasses; i++) {
    await runCopilotQa(i, cfg.copilotPasses);
  }

  if (cfg.copilotStressLoops > 0) {
    await runCopilotStress(cfg.copilotStressLoops);
  }

  for (let i = 1; i <= cfg.visualPrivacyPasses; i++) {
    await runVisualPrivacy(i, cfg.visualPrivacyPasses);
  }

  for (let i = 1; i <= cfg.setupStatusPasses; i++) {
    await runSetupStatus(i, cfg.setupStatusPasses);
  }

  if (cfg.e2eRepeat > 0) {
    await runE2eRepeat(cfg.e2eRepeat);
    await runProcessCleanup("after E2E");
  }

  if (serverHealthy) {
    for (let i = 1; i <= cfg.liveQaLive; i++) {
      if (liveCapReached()) break;
      stats.liveAiCalls += 3; // qa:live runs ~3 direct asks
      await runStep({
        name: `Live QA (qa:live) ${i}/${cfg.liveQaLive}`,
        command: "npm",
        args: ["run", "glass:qa:live"],
        timeoutMs: 10 * MIN,
        category: "live-qa",
        phase: "live",
      });
    }
    for (let i = 1; i <= cfg.liveE2e; i++) {
      await runLiveE2e(i, cfg.liveE2e);
    }
    for (let i = 1; i <= cfg.liveApiAsks; i++) {
      await runLiveApiAsk(i, cfg.liveApiAsks);
    }
  } else {
    recordSkip("Live QA suite", "server offline", "live");
  }

  for (let i = 0; i < (cfg.processCleanupChecks ?? 1); i++) {
    await runProcessCleanup(`final ${i + 1}`);
  }
}

async function runOvernightCycle(cycleNum) {
  log(`--- Cycle ${cycleNum} (${Math.round(timeRemaining() / MIN)}m remaining) ---`);

  if (skipHeavyPreamble) {
    await runCopilotStress(1, `cycle ${cycleNum}`);
    await runVisualPrivacy(cycleNum, "∞");
    stats.cyclesCompleted += 1;
    return "continue";
  }

  const cycleFailures = [];

  const e2e = await runE2eRepeat(cfg.e2eRepeatPerCycle, `cycle ${cycleNum}`);
  if (e2e.status !== "pass") cycleFailures.push("e2e");

  if (serverHealthy && !liveCapReached()) {
    const ask = await runLiveApiAsk(cycleNum, cfg.liveApiAsksPerCycle);
    if (ask && ask.status !== "pass") cycleFailures.push("live-api");
  }

  const stress = await runCopilotStress(cfg.copilotStressLoopsPerCycle, `cycle ${cycleNum}`);
  if (stress.status !== "pass") cycleFailures.push("copilot-stress");

  await runCopilotQa(cycleNum, "∞");

  await runVisualPrivacy(cycleNum, "∞");
  await runSetupStatus(cycleNum, "∞");

  await runProcessCleanup(`cycle ${cycleNum}`);

  stats.cyclesCompleted += 1;

  // Critical failure streak tracking per category in this cycle.
  const cats = ["e2e", "live-api", "copilot-stress"];
  for (const cat of cats) {
    if (cycleFailures.includes(cat)) {
      criticalFailureStreak[cat] = (criticalFailureStreak[cat] ?? 0) + 1;
    } else {
      criticalFailureStreak[cat] = 0;
    }
  }

  const threshold = cfg.criticalFailureThreshold ?? 3;
  for (const [cat, streak] of Object.entries(criticalFailureStreak)) {
    if (streak >= threshold) {
      log(`🛑 STOP: "${cat}" failed ${streak} consecutive cycles (threshold ${threshold})`);
      return "critical-stop";
    }
  }
  return "continue";
}

async function runOvernight() {
  if (!skipHeavyPreamble) {
    if (cfg.runEnv) {
      for (const s of ENV_STEPS) await runStep({ ...s, phase: "env" });
    }
    await startServerIfNeeded();

    if (cfg.runBaseline) {
      for (const s of BASELINE_STEPS) await runStep({ ...s, phase: "baseline" });
    }

    if (serverHealthy && cfg.liveQaLive > 0 && !liveCapReached()) {
      stats.liveAiCalls += 3;
      await runStep({
        name: "Live QA (qa:live) pre-cycle",
        command: "npm",
        args: ["run", "glass:qa:live"],
        timeoutMs: 10 * MIN,
        category: "live-qa",
        phase: "live",
      });
    }
  } else {
    log("short time-box: skipping env/baseline preamble");
    await startServerIfNeeded();
  }

  let cycle = 0;
  while (!budgetExpired()) {
    cycle += 1;
    const result = await runOvernightCycle(cycle);
    if (result === "critical-stop") break;
    if (liveCapReached()) {
      log(`Live AI cap reached (${stats.liveAiCalls}/${stats.liveAiCap}) — remaining cycles use deterministic tests only`);
    }
    // Brief cooldown between cycles.
    await sleep(2500);
  }

  if (budgetExpired()) log(`Time budget expired (${cfg.intendedDuration})`);
}

// --- report ------------------------------------------------------------------
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function flakyList() {
  const out = [];
  for (const [name, { pass, fail }] of flakyTracker) {
    if (pass > 0 && fail > 0) out.push(`${name}: ${pass} pass / ${fail} fail`);
  }
  return out;
}

async function writeReport() {
  const endedAt = new Date();
  const actualMs = endedAt - startedAt;
  const copilot = readJson(join(OUT, "copilot-qa-result.json"));

  let branch = "?";
  let commit = "?";
  let treeStatus = "?";
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const st = execSync("git status --short", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    treeStatus = st || "clean";
  } catch {
    /* ignore */
  }

  const pass = steps.filter((s) => s.status === "pass").length;
  const fail = steps.filter((s) => s.status === "fail").length;
  const timeout = steps.filter((s) => s.status === "timeout").length;
  const skipped = steps.filter((s) => s.status === "skip").length;

  const fmtDur = (ms) => {
    const s = Math.round(ms / 1000);
    if (s < 120) return `${s}s`;
    if (s < 7200) return `${Math.round(s / 60)}m ${s % 60}s`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  const stressLabel = cfg.stressTest
    ? `TRUE STRESS TEST (${MODE} mode)`
    : "Quick validation only — not long-duration stress.";

  let recommend;
  if (!cfg.stressTest) {
    recommend = "Quick validation complete. Run `--mode standard`, `--mode deep`, or `--mode overnight` for real stress coverage.";
  } else if (fail === 0 && timeout === 0) {
    recommend = serverHealthy
      ? `READY for manual workflow testing (${MODE} stress pass).`
      : `Partial pass — deterministic stress green but live AI NOT verified (server offline).`;
  } else {
    recommend = `NOT READY — ${fail} fail, ${timeout} timeout in ${MODE} mode.`;
  }

  const rows = steps
    .map((s) => {
      const mark = s.status === "pass" ? "✅" : s.status === "timeout" ? "⏱" : s.status === "skip" ? "⏭️" : "❌";
      return `| ${mark} ${s.name} | ${s.status} | ${fmtDur(s.durationMs)} | \`${s.logFile}\` |`;
    })
    .join("\n");

  const failureDetail = steps
    .filter((s) => s.status === "fail" || s.status === "timeout")
    .map((s) => `### ${s.name} (${s.status})\n\n\`\`\`\n${s.tailText}\n\`\`\``)
    .join("\n\n");

  const flaky = flakyList();
  const catLines = Object.entries(failuresByCategory)
    .map(([k, v]) => `- **${k}:** ${v}`)
    .join("\n");

  const report = `# IIVO Glass — QA Report (${MODE})

## Mode summary
| Field | Value |
|-------|-------|
| **Selected mode** | \`${MODE}\` |
| **Stress test?** | ${cfg.stressTest ? "YES — true stress" : "NO — quick validation only"} |
| **Intended duration** | ${cfg.intendedDuration} |
| **Actual duration** | ${fmtDur(actualMs)} |
| **Start** | ${startedAt.toISOString()} |
| **End** | ${endedAt.toISOString()} |
| **Branch / commit** | \`${branch}\` @ \`${commit}\` |
| **Working tree** | ${treeStatus === "clean" ? "clean" : "DIRTY"} |
| **Server** | ${serverHealthy ? `REAL @ ${API_URL}` : "offline — live BLOCKED"} |

> **${stressLabel}**

## Execution totals
| Metric | Count |
|--------|-------|
| Commands run | ${stats.totalCommands} |
| Test assertions (counted) | ${stats.totalAssertions}${copilot ? ` (+ last copilot pass ${copilot.passed}/${copilot.total})` : ""} |
| E2E repeat runs | ${stats.e2eRepeatRuns} |
| E2E test executions (est.) | ${stats.e2eTestExecutions} (~${E2E_TESTS_PER_RUN} tests × repeat count) |
| Copilot scenario runs | ${stats.copilotScenarioExecutions} |
| Copilot stress loops | ${stats.copilotStressLoops} |
| Live AI calls | ${stats.liveAiCalls} / cap ${stats.liveAiCap} |
| Overnight cycles | ${stats.cyclesCompleted} |
| Process cleanup checks | ${stats.processCleanupChecks} |
| Step results | ✅ ${pass} · ❌ ${fail} · ⏱ ${timeout} · ⏭️ ${skipped} |

## Recommendation
**${recommend}**

## Failures by category
${catLines || "None"}

## Flaky tests (pass AND fail across repeats)
${flaky.length ? flaky.map((f) => `- ${f}`).join("\n") : "None detected"}

## What this mode proves
${modeProvesText(MODE)}

## Command log
| Step | Status | Duration | Log |
|------|--------|----------|-----|
${rows}

## Failures (detail)
${failureDetail || "None"}

## Still requires manual QA
- Real packaged Screen Recording visual ask
- Real microphone voice dictation
- Real BlackHole/system audio + YouTube playback
- Session Copilot while actually watching/working
- Subjective overlay click-through feel
- Answer usefulness in real workflow
- Voice Mode readiness

Logs: \`${LOGS}\`
`;

  writeFileSync(join(OUT, "REPORT.md"), report);
  writeFileSync(join(OUT, "stats.json"), JSON.stringify({ ...stats, actualDurationMs: actualMs, steps: steps.length, pass, fail, timeout, skipped }, null, 2));
  try {
    copyFileSync(join(OUT, "REPORT.md"), join(GLASS_ROOT, "OVERNIGHT_QA_REPORT.md"));
  } catch {
    /* ignore */
  }

  console.log("\n" + "#".repeat(64));
  console.log(`# QA COMPLETE [${MODE}] — ${fmtDur(actualMs)} — ${pass} pass / ${fail} fail / ${timeout} timeout`);
  console.log(`# ${stressLabel}`);
  console.log(`# E2E executions: ~${stats.e2eTestExecutions} | Copilot runs: ${stats.copilotScenarioExecutions} | Live AI: ${stats.liveAiCalls}/${stats.liveAiCap}`);
  if (MODE === "overnight") console.log(`# Cycles: ${stats.cyclesCompleted}`);
  console.log(`# Report: ${join(OUT, "REPORT.md")}`);
  console.log("#".repeat(64));
}

function modeProvesText(m) {
  const map = {
    quick: "- Single-pass validation: baseline suites, 1× Copilot QA (177 assertions), E2E×10, live E2E×3.\n- Does NOT prove long-duration stability or flake resistance.",
    standard: "- Moderate stress: E2E×25 (~675 test executions), live E2E×10, Copilot×5, visual/privacy×5, setup/status×5.\n- Proves repeated-run stability at ~20–30 min scale.",
    deep: "- Heavy stress: E2E×50 (~1350 executions), live E2E×25, rate-limited API asks×25, Copilot stress×35 loops, lifecycle/retention/listening loops.\n- Proves 1–2 hour endurance + live AI route under load (capped).",
    overnight: "- Time-boxed cyclic stress until budget expires.\n- Each cycle: E2E repeat, live ask (capped), Copilot stress, privacy/setup checks, process cleanup.\n- Stops on 3 consecutive critical failures in same category or live AI cap.",
  };
  return map[m] ?? "";
}

// --- main --------------------------------------------------------------------
async function main() {
  log(`IIVO Glass QA · mode=${MODE} · intended=${cfg.intendedDuration} · repo=${REPO_ROOT}`);
  if (process.env.GLASS_OVERNIGHT_SMOKE === "1") {
    log("SMOKE: timeout/kill mechanics only");
    await runStep({ name: "smoke pass", command: "node", args: ["-e", "console.log('ok')"], timeoutMs: 10_000 });
    await runStep({ name: "smoke timeout", command: "node", args: ["-e", "setInterval(()=>{},999)"], timeoutMs: 2000 });
    await writeReport();
    return;
  }

  startCaffeinate();

  if (MODE === "overnight") {
    await runOvernight();
  } else {
    await runQuickStandardDeep();
  }

  await writeReport();
}

let exiting = false;
async function shutdown(reason) {
  if (exiting) return;
  exiting = true;
  log(`shutdown (${reason})`);
  stopServer();
  stopCaffeinate();
}

process.on("SIGINT", async () => {
  await shutdown("SIGINT");
  try {
    await writeReport();
  } catch {
    /* ignore */
  }
  process.exit(130);
});

main()
  .then(async () => {
    await shutdown("done");
    process.exit(steps.some((s) => s.status === "fail" || s.status === "timeout") ? 1 : 0);
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
