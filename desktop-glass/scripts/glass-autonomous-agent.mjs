#!/usr/bin/env node
// IIVO Glass — Autonomous Overnight Dev Agent
//
// Runs continuously while you sleep:
//   1. Runs the full test suite (npm test)
//   2. Runs TypeScript typecheck (npm run typecheck)
//   3. If failures/errors found → invokes Claude Code CLI to fix
//   4. Re-tests to verify each fix
//   5. [--visual] Builds Glass, launches it, auto-connects, inspects every panel
//   6. Updates BASELINE after clean passes
//   7. Writes a morning report of everything it did
//
// Usage:
//   node scripts/glass-autonomous-agent.mjs [--hours 8] [--interval 10]
//   node scripts/glass-autonomous-agent.mjs --hours 8 --visual        ← full visual inspection
//   caffeinate -dimsu node scripts/glass-autonomous-agent.mjs --hours 8 --visual
//
// Output:
//   /tmp/glass-agent/REPORT.md        (live, updated throughout)
//   desktop-glass/AGENT_REPORT.md     (final copy on exit)
//
// Stop anytime with Ctrl+C — report is written on exit.

import { spawn, execSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  existsSync,
  renameSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLASS_ROOT = resolve(__dirname, "..");
const WEB_ROOT = resolve(GLASS_ROOT, ".."); // ai-council-runner root

// ─── Resolve claude CLI absolute path ─────────────────────────────────────────
// When launched via `npm run agent`, PATH may not include the directory where
// `claude` is installed (e.g. ~/.npm-global/bin or ~/.nvm/versions/node/.../bin).
// We detect the absolute path at startup so spawnSync can always find it.
let CLAUDE_BIN = "claude"; // fallback
try {
  const found = execSync("which claude 2>/dev/null || true", { encoding: "utf8" }).trim();
  if (found) CLAUDE_BIN = found;
} catch (_) {
  // Try common macOS install locations
  const candidates = [
    `${process.env.HOME}/.npm-global/bin/claude`,
    `${process.env.HOME}/.local/bin/claude`,
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  for (const c of candidates) {
    if (existsSync(c)) { CLAUDE_BIN = c; break; }
  }
}

// ─── Resolve node test command from package.json ──────────────────────────────
// Running `npm test` via spawnSync loses test output because npm spawns the
// node process with stdio:inherit, bypassing our pipe. We extract the test
// command from package.json and run `node` directly instead.
const _require = createRequire(import.meta.url);
const _pkg = _require(join(GLASS_ROOT, "package.json"));
const _testCmd = (_pkg.scripts?.test ?? "").split(/\s+/);
const TEST_BIN = _testCmd[0] || "node";       // "node"
const TEST_ARGS = _testCmd.slice(1);           // ["--experimental-strip-types", "--test", ...]
const REPORT_DIR = "/tmp/glass-agent";
const REPORT_PATH = join(REPORT_DIR, "REPORT.md");
const FINAL_REPORT = join(GLASS_ROOT, "AGENT_REPORT.md");
const BASELINE_PATH = join(GLASS_ROOT, "tests", "BASELINE_v0.1.16.md");
const TASKS_FILE = join(GLASS_ROOT, "TONIGHT_TASKS.md");
const TASKS_DONE_FILE = join(GLASS_ROOT, "TONIGHT_TASKS_DONE.md");

mkdirSync(REPORT_DIR, { recursive: true });

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let hours = 8;
  let interval = 5; // minutes between cycles when all tests pass
  let maxFixes = 5;  // max Claude fix attempts per session
  let dryRun = false;
  let visual = false; // run visual inspection (build + launch + connect + inspect)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hours" && args[i + 1]) hours = parseFloat(args[i + 1]);
    if (args[i] === "--interval" && args[i + 1]) interval = parseFloat(args[i + 1]);
    if (args[i] === "--max-fixes" && args[i + 1]) maxFixes = parseInt(args[i + 1], 10);
    if (args[i] === "--dry-run") dryRun = true;
    if (args[i] === "--visual") visual = true;
  }
  return { hours, interval, maxFixes, dryRun, visual };
}

