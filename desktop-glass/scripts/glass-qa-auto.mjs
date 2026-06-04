#!/usr/bin/env node
/**
 * Automated IIVO Glass QA report — no GUI, permissions, or live OpenAI required.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const glassRoot = join(__dirname, "..");

function read(relPath) {
  const path = join(repoRoot, relPath);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function run(cmd, args, cwd = repoRoot) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const checks = [];

function add(id, label, pass, detail = "") {
  checks.push({ id, label, pass, detail });
}

const handlerSource = read("src/server/glass/glassAskHandler.ts");
const directSource = read("src/server/glass/glassDirectAsk.ts");
const mainSource = read("desktop-glass/src/main/index.ts");

add(
  "overlay-config",
  "Overlay layout math present",
  existsSync(join(glassRoot, "src/shared/glassLayoutMath.ts")),
);
add(
  "command-bar-config",
  "Command bar layout helper present",
  /commandBarLayoutFromDisplay/.test(read("desktop-glass/src/shared/glassLayoutMath.ts")),
);
add(
  "panel-config",
  "Panel layout helper present",
  /panelLayoutFromDisplay/.test(read("desktop-glass/src/shared/glassLayoutMath.ts")),
);
add(
  "direct-endpoint",
  "POST /api/glass/ask route present",
  /app\.post\("\/api\/glass\/ask"/.test(read("src/server/index.ts")),
);
add(
  "no-council-handler",
  "glassAskHandler excludes runCouncilFull",
  !/runCouncilFull/.test(handlerSource),
);
add(
  "direct-route",
  "glassDirectAsk returns glass_direct route",
  /routeUsed:\s*"glass_direct"/.test(directSource),
);
add(
  "no-browser-auto-open",
  "submitCommand success path does not open browser",
  (() => {
    const start = mainSource.indexOf("async function submitCommand");
    const end = mainSource.indexOf("\nasync function handleCommand", start);
    const block = end > start ? mainSource.slice(start, end) : "";
    const successBlock = block.slice(block.indexOf("try {"), block.indexOf("} catch"));
    return !/openHandoff|openExternal/.test(successBlock);
  })(),
);
add(
  "runid-handoff",
  "Web app runId query handler present",
  /useRunIdHandoff/.test(read("src/App.tsx")) && /parseRunIdParam/.test(read("src/utils/runIdHandoff.ts")),
);
add(
  "follow-mouse",
  "Follow Mouse polling module present",
  existsSync(join(glassRoot, "src/main/followMouseDisplay.ts")),
);

const glassTest = run("npm", ["run", "test", "--prefix", "desktop-glass"], repoRoot);
add("glass-unit-tests", "desktop-glass unit/smoke tests", glassTest.ok, glassTest.ok ? "pass" : glassTest.stderr.slice(0, 200));

const glassAskTest = run("npm", ["run", "test:glass-ask"], repoRoot);
add("glass-ask-tests", "test:glass-ask", glassAskTest.ok, glassAskTest.ok ? "pass" : glassAskTest.stderr.slice(0, 200));

const runIdTest = run("node", ["--experimental-strip-types", "tests/server/runIdHandoff.test.ts"], repoRoot);
add("runid-tests", "runId handoff parse tests", runIdTest.ok);

const humanOnly = [
  "macOS Screen Recording permission",
  "Microphone permission",
  "System audio loopback / virtual device",
  "Real desktop click-through feel",
  "Live OpenAI STT transcription",
  "Full visual polish / multi-monitor manual verification",
];

const passed = checks.filter((c) => c.pass).length;
const report = {
  generatedAt: new Date().toISOString(),
  summary: `${passed}/${checks.length} automated checks passed`,
  checks,
  humanOnlyRequired: humanOnly,
  commands: {
    automated: ["npm run glass:qa:auto", "npm run test:glass-ask", "npm run glass:test"],
    manual: ["npm run dev", "npm run glass:dev", "see desktop-glass/GLASS_QA.md"],
  },
};

console.log(JSON.stringify(report, null, 2));
console.log("\n--- Human-only QA still required ---");
for (const item of humanOnly) {
  console.log(`- ${item}`);
}

process.exit(passed === checks.length ? 0 : 1);
