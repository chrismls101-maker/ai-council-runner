#!/usr/bin/env node
/** Verify production-parity boot: splash completes and chrome is shown. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(root, "out/main/index.js"))) {
  console.error("FAIL: run npm run build first");
  process.exit(1);
}

const started = Date.now();
let ok = false;
let out = "";

const child = spawn("npx", ["electron", "out/main/index.js"], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, IIVO_GLASS_PROVE_BOOT: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

const onData = (chunk) => {
  const s = chunk.toString();
  out += s;
  process.stdout.write(s);
  if (s.includes("GLASS_BOOT_OK")) ok = true;
};

child.stdout.on("data", onData);
child.stderr.on("data", onData);

const timer = setTimeout(() => {
  if (!ok) {
    console.error("\nFAIL: no GLASS_BOOT_OK within 180s");
    child.kill("SIGTERM");
  }
}, 180_000);

child.on("exit", (code) => {
  clearTimeout(timer);
  if (ok) {
    console.log(`\nPASS: production-parity boot in ${Date.now() - started}ms`);
    process.exit(0);
  }
  if (!out.includes("beginGlassBootSequence") && !out.includes("splash")) {
    console.error("FAIL: boot splash may not have started");
  }
  process.exit(1);
});
