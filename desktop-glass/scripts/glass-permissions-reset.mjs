#!/usr/bin/env node
/**
 * Print or run macOS TCC reset commands for IIVO Glass (com.iivo.glass).
 *
 * Usage:
 *   npm run glass:permissions:reset
 *   npm run glass:permissions:reset -- --yes
 */

import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const COMMANDS = [
  ["tccutil", "reset", "ScreenCapture", "com.iivo.glass"],
  ["tccutil", "reset", "Microphone", "com.iivo.glass"],
];

function printInstructions() {
  console.log(`
IIVO Glass permission reset (packaged app bundle id: com.iivo.glass)

This removes macOS Screen Recording and Microphone grants for IIVO Glass.
Use when you switched between mac-arm64 and mac-universal builds or granted
permission to the wrong .app copy.

After reset:
  1. Quit IIVO Glass completely.
  2. Open only ONE packaged build (recommended: release/mac-arm64 on Apple Silicon).
  3. Trigger Capture or a visual ask once and approve the prompt.
  4. Quit and reopen IIVO Glass.
  5. Run Setup → Capture Diagnostics to verify.

Commands to run:
  ${COMMANDS.map((c) => c.join(" ")).join("\n  ")}
`);
}

async function confirmRun(): Promise<boolean> {
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  if (!process.stdin.isTTY) {
    console.error("Not a TTY — pass --yes to run tccutil, or run the commands above manually.");
    return false;
  }
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question("Run these tccutil commands now? [y/N] ");
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  printInstructions();
  if (process.platform !== "darwin") {
    console.error("tccutil is only available on macOS.");
    process.exit(1);
  }
  if (!(await confirmRun())) {
    process.exit(0);
  }
  for (const cmd of COMMANDS) {
    console.log(`\n> ${cmd.join(" ")}`);
    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", stdio: "pipe" });
    if (result.stdout?.trim()) console.log(result.stdout.trim());
    if (result.stderr?.trim()) console.error(result.stderr.trim());
    if (result.status !== 0) {
      console.error(`Failed (exit ${result.status}). You may need to run with sudo or reset manually in System Settings.`);
      process.exit(result.status ?? 1);
    }
  }
  console.log("\nTCC reset complete. Quit IIVO Glass, reopen one packaged .app, and re-grant permissions.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
