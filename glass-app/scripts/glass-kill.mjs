#!/usr/bin/env node
/** Kill stale Glass / electron-vite dev processes (orphan dock windows, hung preview). */
import { spawnSync } from "node:child_process";

const patterns = [
  "out/main/index.js",
  "electron-vite dev",
  "electron-vite preview",
  "glass-run-built",
  "prove-glass-run-built",
];

if (process.platform === "darwin") {
  patterns.push("IIVO Glass");
  patterns.push("Electron Helper");
}

for (const pattern of patterns) {
  spawnSync("pkill", ["-9", "-f", pattern], { stdio: "ignore" });
}

console.log("[glass-kill] stale Glass / Electron dev processes terminated");
