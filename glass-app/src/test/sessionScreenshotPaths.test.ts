import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDataUrl,
  sessionScreenshotPaths,
} from "../shared/sessionScreenshotPaths.ts";
import {
  buildScreenshotThumbnailUrl,
  sanitizeSessionId,
} from "../shared/sessionScreenshotUrls.ts";

test("sanitizeSessionId strips unsafe characters", () => {
  assert.equal(sanitizeSessionId("abc-123"), "abc-123");
  assert.equal(sanitizeSessionId("bad/id!"), "bad_id_");
});

test("sessionScreenshotPaths builds safe paths under userData", () => {
  const paths = sessionScreenshotPaths("/tmp/user", "sess-1", "evt-2");
  assert.match(paths.fullPath, /session-screenshots\/sess-1\/evt-2\.png$/);
  assert.match(paths.thumbnailPath, /evt-2\.thumb\.png$/);
  assert.equal(paths.dir, "/tmp/user/session-screenshots/sess-1");
});

test("parseDataUrl decodes base64 PNG buffer", () => {
  const png = Buffer.from("hello");
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const parsed = parseDataUrl(dataUrl);
  assert.ok(parsed);
  assert.equal(parsed!.mimeType, "image/png");
  assert.equal(parsed!.buffer.toString(), "hello");
});

test("buildScreenshotThumbnailUrl uses custom protocol", () => {
  assert.equal(
    buildScreenshotThumbnailUrl("sess-1", "evt-2"),
    "glass-screenshot://sess-1/evt-2.thumb.png",
  );
});

test("parseDataUrl returns null for invalid input", () => {
  assert.equal(parseDataUrl("not-a-data-url"), null);
});
