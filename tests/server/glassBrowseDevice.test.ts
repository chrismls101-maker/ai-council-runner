import assert from "node:assert/strict";
import test from "node:test";
import { detectGlassBrowseDevice, isGlassBrowseMobile } from "../../src/components/glass-landing/glassBrowseDevice.ts";

test("detectGlassBrowseDevice breakpoints", () => {
  assert.equal(detectGlassBrowseDevice(1200), "desktop");
  assert.equal(detectGlassBrowseDevice(900), "desktop");
  assert.equal(detectGlassBrowseDevice(768), "tablet");
  assert.equal(detectGlassBrowseDevice(600), "tablet");
  assert.equal(detectGlassBrowseDevice(390), "phone");
});

test("isGlassBrowseMobile", () => {
  assert.equal(isGlassBrowseMobile("desktop"), false);
  assert.equal(isGlassBrowseMobile("tablet"), true);
  assert.equal(isGlassBrowseMobile("phone"), true);
});
