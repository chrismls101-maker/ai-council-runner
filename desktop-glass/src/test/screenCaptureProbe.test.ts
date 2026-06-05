import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatScreenCaptureProbeDebug,
  isScreenCaptureProbeReady,
  type ScreenCaptureProbeSnapshot,
} from "../shared/screenCaptureProbe.ts";
import { preflightFailure } from "../shared/visualAskPreflight.ts";

const readySnapshot: ScreenCaptureProbeSnapshot = {
  displayId: 2,
  status: "ready",
  ready: true,
  probe: {
    kind: "screen",
    types: ["screen"],
    ok: true,
    sourceCount: 2,
    sources: [{ id: "1", name: "Display 1", displayId: "2" }],
    thumbnailEmpty: false,
  },
};

test("isScreenCaptureProbeReady requires ready status and non-empty thumbnail", () => {
  assert.equal(isScreenCaptureProbeReady(readySnapshot), true);
  assert.equal(
    isScreenCaptureProbeReady({
      ...readySnapshot,
      status: "permission_required",
      ready: false,
      probe: { ...readySnapshot.probe, thumbnailEmpty: true },
    }),
    false,
  );
});

test("formatScreenCaptureProbeDebug includes probe fields for visual ask", () => {
  const line = formatScreenCaptureProbeDebug(readySnapshot);
  assert.match(line, /preflightProbeResult=ready/);
  assert.match(line, /thumbnailEmpty=false/);
  assert.match(line, /sourceCount=2/);
  assert.match(line, /displayId=2/);
});

test("visual ask preflight failure carries screen probe snapshot", () => {
  const denied: ScreenCaptureProbeSnapshot = {
    ...readySnapshot,
    status: "permission_required",
    ready: false,
    probe: { ...readySnapshot.probe, thumbnailEmpty: true },
  };
  const fail = preflightFailure("capture_permission", "Screen blocked.", denied);
  assert.equal(fail.screenProbe?.status, "permission_required");
  assert.equal(fail.screenProbe?.probe.thumbnailEmpty, true);
});
