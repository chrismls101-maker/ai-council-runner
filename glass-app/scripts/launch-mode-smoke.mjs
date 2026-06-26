#!/usr/bin/env node
/**
 * Launch Mode smoke — automated gate for v0.8.3.
 *
 * Run: npm run launch:smoke
 *
 * Automates: typecheck, 9 wiring checks, 56+ unit tests, tombstone simulation.
 * Manual (~10 min): see LAUNCH_MANUAL_SMOKE.md or script output footer.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLASS_ROOT = join(__dirname, "..");

const LAUNCH_UNIT_TESTS = [
  "src/test/launchModeWiring.test.ts",
  "src/test/glassDatabaseStartup.test.ts",
  "src/test/freshInstallBoot.test.ts",
  "src/test/agentEventBus.test.ts",
  "src/test/agentEventBus.stress.test.ts",
  "src/test/logSanitizer.test.ts",
  "src/test/modelCallStore.test.ts",
  "src/test/terminalFixEngine.test.ts",
  "src/test/iivoServerDegradedBattle.test.ts",
  "src/test/deepgramWhisperFallback.test.ts",
  "src/test/apiKeyManagerSecurity.test.ts",
];

const PRIORITY_LABELS = [
  "P1 SQLite force-quit recovery",
  "P2 Memory enrichment",
  "P3 Agent bus crash-proofing",
  "P4 Zero-config fresh install",
  "P5 Whisper fallback",
  "P6 Tier 3 memory compounding",
  "P7 Server degraded indicator",
  "P8 Terminal Auto Fix",
  "P9 Security + session spend",
];

function run(cmd, args, label) {
  const result = spawnSync(cmd, args, {
    cwd: GLASS_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ok = result.status === 0;
  return {
    label,
    ok,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

function printSection(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(title);
  console.log("=".repeat(60));
}

const results = [];

printSection("Launch Mode Smoke — IIVO Glass v0.8.3");

// 1. Typecheck
const tc = run("npm", ["run", "typecheck"], "TypeScript");
results.push({ priority: "Global", check: "npm run typecheck", ...tc });
console.log(tc.ok ? "✅ typecheck" : "❌ typecheck");
if (!tc.ok) console.error(tc.stderr.slice(-800));

// 2. Wiring tests (9 priorities)
const wiring = run(
  "node",
  ["--experimental-strip-types", "--test", "src/test/launchModeWiring.test.ts"],
  "Launch wiring",
);
results.push({ priority: "P1–P9", check: "launchModeWiring.test.ts", ...wiring });
const wiringPass = (wiring.stdout.match(/✔/g) ?? []).length;
console.log(
  wiring.ok
    ? `✅ wiring checks (${wiringPass}/${PRIORITY_LABELS.length} priorities)`
    : `❌ wiring checks`,
);
if (!wiring.ok) console.error(wiring.stdout + wiring.stderr);

// 3. Unit test battery
const tests = run(
  "node",
  ["--experimental-strip-types", "--test", ...LAUNCH_UNIT_TESTS],
  "Launch unit tests",
);
const testMatch = tests.stdout.match(/ℹ tests (\d+)[\s\S]*?ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/);
const total = testMatch ? Number(testMatch[1]) : 0;
const passed = testMatch ? Number(testMatch[2]) : 0;
const failed = testMatch ? Number(testMatch[3]) : 1;
results.push({ priority: "P1–P9", check: "unit test battery", ...tests, total, passed, failed });
console.log(tests.ok ? `✅ unit tests (${passed}/${total})` : `❌ unit tests (${failed} failed)`);
if (!tests.ok) console.error(tests.stdout.slice(-1200));

// 4. Tombstone simulation
const tombstone = run(
  "node",
  ["--experimental-strip-types", "scripts/launch-readiness-verify.mjs"],
  "Tombstone simulation",
);
results.push({ priority: "P1", check: "tombstone simulation", ...tombstone });
console.log(tombstone.ok ? "✅ tombstone simulation (force-quit proxy)" : "❌ tombstone simulation");

// 5. Tier 3 retrieval debug (temp DB — no live userData)
const memDebug = run(
  "node",
  ["scripts/debug-memory-retrieval.mjs", "--query", "React dashboard"],
  "Tier 3 debug script",
);
results.push({ priority: "P6", check: "debug-memory-retrieval.mjs", ...memDebug });
console.log(memDebug.ok ? "✅ tier 3 debug script (embeddings + composite scores)" : "❌ tier 3 debug script");
if (!memDebug.ok) console.error(memDebug.stderr.slice(-600));

// 6. Local DB path hint
const userDb = join(homedir(), "Library", "Application Support", "IIVO Glass", "session-history.db");
const dbExists = existsSync(userDb);
console.log(dbExists ? `✅ session-history.db exists at userData` : `⚠️  session-history.db not found (fresh install or never run)`);

// Summary
printSection("AUTOMATED VERDICT");
const allAutoGreen = results.every((r) => r.ok);
if (allAutoGreen) {
  console.log("🟢 AUTOMATED GATE: PASS — safe to run manual smoke below.");
} else {
  console.log("🔴 AUTOMATED GATE: FAIL — fix failures before manual smoke.");
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`   - ${r.check}`);
  }
  process.exit(1);
}

printSection("MANUAL SMOKE (~10 min) — flip Launch → Green when all pass");
const manual = [
  ["P1", "Force-quit: npm run dev → activity → Activity Monitor kill → relaunch → recovery toast"],
  ["P2", "Memory loop: ask about your stack, then follow-up referencing prior answer"],
  ["P3", "Bus: open Dashboard → Bus dot green; run agent chain without bus death"],
  ["P4", "Fresh install: rm -rf userData → dev → Skip Sorting Hat → activation → first ask"],
  ["P5", "Voice: break Deepgram key → voice still works via Whisper, no spam errors"],
  ["P6", "Tier 3 live DB: node scripts/debug-memory-retrieval.mjs --db \"$HOME/Library/Application Support/IIVO Glass/session-history.db\" --query \"your topic\""],
  ["P7", "Server pill: block IIVO_API_URL (not Anthropic) → panel shows Server offline"],
  ["P8", "Terminal: npm run nope → auto-fix card → Run Fix in same PTY"],
  ["P9", "Spend: 2–3 asks → Dashboard session shows spend pill; no keys in logs"],
];
for (const [id, step] of manual) {
  console.log(`  [ ] ${id}: ${step}`);
}
console.log("\nWhen all [ ] are checked: Launch Mode → GREEN / v0.8.3 launch-ready.");
