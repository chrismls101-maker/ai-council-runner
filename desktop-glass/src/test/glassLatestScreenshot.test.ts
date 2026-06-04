import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLatestScreenshotAskPayload,
  createLatestScreenshotState,
} from "../shared/glassLatestScreenshotAsk.ts";
import type { GlassSession } from "../shared/sessionTypes.ts";

const readNone = async () => null;

test("buildLatestScreenshotAskPayload includes contextId when upload ready", async () => {
  const latest = createLatestScreenshotState({
    displayLabel: "HDMI",
    displayId: 2,
    contextId: "ctx-abc",
    contextUploadStatus: "ready",
  });
  const payload = await buildLatestScreenshotAskPayload({
    latest,
    pendingDataUrl: undefined,
    session: null,
    readEventDataUrl: readNone,
  });
  assert.equal(payload?.contextId, "ctx-abc");
  assert.equal(payload?.imageDataUrl, undefined);
});

test("buildLatestScreenshotAskPayload falls back to pending data URL", async () => {
  const latest = createLatestScreenshotState({
    displayLabel: "Primary",
    displayId: 1,
    contextUploadStatus: "failed",
  });
  const payload = await buildLatestScreenshotAskPayload({
    latest,
    pendingDataUrl: "data:image/png;base64,abc",
    session: null,
    readEventDataUrl: readNone,
  });
  assert.equal(payload?.imageDataUrl, "data:image/png;base64,abc");
});

test("buildLatestScreenshotAskPayload undefined when no recent capture", async () => {
  const session: GlassSession = {
    id: "s1",
    title: "Test",
    status: "active",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
    insights: [],
  };
  const payload = await buildLatestScreenshotAskPayload({
    latest: undefined,
    pendingDataUrl: undefined,
    session,
    readEventDataUrl: readNone,
  });
  assert.equal(payload, undefined);
});
