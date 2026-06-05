import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDuplicateAppWarning,
  detectGlassPackagingVariant,
  DUPLICATE_APP_WARNING,
} from "../shared/glassPackagingVariant.ts";

test("detectGlassPackagingVariant finds mac-arm64 and mac-universal paths", () => {
  assert.equal(
    detectGlassPackagingVariant(
      "/Users/me/desktop-glass/release/mac-arm64/IIVO Glass.app/Contents/MacOS/IIVO Glass",
      true,
    ),
    "mac-arm64",
  );
  assert.equal(
    detectGlassPackagingVariant(
      "/Users/me/desktop-glass/release/mac-universal/IIVO Glass.app/Contents/MacOS/IIVO Glass",
      true,
    ),
    "mac-universal",
  );
  assert.equal(detectGlassPackagingVariant("/tmp/electron", false), "dev");
});

test("buildDuplicateAppWarning when multiple bundles exist", () => {
  const warning = buildDuplicateAppWarning(
    [
      { path: "/a/mac-arm64/IIVO Glass.app" },
      { path: "/a/mac-universal/IIVO Glass.app" },
    ],
    "/a/mac-arm64/IIVO Glass.app",
  );
  assert.equal(warning, DUPLICATE_APP_WARNING);
});

test("no duplicate warning for single bundle", () => {
  assert.equal(
    buildDuplicateAppWarning([{ path: "/a/mac-arm64/IIVO Glass.app" }], "/a/mac-arm64/IIVO Glass.app"),
    undefined,
  );
});