const { hours: HOURS, interval: INTERVAL_MINS, maxFixes: MAX_FIXES, dryRun: DRY_RUN, visual: VISUAL } = parseArgs();
const DEADLINE = Date.now() + HOURS * 60 * 60 * 1000;
const INTERVAL_MS = INTERVAL_MINS * 60 * 1000;
const FIX_TIMEOUT_MS = 10 * 60 * 1000; // 10 min max per Claude fix attempt

// ─── Session state ────────────────────────────────────────────────────────────

const state = {
  startTime: new Date(),
  cycles: 0,
  totalPassStreak: 0,  // consecutive all-pass cycles
  fixAttempts: 0,
  fixesSucceeded: 0,
  fixesFailed: 0,
  baselineUpdates: 0,
  events: [], // {ts, type, summary}
};

// ─── Logging ─────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function log(type, msg) {
  const line = `[${ts()}] [${type}] ${msg}`;
  console.log(line);
  appendFileSync(REPORT_PATH, line + "\n");
  state.events.push({ ts: new Date().toISOString(), type, summary: msg });
}

function logSection(title) {
  const sep = `\n${"─".repeat(60)}\n## ${title}\n${"─".repeat(60)}\n`;
  console.log(sep);
  appendFileSync(REPORT_PATH, sep);
}

// ─── TypeScript typecheck ─────────────────────────────────────────────────────

