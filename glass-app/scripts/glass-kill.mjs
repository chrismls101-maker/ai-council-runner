#!/usr/bin/env node
/** Kill stale Glass / electron-vite dev processes (orphan dock windows, hung preview). */
import { spawnSync } from "node:child_process";

// Do not match "glass-run-built" — that kills the launcher script itself.
// Do not match "Electron Helper" — that kills unrelated Electron apps.
const patterns = [
  "out/main/index.js",
  "electron-vite dev",
  "electron-vite preview",
  "prove-glass-run-built",
];

if (process.platform === "darwin") {
  patterns.push("IIVO Glass");
}

for (const pattern of patterns) {
  spawnSync("pkill", ["-9", "-f", pattern], { stdio: "ignore" });
}

console.log("[glass-kill] stale Glass / Electron dev processes terminated");
