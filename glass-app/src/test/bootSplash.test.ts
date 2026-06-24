import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isBootSplashBundlePresent } from "../shared/bootSplash.ts";

test("boot splash disabled when splash.html is absent", () => {
  const mainDir = mkdtempSync(join(tmpdir(), "glass-main-"));
  assert.equal(isBootSplashBundlePresent(mainDir), false);
});

test("boot splash enabled when renderer splash.html exists", () => {
  const root = mkdtempSync(join(tmpdir(), "glass-root-"));
  const mainDir = join(root, "out", "main");
  const rendererDir = join(root, "out", "renderer");
  mkdirSync(mainDir, { recursive: true });
  mkdirSync(rendererDir, { recursive: true });
  writeFileSync(join(rendererDir, "splash.html"), "<html></html>");
  assert.equal(isBootSplashBundlePresent(mainDir), true);
});

test("IIVO_GLASS_BOOT_SPLASH=1 forces enable", () => {
  const prev = process.env.IIVO_GLASS_BOOT_SPLASH;
  process.env.IIVO_GLASS_BOOT_SPLASH = "1";
  try {
    assert.equal(isBootSplashBundlePresent("/nonexistent/out/main"), true);
  } finally {
    if (prev === undefined) delete process.env.IIVO_GLASS_BOOT_SPLASH;
    else process.env.IIVO_GLASS_BOOT_SPLASH = prev;
  }
});
