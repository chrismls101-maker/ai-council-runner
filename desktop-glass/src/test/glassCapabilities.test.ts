import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGlassSetupCapabilities,
  buildMicrophoneCapability,
  buildScreenRecordingCapability,
  buildSttCapability,
  buildSystemAudioCapability,
  buildVisionCapability,
  captureStatusFromSetup,
  isServerConnectivityMessage,
  mapCaptureErrorToScreenCaptureStatus,
  mapGetUserMediaErrorToMicPermission,
} from "../shared/glassCapabilities.ts";
import { STT_TRANSCRIPTION_FAILED_MESSAGE } from "../shared/sttTypes.ts";

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

test("vision without health payload reports unknown not disabled", () => {
  const row = buildVisionCapability({ reachable: true });
  assert.equal(row.label, "Unknown");
  assert.equal(row.severity, "warn");
  assert.doesNotMatch(row.label, /Disabled/i);
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
    serverHealth: { reachable: false, checkError: "Could not reach https://iivo.ai" },
    lastError: "fetch failed ECONNREFUSED",
  });
  const server = rows.find((r) => r.id === "server");
  assert.equal(server?.severity, "error");
  assert.match(server?.label ?? "", /Offline/i);
});

test("server reachable ignores stale lastError", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    serverHealth: baseInput.serverHealth,
    lastError: "fetch failed ECONNREFUSED",
  });
  const server = rows.find((r) => r.id === "server");
  assert.equal(server?.severity, "ok");
  assert.match(server?.label ?? "", /Online/i);
});

test("healthy server shows green server vision stt cards", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    serverHealth: {
      reachable: true,
      vision: { enabled: true, configured: true },
      stt: { configured: true, enabled: true },
    },
    sttStatus: "configured",
    sttEnabled: true,
    lastError: "Could not reach https://iivo.ai: fetch failed",
    lastSttError: "IIVO transcription server unavailable.",
  });
  for (const id of ["server", "vision", "stt"] as const) {
    const row = rows.find((r) => r.id === id);
    assert.equal(row?.severity, "ok", `expected ${id} ok got ${row?.severity}`);
  }
});

test("stt card turns green when health ok despite stale server_unavailable status", () => {
  const row = buildSttCapability(
    {
      reachable: true,
      stt: { configured: true, enabled: true },
    },
    "server_unavailable",
    true,
    "IIVO transcription server unavailable.",
  );
  assert.equal(row.severity, "ok");
  assert.equal(row.label, "Ready");
});

test("isServerConnectivityMessage detects stale probe errors", () => {
  assert.equal(isServerConnectivityMessage("Could not reach https://iivo.ai: fetch failed"), true);
  assert.equal(isServerConnectivityMessage("Transcription failed: empty audio"), false);
});

test("unchecked server health shows idle not error", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    serverHealth: null,
  });
  const server = rows.find((r) => r.id === "server");
  const vision = rows.find((r) => r.id === "vision");
  const stt = rows.find((r) => r.id === "stt");
  assert.equal(server?.severity, "idle");
  assert.equal(vision?.severity, "idle");
  assert.equal(stt?.severity, "idle");
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

test("STT capability shows transcription failed when lastSttError set", () => {
  const row = buildSttCapability(
    baseInput.serverHealth,
    "configured",
    true,
    STT_TRANSCRIPTION_FAILED_MESSAGE,
  );
  assert.equal(row.status, "error");
  assert.equal(row.label, "Transcription failed");
  assert.match(row.detail ?? "", /transcription failed/i);
});

test("mic listening with transcription failure does not show ready", () => {
  const row = buildMicrophoneCapability({
    ...baseInput,
    micPermission: "granted",
    micListening: true,
    lastSttError: STT_TRANSCRIPTION_FAILED_MESSAGE,
  });
  assert.equal(row.status, "error");
  assert.equal(row.label, "Transcription failed");
});

test("system audio with track but transcription failure does not show ready", () => {
  const row = buildSystemAudioCapability({
    ...baseInput,
    screenCaptureProbe: "ready",
    systemAudioStatus: "available",
    lastSttError: STT_TRANSCRIPTION_FAILED_MESSAGE,
  });
  assert.equal(row.status, "error");
  assert.equal(row.label, "Transcription failed");
});
