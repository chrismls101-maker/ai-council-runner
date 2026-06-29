#!/usr/bin/env node
/**
 * Bundle the Electron main process with esbuild.
 *
 * Vite 8 / Rolldown SSR lib mode currently emits a 0-byte out/main/index.js while
 * splitting dynamic imports into orphan chunks — Electron then starts with no code.
 * esbuild produces a working single-file main bundle (node_modules stay external).
 */
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";
import * as esbuild from "esbuild";
import { loadEnv } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "src/main/index.ts");
const outfile = join(root, "out/main/index.js");
const envMode = process.env.NODE_ENV === "production" ? "production" : "development";
const repoRootEnv = loadEnv(envMode, join(root, ".."), "");

function resolveBuildGlassApiSecret() {
  return (
    process.env.IIVO_GLASS_API_SECRET?.trim()
    || repoRootEnv.IIVO_GLASS_API_SECRET?.trim()
    || ""
  );
}

function resolveBuildSentryDsn() {
  return process.env.SENTRY_DSN?.trim() || repoRootEnv.SENTRY_DSN?.trim() || "";
}

const external = [
  "electron",
  "typescript",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  external,
  packages: "external",
  logLevel: "info",
  define: {
    "process.env.IIVO_GLASS_API_SECRET": JSON.stringify(resolveBuildGlassApiSecret()),
    "process.env.SENTRY_DSN": JSON.stringify(resolveBuildSentryDsn()),
  },
});

const bytes = statSync(outfile).size;
if (bytes < 10_000) {
  console.error(`[build-main-esbuild] FAIL: ${outfile} is only ${bytes} bytes`);
  process.exit(1);
}
console.log(`[build-main-esbuild] OK: ${outfile} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
