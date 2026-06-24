#!/usr/bin/env node
/**
 * node-pty ships spawn-helper without the executable bit on some installs (npm hoisting,
 * asar unpack, etc.). Without +x, pty.spawn fails with "posix_spawnp failed".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const roots = [
  path.resolve(__dirname, "../../node_modules/node-pty"),
  path.resolve(__dirname, "../node_modules/node-pty"),
];

function chmodHelper(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const mode = fs.statSync(filePath).mode;
  if ((mode & 0o111) !== 0) return false;
  fs.chmodSync(filePath, mode | 0o755);
  return true;
}

let fixed = 0;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const prebuilds = path.join(root, "prebuilds");
  if (fs.existsSync(prebuilds)) {
    for (const platformDir of fs.readdirSync(prebuilds)) {
      const helper = path.join(prebuilds, platformDir, "spawn-helper");
      if (chmodHelper(helper)) fixed += 1;
    }
  }
  const built = path.join(root, "build", "Release", "spawn-helper");
  if (chmodHelper(built)) fixed += 1;
}

if (fixed > 0) {
  console.log(`[fix-node-pty] marked ${fixed} spawn-helper binary(ies) executable`);
}
