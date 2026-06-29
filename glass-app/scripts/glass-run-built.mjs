#!/usr/bin/env node
/**
 * Launch Glass the same way the packaged DMG does:
 * built main + built renderer (loadFile), boot splash, macOS panel windows.
 * Not electron-vite dev — that path uses Vite URLs and different window behavior.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainJs = join(root, "out/main/index.js");
const splashHtml = join(root, "out/renderer/splash.html");
const dockHtml = join(root, "out/renderer/index.html");

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".css", ".html"];

function maxMtimeUnder(dir, max = 0) {
  if (!existsSync(dir)) return max;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      max = maxMtimeUnder(path, max);
      continue;
    }
    if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      max = Math.max(max, statSync(path).mtimeMs);
    }
  }
  return max;
}

function isOutStale(outPath, srcRelDirs) {
  if (!existsSync(outPath)) return true;
  const builtAt = statSync(outPath).mtimeMs;
  let srcMax = 0;
  for (const rel of srcRelDirs) {
    srcMax = Math.max(srcMax, maxMtimeUnder(join(root, rel)));
  }
  return srcMax > builtAt;
}

function killStaleGlass() {
  if (process.platform !== "darwin") return;
  spawnSync("node", ["scripts/glass-kill.mjs"], { cwd: root, stdio: "ignore" });
}

function needsBuild() {
  if (!existsSync(mainJs) || !existsSync(splashHtml) || !existsSync(dockHtml)) {
    return true;
  }
  if (isOutStale(mainJs, ["src/main", "src/shared"])) {
    return true;
  }
  if (isOutStale(dockHtml, ["src/renderer", "src/preload", "src/shared"])) {
    return true;
  }
  return false;
}

killStaleGlass();

if (needsBuild()) {
  console.log("[glass-run-built] building (missing or stale out/)…");
  const build = spawnSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_RENDERER_URL;
// Match glass:dev:vite — skip activation gate so dock + strip appear immediately in dev.
env.IIVO_GLASS_DEV_PRIMARY = env.IIVO_GLASS_DEV_PRIMARY ?? "1";

console.log(
  `[glass-run-built] starting Glass (built bundle, devPrimary=${env.IIVO_GLASS_DEV_PRIMARY ?? "0"})`,
);
const child = spawn("npx", ["electron", "out/main/index.js"], {
  cwd: root,
  env,
  stdio: "inherit",
});

function shutdownChild() {
  if (!child.killed) child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 2000);
}

process.on("SIGINT", shutdownChild);
process.on("SIGTERM", shutdownChild);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