function runTypecheck(cwd = GLASS_ROOT, label = "Glass") {
  log("TYPECHECK", `Running npm run typecheck (${label})…`);
  const result = spawnSync("npm", ["run", "typecheck"], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const output = (result.stdout || "") + (result.stderr || "");
  const errorLines = output.split("\n").filter(l => l.includes("error TS"));
  const errorCount = errorLines.length;
  return { errorCount, errors: errorLines.slice(0, 20), output, clean: errorCount === 0, label };
}

// ─── Task queue runner ────────────────────────────────────────────────────────

function runTaskQueue() {
  if (!existsSync(TASKS_FILE)) return;
  if (existsSync(TASKS_DONE_FILE)) {
    log("TASKS", "TONIGHT_TASKS already completed — skipping");
    return;
  }

  const tasks = readFileSync(TASKS_FILE, "utf8");
  log("TASKS", "📋 TONIGHT_TASKS.md found — invoking Claude Code for proactive P1 work…");

  const prompt = `You are an autonomous agent working on the IIVO Glass project.
All tests are currently passing. Your job is to work through the following proactive improvement tasks IN ORDER.

GLASS ROOT: ${GLASS_ROOT}
WEB APP ROOT: ${WEB_ROOT}
WIP BRANCH: wip/glass-splash-dock-audio-panel

IMPORTANT RULES:
- Work through tasks in the order listed
- After each task: run \`cd ${GLASS_ROOT} && npm test\` — if tests drop, revert and skip to next task
- After each task: run \`cd ${GLASS_ROOT} && npm run typecheck\` — if new TS errors appear, revert
- Keep changes surgical and minimal
- If a task is too risky or unclear, document why you skipped it and move on
- Do NOT modify test assertions to hide failures — fix the source

TASK QUEUE:
${tasks}

Work through these tasks now. Document what you did and any skips in your output.`;

  const result = spawnSync(
    CLAUDE_BIN,
    [
      "--print",
      "--permission-mode", "bypassPermissions",
      "--model", "claude-sonnet-4-6",
      "--allowedTools", "Read,Edit,Write,Bash",
      "--add-dir", GLASS_ROOT,
      "--add-dir", WEB_ROOT,
      "--no-session-persistence",
      prompt,
    ],
    {
      cwd: GLASS_ROOT,
      encoding: "utf8",
      timeout: 45 * 60 * 1000, // 45 min budget for the full task queue
      env: { ...process.env },
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  const output = (result.stdout || "") + (result.stderr || "");
  const taskLogPath = join(REPORT_DIR, `tasks-${Date.now()}.txt`);
  writeFileSync(taskLogPath, `EXIT: ${result.status}\n\n${output}`);
  log("TASKS", `Task queue output saved → ${taskLogPath}`);

  if (result.status === 0) {
    log("TASKS", "✅ Task queue completed");
    // Mark as done
    renameSync(TASKS_FILE, TASKS_DONE_FILE);
    appendFileSync(REPORT_PATH, `\n## Task Queue Summary\n\n${output.slice(0, 3000)}\n`);
  } else {
    log("TASKS", `⚠️ Task queue exited with status ${result.status} — check ${taskLogPath}`);
  }
}

// ─── App builder ──────────────────────────────────────────────────────────────

function buildApp() {
  log("BUILD", "Running npm run build…");
  const result = spawnSync("npm", ["run", "build"], {
    cwd: GLASS_ROOT,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const output = (result.stdout || "") + (result.stderr || "");
  const success = result.status === 0;
  return { success, output: output.slice(-2000) };
}

// ─── Visual inspector ─────────────────────────────────────────────────────────

async function runVisualInspection() {
  try {
    const { runVisualInspection: inspect } = await import("./glass-visual-inspector.mjs");
    log("VISUAL", "Launching Glass for visual inspection…");
    const { passed, results, report } = await inspect({ headed: false, noConnect: false });
    log("VISUAL", passed ? "✅ All visual checks passed" : `❌ ${results.failed.length} visual failures`);
    appendFileSync(REPORT_PATH, "\n" + report + "\n");
    return { passed, results };
  } catch (e) {
    log("VISUAL", `Visual inspection failed to run: ${e.message}`);
    return { passed: false, results: null };
  }
}

// ─── Test runner ─────────────────────────────────────────────────────────────

function runTests() {
  log("TEST", "Running tests via node directly…");
  // NOTE: We run node directly (not `npm test`) because npm spawns its child
  // with stdio:inherit, which sends test output to the terminal and makes it
  // invisible to spawnSync's stdout/stderr capture.
  const result = spawnSync(TEST_BIN, TEST_ARGS, {
    cwd: GLASS_ROOT,
    encoding: "utf8",
    timeout: 120_000,
    stdio: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const output = (result.stdout || "") + (result.stderr || "");
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);
  const totalMatch = output.match(/# tests (\d+)/);
  const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
  const fail = failMatch ? parseInt(failMatch[1], 10) : 0;
  const total = totalMatch ? parseInt(totalMatch[1], 10) : pass + fail;
  return { pass, fail, total, output, exitCode: result.status ?? 1 };
}

// ─── Failure extractor ────────────────────────────────────────────────────────

function extractFailures(output) {
  // Extract "not ok N - ..." lines and the TAP diagnostic block after each
  const lines = output.split("\n");
  const failures = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("not ok ")) {
      if (current) failures.push(current);
      current = { header: line, details: [] };
    } else if (current) {
      if (line.startsWith("ok ") || line.startsWith("# ")) {
        failures.push(current);
        current = null;
      } else {
        current.details.push(line);
      }
    }
  }
  if (current) failures.push(current);
  // Limit to first 10 to keep prompt size manageable
  return failures.slice(0, 10).map(f => ({
    header: f.header,
    details: f.details.slice(0, 30).join("\n"),
  }));
}

// ─── Claude fix invocation ────────────────────────────────────────────────────

function callClaudeFix(failures, cycleNum) {
  if (DRY_RUN) {
    log("FIX", "[dry-run] Skipping Claude invocation");
    return { success: false, output: "(dry-run)" };
  }

  const failureText = failures
    .map((f, i) => `### Failure ${i + 1}\n${f.header}\n${f.details}`)
    .join("\n\n");

  const prompt = `You are an autonomous agent working on the IIVO Glass desktop app (an Electron + TypeScript app). All 864 tests were passing. Now some tests are failing. Your job is to fix the failing tests WITHOUT changing test assertions to match wrong behavior — fix the source code or logic that's broken.

GLASS ROOT: ${GLASS_ROOT}

FAILING TESTS (cycle ${cycleNum}):
${failureText}

RULES:
- Fix source files, not test files (unless the test itself has a genuine bug)
- Do not change test assertions to hide real failures
- Run \`cd ${GLASS_ROOT} && npm test\` to verify your fix before finishing
- Keep changes minimal and surgical
- If you cannot determine the root cause, leave the files unchanged and explain why

Fix the failing tests now.`;

  log("FIX", `Invoking Claude Code CLI at ${CLAUDE_BIN} (timeout: ${FIX_TIMEOUT_MS / 1000}s)…`);

  const result = spawnSync(
    CLAUDE_BIN,
    [
      "--print",
      "--permission-mode", "bypassPermissions",
      "--model", "claude-sonnet-4-6",
      "--allowedTools", "Read,Edit,Write,Bash",
      "--add-dir", GLASS_ROOT,
      "--no-session-persistence",
      prompt,
    ],
    {
      cwd: GLASS_ROOT,
      encoding: "utf8",
      timeout: FIX_TIMEOUT_MS,
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  const output = (result.stdout || "") + (result.stderr || "");
  const success = result.status === 0;

  // Save the fix session output
  const fixLogPath = join(REPORT_DIR, `fix-cycle${cycleNum}-${Date.now()}.txt`);
  writeFileSync(fixLogPath, `EXIT: ${result.status}\n\n${output}`);
  log("FIX", `Claude output saved → ${fixLogPath}`);

  return { success, output: output.slice(0, 2000) };
}

// ─── BASELINE updater ─────────────────────────────────────────────────────────

function updateBaseline(pass, total) {
  try {
    let content = readFileSync(BASELINE_PATH, "utf8");
    // Update test count line
    const updated = content.replace(
      /\*\*Unit \+ integration tests\*\*.*?\|.*?\|/,
      `**Unit + integration tests** | ${total} (${pass} passing, 0 failing) |`
    );
    if (updated !== content) {
      writeFileSync(BASELINE_PATH, updated, "utf8");
      state.baselineUpdates++;
      log("BASELINE", `Updated test count to ${pass}/${total}`);
    }
  } catch (e) {
    log("BASELINE", `Could not update: ${e.message}`);
  }
}

// ─── Changelog appender ───────────────────────────────────────────────────────

function appendBaselineChangelog(entries) {
  try {
    if (!entries.length) return;
    let content = readFileSync(BASELINE_PATH, "utf8");
    const today = new Date().toISOString().slice(0, 10);
    const rows = entries
      .map(e => `| ${today} | ${e} |`)
      .join("\n");
    const marker = "| Date | Change |";
    const markerIdx = content.indexOf(marker);
    if (markerIdx === -1) return;
    const afterHeader = content.indexOf("\n", markerIdx) + 1;
    // Find the separator row
    const sepEnd = content.indexOf("\n", afterHeader) + 1;
    content =
      content.slice(0, sepEnd) +
      rows + "\n" +
      content.slice(sepEnd);
    writeFileSync(BASELINE_PATH, content, "utf8");
    log("BASELINE", `Appended ${entries.length} changelog entries`);
  } catch (e) {
    log("BASELINE", `Changelog append failed: ${e.message}`);
  }
}

// ─── Morning report generator ─────────────────────────────────────────────────

function writeMorningReport() {
  const elapsed = ((Date.now() - state.startTime.getTime()) / 3600000).toFixed(1);
  const lines = [
    `# Glass Autonomous Agent — Morning Report`,
    ``,
    `**Session**: ${state.startTime.toLocaleString()} → ${new Date().toLocaleString()} (${elapsed}h)`,
    `**Cycles run**: ${state.cycles}`,
    `**Fix attempts**: ${state.fixAttempts}  |  ✅ Succeeded: ${state.fixesSucceeded}  |  ❌ Failed: ${state.fixesFailed}`,
    `**Baseline updates**: ${state.baselineUpdates}`,
    `**Visual inspections**: ✅ ${state.visualPasses ?? 0} passed  |  ❌ ${state.visualFailures ?? 0} failed`,
    ``,
    `## Timeline`,
    ``,
  ];

  for (const e of state.events) {
    const t = new Date(e.ts).toLocaleTimeString("en-US", { hour12: false });
    lines.push(`- \`${t}\` **[${e.type}]** ${e.summary}`);
  }

  lines.push(``, `---`, `*Generated by glass-autonomous-agent.mjs*`);

  const report = lines.join("\n");
  writeFileSync(FINAL_REPORT, report, "utf8");
  writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\n✅ Morning report written → ${FINAL_REPORT}`);
}

// ─── Preflight checks ────────────────────────────────────────────────────────
// Runs BEFORE the main loop. If any critical check fails, we exit with code 1
// and a clear message rather than silently looping for hours doing nothing.
// This prevents the "77 cycles, 0 fixes, 8 hours wasted" failure mode.

function runPreflight() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(  "║          GLASS AGENT — PREFLIGHT CHECKS                  ║");
  console.log(  "╚══════════════════════════════════════════════════════════╝\n");

  let allOk = true;

  // ── 1. Verify resolved paths ────────────────────────────────────────────────
  console.log(`  GLASS_ROOT   : ${GLASS_ROOT}`);
  console.log(`  WEB_ROOT     : ${WEB_ROOT}`);
  console.log(`  CLAUDE_BIN   : ${CLAUDE_BIN}`);
  console.log(`  TEST_BIN     : ${TEST_BIN}`);
  console.log(`  TEST_ARGS[0] : ${TEST_ARGS[0] ?? "(none)"}`);
  console.log(`  Test files   : ${TEST_ARGS.filter(a => a.endsWith(".ts")).length} .ts files`);
  console.log();

  // ── 2. Verify claude CLI is callable ────────────────────────────────────────
  process.stdout.write("  [1/3] Claude CLI reachable … ");
  const claudeCheck = spawnSync(CLAUDE_BIN, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env },
  });
  if (claudeCheck.status === 0 && claudeCheck.stdout?.trim()) {
    console.log(`✅  ${claudeCheck.stdout.trim()}`);
  } else {
    const err = claudeCheck.stderr?.trim() || claudeCheck.error?.message || "unknown error";
    console.log(`❌  FAILED — ${err}`);
    console.log(`\n  ► Claude CLI not found at: ${CLAUDE_BIN}`);
    console.log(`  ► Fix: run 'which claude' in your shell and set CLAUDE_PATH env var,`);
    console.log(`           or install via: npm install -g @anthropic-ai/claude-code\n`);
    allOk = false;
  }

  // ── 3. Verify test output is captured (not 0/0) ─────────────────────────────
  process.stdout.write("  [2/3] Test output capture … ");
  // Run just the first test file to keep this fast (< 5s)
  const firstTestFile = TEST_ARGS.find(a => a.endsWith(".ts"));
  const sampleArgs = TEST_ARGS.filter(a => !a.endsWith(".ts")).concat(firstTestFile ? [firstTestFile] : []);
  const testCheck = spawnSync(TEST_BIN, sampleArgs, {
    cwd: GLASS_ROOT,
    encoding: "utf8",
    timeout: 30_000,
    stdio: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const testOut = (testCheck.stdout || "") + (testCheck.stderr || "");
  const passMatch = testOut.match(/# pass (\d+)/);
  if (passMatch && parseInt(passMatch[1], 10) > 0) {
    console.log(`✅  captured (${passMatch[1]} tests from sample file)`);
  } else if (testOut.includes("# tests")) {
    console.log(`⚠️   output captured but pass count is 0 — check test file`);
    // Not fatal — maybe the sample test has 0 tests (unlikely but possible)
  } else {
    console.log(`❌  FAILED — test output not captured (got: ${testOut.slice(0, 120).replace(/\n/g, " ")})`);
    console.log(`\n  ► The agent cannot track pass/fail counts — it will loop forever doing nothing.`);
    console.log(`  ► Fix: verify node version supports --experimental-strip-types\n`);
    allOk = false;
  }

  // ── 4. Typecheck quick scan ─────────────────────────────────────────────────
  process.stdout.write("  [3/3] TypeScript errors … ");
  const tcCheck = spawnSync("npm", ["run", "typecheck"], {
    cwd: GLASS_ROOT,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const tcOut = (tcCheck.stdout || "") + (tcCheck.stderr || "");
  const tsErrors = tcOut.split("\n").filter(l => l.includes("error TS")).length;
  if (tsErrors === 0) {
    console.log(`✅  0 TypeScript errors`);
  } else {
    console.log(`⚠️   ${tsErrors} TypeScript error(s) — agent will attempt to fix these`);
    // Not fatal — this is the agent's job to fix
  }

  // ── Result ──────────────────────────────────────────────────────────────────
  console.log();
  if (!allOk) {
    console.error("╔══════════════════════════════════════════════════════════╗");
    console.error("║  ❌ PREFLIGHT FAILED — agent will NOT start              ║");
    console.error("║  Fix the errors above and re-run.                        ║");
    console.error("╚══════════════════════════════════════════════════════════╝\n");
    process.exit(1);
  }

  console.log("  ✅ All preflight checks passed — starting agent loop\n");
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Shutdown handler ─────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  console.log("\n\n⚡ Interrupted — writing report before exit…");
  writeMorningReport();
  process.exit(0);
});

process.on("SIGTERM", () => {
  writeMorningReport();
  process.exit(0);
});

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  // Preflight — verify claude is callable and test output is captured BEFORE
  // starting the loop. Exits with code 1 if anything critical is broken.
  runPreflight();

  // Init report file
  writeFileSync(
    REPORT_PATH,
    `# Glass Agent — Live Log\nStarted: ${state.startTime.toLocaleString()}\nBudget: ${HOURS}h\n\n`
  );

  logSection("SESSION START");
  log("AGENT", `Budget: ${HOURS}h | Interval: ${INTERVAL_MINS}min | MaxFixes: ${MAX_FIXES}`);
  log("AGENT", `Glass root: ${GLASS_ROOT}`);
  log("AGENT", `Claude CLI: ${CLAUDE_BIN}`);
  log("AGENT", `Test command: ${TEST_BIN} ${TEST_ARGS.slice(0, 3).join(" ")} … (${TEST_ARGS.length} args total)`);
  log("AGENT", `Visual inspection: ${VISUAL ? "ON (--visual)" : "OFF (add --visual to enable)"}`);
  if (DRY_RUN) log("AGENT", "DRY RUN — Claude fix calls will be skipped");

  const changelogEntries = [];

  while (Date.now() < DEADLINE) {
    state.cycles++;
    logSection(`CYCLE ${state.cycles} — ${new Date().toLocaleTimeString()}`);

    // 1. Run TypeScript typecheck — Glass
    const tc = runTypecheck(GLASS_ROOT, "Glass");
    if (tc.clean) {
      log("TYPECHECK", `✅ Glass: No TypeScript errors`);
    } else {
      log("TYPECHECK", `❌ Glass: ${tc.errorCount} TypeScript error(s):`);
      for (const e of tc.errors.slice(0, 5)) log("TYPECHECK", `  ${e.trim()}`);
      if (!DRY_RUN && state.fixAttempts < MAX_FIXES) {
        state.fixAttempts++;
        const failures = tc.errors.map((e, i) => ({ header: `Glass TypeScript error ${i+1}`, details: e }));
        callClaudeFix(failures, state.cycles);
        const tc2 = runTypecheck(GLASS_ROOT, "Glass");
        if (tc2.clean) {
          log("TYPECHECK", `✅ Glass TypeScript errors fixed`);
          state.fixesSucceeded++;
          changelogEntries.push(`Fixed ${tc.errorCount} Glass TypeScript error(s)`);
        } else {
          log("TYPECHECK", `⚠️ ${tc2.errorCount} Glass errors remain after fix attempt`);
        }
      }
    }

    // 1b. Run TypeScript typecheck — Web App
    const tcWeb = runTypecheck(WEB_ROOT, "Web App");
    if (tcWeb.clean) {
      log("TYPECHECK", `✅ Web App: No TypeScript errors`);
    } else {
      log("TYPECHECK", `❌ Web App: ${tcWeb.errorCount} TypeScript error(s):`);
      for (const e of tcWeb.errors.slice(0, 5)) log("TYPECHECK", `  ${e.trim()}`);
      if (!DRY_RUN && state.fixAttempts < MAX_FIXES) {
        state.fixAttempts++;
        const failures = tcWeb.errors.map((e, i) => ({ header: `Web App TypeScript error ${i+1}`, details: e }));
        callClaudeFix(failures, state.cycles);
        const tcWeb2 = runTypecheck(WEB_ROOT, "Web App");
        if (tcWeb2.clean) {
          log("TYPECHECK", `✅ Web App TypeScript errors fixed`);
          state.fixesSucceeded++;
          changelogEntries.push(`Fixed ${tcWeb.errorCount} Web App TypeScript error(s)`);
        } else {
          log("TYPECHECK", `⚠️ ${tcWeb2.errorCount} Web App errors remain after fix attempt`);
        }
      }
    }

    // 2. Run tests
    const { pass, fail, total, output } = runTests();
    log("TEST", `Results: ${pass}/${total} passing, ${fail} failing`);

    // 3. Handle test failures
    if (fail > 0) {
      state.totalPassStreak = 0;

      if (state.fixAttempts >= MAX_FIXES) {
        log("AGENT", `Max fix attempts (${MAX_FIXES}) reached — logging for morning review`);
        const failures = extractFailures(output);
        log("AGENT", `Unresolved failures:\n${failures.map(f => "  • " + f.header).join("\n")}`);
        break;
      }

      const failures = extractFailures(output);
      log("FIX", `Found ${failures.length} failures to fix:`);
      for (const f of failures) log("FIX", `  • ${f.header.trim()}`);

      state.fixAttempts++;
      const { success, output: fixOut } = callClaudeFix(failures, state.cycles);

      // 3. Re-test after fix attempt
      const { pass: pass2, fail: fail2, total: total2 } = runTests();
      log("TEST", `Post-fix: ${pass2}/${total2} passing, ${fail2} failing`);

      if (fail2 === 0) {
        state.fixesSucceeded++;
        log("FIX", `✅ All tests passing after fix (fix attempt ${state.fixAttempts})`);
        changelogEntries.push(
          `Autonomous agent fixed ${fail} test failure(s) — ${failures[0]?.header?.slice(0, 80) ?? "unknown"}`
        );
        updateBaseline(pass2, total2);
      } else if (fail2 < fail) {
        log("FIX", `⚠️  Partial fix: ${fail - fail2} failures resolved, ${fail2} remain`);
        // Continue to next cycle to attempt more fixes
      } else {
        state.fixesFailed++;
        log("FIX", `❌ Fix attempt did not resolve failures — will retry next cycle`);
      }

    } else {
      // All tests pass
      state.totalPassStreak++;
      log("TEST", `✅ All ${total} tests passing (streak: ${state.totalPassStreak})`);

      // Update baseline count if it drifted
      updateBaseline(pass, total);

      // Proactive task queue — run once on first clean pass
      if (state.totalPassStreak === 1) {
        logSection("PROACTIVE TASKS");
        runTaskQueue();
        // Re-test after task queue (it may have added new tests or changed code)
        const { pass: passQ, fail: failQ, total: totalQ } = runTests();
        log("TEST", `Post-task-queue: ${passQ}/${totalQ} passing, ${failQ} failing`);
        if (failQ > 0) {
          log("TASKS", "⚠️ Task queue introduced test failures — will fix in next cycle");
          state.totalPassStreak = 0;
        }
      }

      // Visual inspection — run on first clean pass and every 3rd streak after that
      if (VISUAL && (state.totalPassStreak === 1 || state.totalPassStreak % 3 === 0)) {
        logSection(`VISUAL INSPECTION — Cycle ${state.cycles}`);
        // Build first so the app is fresh
        const { success: built } = buildApp();
        if (built) {
          log("BUILD", `✅ App built successfully`);
          const { passed: visualOk, results: vr } = await runVisualInspection();
          if (visualOk) {
            state.visualPasses = (state.visualPasses ?? 0) + 1;
          } else {
            state.visualFailures = (state.visualFailures ?? 0) + 1;
            if (vr?.failed?.length) {
              log("VISUAL", `Failures: ${vr.failed.map(f => f.label).join(", ")}`);
            }
          }
        } else {
          log("BUILD", `❌ Build failed — skipping visual inspection`);
          state.fixAttempts++;
          // Let Claude fix build errors next cycle
        }
      }

      // After a clean pass streak, sleep longer
      const sleepMs = state.totalPassStreak > 1 ? INTERVAL_MS : 30_000;
      const sleepMin = (sleepMs / 60_000).toFixed(1);
      log("AGENT", `Sleeping ${sleepMin}min before next cycle…`);
      await sleep(sleepMs);
    }
  }

  // Finalize
  logSection("SESSION END");
  if (changelogEntries.length > 0) {
    appendBaselineChangelog(changelogEntries);
  }
  log("AGENT", `Session complete. Cycles: ${state.cycles} | Fixes: ${state.fixesSucceeded} succeeded, ${state.fixesFailed} failed`);
  writeMorningReport();
}

main().catch(err => {
  console.error("Agent crashed:", err);
  writeMorningReport();
  process.exit(1);
});
