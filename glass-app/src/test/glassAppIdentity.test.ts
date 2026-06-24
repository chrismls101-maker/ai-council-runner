import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLASS_BUNDLE_ID,
  GLASS_PRODUCT_NAME,
  glassMenuAppName,
  glassPrivacySettingsAppLabel,
} from "../shared/glassAppIdentity.ts";

test("packaged identity constants", () => {
  assert.equal(GLASS_BUNDLE_ID, "com.iivo.glass");
  assert.equal(GLASS_PRODUCT_NAME, "IIVO Glass");
});

test("dev vs packaged menu names", () => {
  assert.equal(glassMenuAppName(true), "IIVO Glass");
  assert.match(glassMenuAppName(false), /Dev/);
});

test("privacy settings label warns in dev", () => {
  assert.equal(glassPrivacySettingsAppLabel(true), "IIVO Glass");
  assert.match(glassPrivacySettingsAppLabel(false), /Electron/);
});
