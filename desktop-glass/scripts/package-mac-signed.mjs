#!/usr/bin/env node
/**
 * Signed + notarized macOS package for IIVO Glass.
 *
 * Bridges APPLE_ID_PASSWORD → APPLE_APP_SPECIFIC_PASSWORD for electron-builder v26.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glassRoot = path.resolve(__dirname, "..");

const appleId = process.env.APPLE_ID?.trim() || "incawgnito.x@gmail.com";
const teamId = process.env.APPLE_TEAM_ID?.trim() || "3WRBTRX524";
const appPassword =
  process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim() || process.env.APPLE_ID_PASSWORD?.trim();

const env = {
  ...process.env,
  APPLE_ID: appleId,
  APPLE_TEAM_ID: teamId,
};
if (appPassword) {
  env.APPLE_APP_SPECIFIC_PASSWORD = appPassword;
}

console.log(`[glass:signed] APPLE_ID=${appleId}`);
console.log(`[glass:signed] APPLE_TEAM_ID=${teamId}`);
if (appPassword) {
  console.log("[glass:signed] Notary credentials loaded (password not logged).");
} else {
  console.log(
    "[glass:signed] No APPLE_ID_PASSWORD — signing only (notarize manually with xcrun notarytool).",
  );
}

const build = spawnSync("npm", ["run", "build"], { cwd: glassRoot, stdio: "inherit", env });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const pack = spawnSync(
  "npx",
  ["electron-builder", "--mac", "--config", "electron-builder.signed.yml"],
  { cwd: glassRoot, stdio: "inherit", env },
);
if (pack.status !== 0) {
  process.exit(pack.status ?? 1);
}

const manifest = spawnSync("node", ["scripts/write-glass-update-manifest.mjs"], {
  cwd: glassRoot,
  stdio: "inherit",
  env,
});
process.exit(manifest.status ?? 0);
