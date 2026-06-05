import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGlassSetupCapabilities,
  buildSystemAudioCapability,
  captureStatusFromSetup,
  formatSetupCheckSummary,
} from "../shared/glassCapabilities.ts";
import { mapSystemAudioCaptureError } from "../shared/systemAudioCapture.ts";
import {
  isSourceEnumerationFailedMessage,
  PERMISSION_JUST_GRANTED_RESTART_HINT,
  MACOS_RESTART_ONCE_HINT,
  resolveSystemAudioProbeStatus,
  buildSystemAudioProbeDetail,
  shouldShowVirtualDeviceGuidance,
} from "../shared/systemAudioProbe.ts";
import { deriveScreenCaptureStatusFromProbe } from "../shared/captureSourceEnumeration.ts";

const baseInput = {
  screenCaptureProbe: "ready" as const,
  micPermission: "not_requested" as const,
  systemAudioStatus: "not_tested" as const,
  sttStatus: "configured" as const,
  sttEnabled: true,
  serverHealth: {
    reachable: true,
    vision: { enabled: true, configured: true },
    stt: { configured: true, enabled: true },
  },
};

test("failed to get sources maps to source_enumeration_failed", () => {
  assert.equal(isSourceEnumerationFailedMessage("Failed to get sources."), true);
  const resolved = resolveSystemAudioProbeStatus({
    screenCaptureReady: true,
    enumerationError: "Failed to get sources.",
    videoSourceCount: 0,
    videoThumbnailEmpty: true,
  });
  assert.equal(resolved.status, "source_enumeration_failed");
  const mapped = mapSystemAudioCaptureError(new Error("Failed to get sources."));
  assert.equal(mapped.status, "source_enumeration_failed");
});

test("permission just granted restart guidance appears on enumeration failure", () => {
  const detail = buildSystemAudioProbeDetail("source_enumeration_failed", {
    screenCaptureReady: true,
    errorMessage: "Failed to get sources.",
  });
  assert.match(detail, /Screen Recording ready/i);
  assert.match(detail, new RegExp(PERMISSION_JUST_GRANTED_RESTART_HINT.replace(/\./g, "\\.")));
});

test("restart macOS guidance appears on enumeration failure", () => {
  const detail = buildSystemAudioProbeDetail("source_enumeration_failed", {
    screenCaptureReady: true,
    errorMessage: "Failed to get sources.",
  });
  assert.match(detail, new RegExp(MACOS_RESTART_ONCE_HINT.replace(/\./g, "\\.")));
});

test("video-only screen enumeration failure maps to screen source_enumeration_failed status", () => {
  const derived = deriveScreenCaptureStatusFromProbe({
    kind: "screen",
    types: ["screen"],
    ok: false,
    sourceCount: 0,
    sources: [],
    errorMessage: "Failed to get sources.",
  });
  assert.equal(derived.status, "source_enumeration_failed");
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    screenCaptureProbe: derived.status,
    screenCaptureDetail: derived.detail,
    systemAudioStatus: "not_tested",
  });
  const screen = rows.find((r) => r.id === "screenRecording");
  assert.equal(screen?.label, "Source enumeration failed");
  assert.match(screen?.detail ?? "", /Screen sources could not be enumerated/i);
});

test("screen capture ready + system audio enumeration failed does not mark Capture failed", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    screenCaptureProbe: "ready",
    systemAudioStatus: "source_enumeration_failed",
    systemAudioDetail: "Failed to get sources.",
  });
  assert.equal(captureStatusFromSetup(rows), "Ready");
  const screen = rows.find((r) => r.id === "screenRecording");
  const sys = rows.find((r) => r.id === "systemAudio");
  assert.equal(screen?.status, "ready");
  assert.equal(sys?.label, "Source enumeration failed");
});

test("virtual device guidance only when status is requires_virtual_device and screen ready", () => {
  assert.equal(
    shouldShowVirtualDeviceGuidance("requires_virtual_device", true),
    true,
  );
  assert.equal(
    shouldShowVirtualDeviceGuidance("source_enumeration_failed", true),
    false,
  );
  const rowEnumFail = buildSystemAudioCapability({
    ...baseInput,
    systemAudioStatus: "source_enumeration_failed",
    systemAudioDetail: "Failed to get sources.",
  });
  assert.doesNotMatch(rowEnumFail.detail ?? "", /BlackHole/i);
  const rowVirtual = buildSystemAudioCapability({
    ...baseInput,
    systemAudioStatus: "requires_virtual_device",
    systemAudioDetail: "No audio track from display media.",
  });
  assert.match(rowVirtual.detail ?? "", /BlackHole 2ch or Loopback/i);
});

test("diagnostic-style summary preserves failed to get sources in system audio detail", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    screenCaptureProbe: "ready",
    systemAudioStatus: "source_enumeration_failed",
    systemAudioDetail: "Failed to get sources.",
  });
  const sys = rows.find((r) => r.id === "systemAudio");
  assert.match(sys?.detail ?? "", /Failed to get sources/i);
  assert.equal(sys?.label, "Source enumeration failed");
});

test("setup summary notes capture can work when only system audio fails", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    systemAudioStatus: "source_enumeration_failed",
    systemAudioDetail: "Failed to get sources.",
  });
  const summary = formatSetupCheckSummary(rows);
  assert.match(summary, /Capture can still work/i);
  assert.match(summary, /systemAudio/i);
});

test("no audio track after permission maps to requires_virtual_device not not_tested", () => {
  const resolved = resolveSystemAudioProbeStatus({
    screenCaptureReady: true,
    videoSourceCount: 2,
    videoThumbnailEmpty: false,
    hasNativeAudioTrack: false,
    platform: "darwin",
  });
  assert.equal(resolved.status, "requires_virtual_device");
  assert.match(resolved.detail, /Native macOS system audio is not available/i);
  assert.notEqual(resolved.status, "not_tested");
});
