import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScreenshotContextPayload,
  buildTextContextPayload,
  GLASS_CAPTURED_VIA,
} from "../shared/contextPayload.ts";

test("screenshot payload matches IIVO screenshot context contract", () => {
  const payload = buildScreenshotContextPayload({
    title: "Desktop capture",
    sourceTitle: "Figma — Home",
    capturedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(payload.type, "screenshot");
  assert.equal(payload.sourceConfidence, "screenshot");
  assert.equal(payload.lensCaptureType, "screenshot");
  assert.equal(payload.capturedVia, GLASS_CAPTURED_VIA);
  assert.equal(payload.capturedAt, "2026-01-01T00:00:00.000Z");
  assert.ok(payload.tags.includes("screenshot"));
  assert.ok(payload.contentText.length > 0);
  assert.equal(payload.pageTitle, "Figma — Home");
});

test("screenshot payload falls back to a default title", () => {
  const payload = buildScreenshotContextPayload({ title: "   " });
  assert.equal(payload.title, "IIVO Glass screen capture");
});

test("text payload uses pasted_text + user_pasted confidence", () => {
  const payload = buildTextContextPayload({
    title: "Meeting notes",
    text: "  We agreed to ship Glass v1.  ",
    kind: "transcript",
  });
  assert.equal(payload.type, "pasted_text");
  assert.equal(payload.sourceConfidence, "user_pasted");
  assert.equal(payload.contentText, "We agreed to ship Glass v1.");
  assert.ok(payload.tags.includes("transcript"));
});

test("note kind tags as note", () => {
  const payload = buildTextContextPayload({ title: "n", text: "x", kind: "note" });
  assert.ok(payload.tags.includes("note"));
});
