import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGlassSetupCapabilities,
  buildMicrophoneCapability,
  buildScreenRecordingCapability,
  buildSystemAudioCapability,
  buildVisionCapability,
  captureStatusFromSetup,
  mapCaptureErrorToScreenCaptureStatus,
  mapGetUserMediaErrorToMicPermission,
} from "../shared/glassCapabilities.ts";

const baseInput = {
  screenCaptureProbe: "unknown" as const,
  micPermission: "not_requested" as const,
  systemAudioStatus: "requires_permission" as const,
  sttStatus: "configured" as const,
  sttEnabled: true,
  serverHealth: {
    reachable: true,
    vision: { enabled: true, configured: true },
    stt: { configured: true, enabled: true },
  },
};

test("mapCaptureErrorToScreenCaptureStatus detects permission errors", () => {
  assert.equal(
    mapCaptureErrorToScreenCaptureStatus("Screen Recording permission needed"),
    "permission_required",
  );
});

test("mapGetUserMediaErrorToMicPermission maps NotAllowedError to denied", () => {
  const err = new DOMException("denied", "NotAllowedError");
  assert.equal(mapGetUserMediaErrorToMicPermission(err), "denied");
});

test("screen recording capability shows open settings action when permission required", () => {
  const row = buildScreenRecordingCapability({
    ...baseInput,
    screenCaptureProbe: "permission_required",
    screenCaptureDetail: "empty image",
  });
  assert.equal(row.status, "permission_required");
  assert.equal(row.actionCommand, "open-screen-recording-settings");
  assert.match(row.actionLabel ?? "", /Screen Recording Settings/i);
});

test("microphone denied maps to permission_denied with settings action", () => {
  const row = buildMicrophoneCapability({
    ...baseInput,
    micPermission: "denied",
  });
  assert.equal(row.status, "permission_denied");
  assert.equal(row.severity, "error");
  assert.equal(row.actionCommand, "open-microphone-settings");
});

test("system audio no track maps to requires_virtual_device", () => {
  const row = buildSystemAudioCapability({
    ...baseInput,
    screenCaptureProbe: "ready",
    systemAudioStatus: "requires_virtual_device",
  });
  assert.equal(row.status, "requires_virtual_device");
  assert.notEqual(row.label, "Not verified");
  assert.equal(row.detail, undefined);
  assert.equal(row.actions, undefined);
});

test("vision disabled maps to missing_config", () => {
  const row = buildVisionCapability({
    reachable: true,
    vision: { enabled: false, configured: false, reason: "IMAGE_VISION_ENABLED is off" },
  });
  assert.equal(row.status, "missing_config");
  assert.match(row.label, /Disabled/i);
});

test("server offline maps to error severity", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    serverHealth: { reachable: false },
    lastError: "fetch failed ECONNREFUSED",
  });
  const server = rows.find((r) => r.id === "server");
  assert.equal(server?.severity, "error");
  assert.match(server?.label ?? "", /Offline/i);
});

test("screen source_enumeration_failed shows actionable label not vague failed", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    screenCaptureProbe: "source_enumeration_failed",
    screenCaptureDetail: "Failed to get sources.",
    systemAudioStatus: "not_tested",
  });
  const screen = rows.find((r) => r.id === "screenRecording");
  assert.equal(screen?.label, "Source enumeration failed");
  assert.match(screen?.detail ?? "", /Screen sources could not be enumerated/i);
});

test("captureStatusFromSetup reflects permission state", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    screenCaptureProbe: "permission_required",
  });
  assert.match(captureStatusFromSetup(rows), /permission/i);
});
