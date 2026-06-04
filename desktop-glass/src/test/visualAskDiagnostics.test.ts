import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatBytesShort,
  formatVisualAskDiagnosticsDetail,
  visualAskUserMessageForFrame,
} from "../shared/visualAskDiagnostics.ts";

test("formatBytesShort formats megabytes", () => {
  assert.match(formatBytesShort(1_200_000), /MB/);
});

test("formatVisualAskDiagnosticsDetail includes preset and frame", () => {
  const detail = formatVisualAskDiagnosticsDetail({
    phase: "analyzing",
    qualityPreset: "text",
    visualFrameMode: "center_crop",
    optimizedDimensions: { width: 1280, height: 720 },
    optimizedSizeBytes: 500_000,
    serverResult: "success",
    retentionResult: "not_saved",
  });
  assert.match(detail ?? "", /text/);
  assert.match(detail ?? "", /center crop/);
  assert.match(detail ?? "", /488/);
});

test("visualAskUserMessageForFrame uses display label", () => {
  assert.match(visualAskUserMessageForFrame("screen", "HDMI Display"), /HDMI Display/);
  assert.equal(visualAskUserMessageForFrame("active_window_crop"), "Using focused crop.");
});
