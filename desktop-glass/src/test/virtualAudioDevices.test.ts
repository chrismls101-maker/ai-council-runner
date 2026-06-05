import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGlassSetupCapabilities,
  buildMicrophoneCapability,
  buildSystemAudioCapability,
} from "../shared/glassCapabilities.ts";
import {
  detectVirtualAudioDevices,
  NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE,
  VIRTUAL_AUDIO_DEVICE_DETECTED_MESSAGE,
  VIRTUAL_AUDIO_SETUP_INSTRUCTIONS,
  buildSystemAudioVirtualDeviceDetail,
} from "../shared/virtualAudioDevices.ts";
import { mapSystemAudioStreamResultDetail } from "../shared/systemAudioCapture.ts";
import { resolveSystemAudioProbeStatus } from "../shared/systemAudioProbe.ts";

const baseInput = {
  screenCaptureProbe: "ready" as const,
  micPermission: "not_requested" as const,
  systemAudioStatus: "requires_virtual_device" as const,
  sttStatus: "configured" as const,
  sttEnabled: true,
  serverHealth: {
    reachable: true,
    vision: { enabled: true, configured: true },
    stt: { configured: true, enabled: true },
  },
};

test("detectVirtualAudioDevices finds BlackHole, Loopback, Soundflower, VB-CABLE, Aggregate, Multi-Output", () => {
  const inputs = [
    { deviceId: "bh", label: "BlackHole 2ch" },
    { deviceId: "lb", label: "Loopback Audio" },
    { deviceId: "sf", label: "Soundflower (2ch)" },
    { deviceId: "vb", label: "VB-CABLE Output" },
    { deviceId: "agg", label: "Aggregate Device" },
    { deviceId: "mo", label: "Multi-Output Device" },
    { deviceId: "mic", label: "MacBook Pro Microphone" },
  ];
  const matches = detectVirtualAudioDevices(inputs);
  assert.equal(matches.length, 6);
  assert.ok(matches.some((m) => m.kind === "blackhole"));
  assert.ok(matches.some((m) => m.kind === "loopback"));
  assert.ok(matches.some((m) => m.kind === "soundflower"));
  assert.ok(matches.some((m) => m.kind === "vb_cable"));
  assert.ok(matches.some((m) => m.kind === "aggregate"));
  assert.ok(matches.some((m) => m.kind === "multi_output"));
});

test("nativeAudioTrack=false maps to requires_virtual_device with native unavailable message", () => {
  const probe = resolveSystemAudioProbeStatus({
    screenCaptureReady: true,
    videoSourceCount: 2,
    videoThumbnailEmpty: false,
    hasNativeAudioTrack: false,
    platform: "darwin",
  });
  assert.equal(probe.status, "requires_virtual_device");
  assert.equal(probe.detail, NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE);

  const stream = mapSystemAudioStreamResultDetail(0, "darwin");
  assert.equal(stream.status, "requires_virtual_device");
  assert.equal(stream.detail, NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE);
});

test("screen capture remains ready when system audio requires virtual device", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    systemAudioStatus: "requires_virtual_device",
  });
  const screen = rows.find((r) => r.id === "screenRecording");
  const sys = rows.find((r) => r.id === "systemAudio");
  assert.equal(screen?.status, "ready");
  assert.equal(screen?.label, "Ready");
  assert.equal(sys?.status, "requires_virtual_device");
  assert.notEqual(sys?.label, "Not verified");
});

test("microphone capability unaffected by system audio virtual device state", () => {
  const mic = buildMicrophoneCapability({
    ...baseInput,
    micPermission: "granted",
    systemAudioStatus: "requires_virtual_device",
  });
  assert.equal(mic.status, "ready");
  assert.equal(mic.label, "Mic ready");
});

test("virtual device detected shows selectable guidance", () => {
  const devices = detectVirtualAudioDevices([{ deviceId: "bh", label: "BlackHole 2ch" }]);
  const row = buildSystemAudioCapability({
    ...baseInput,
    virtualAudioDevices: devices,
  });
  assert.equal(row.label, "Virtual device detected");
  assert.match(row.detail ?? "", new RegExp(VIRTUAL_AUDIO_DEVICE_DETECTED_MESSAGE));
  assert.match(row.detail ?? "", /BlackHole 2ch/);
});

test("no virtual device shows setup instructions", () => {
  const detail = buildSystemAudioVirtualDeviceDetail({
    virtualDevices: [],
    nativeUnavailable: true,
  });
  assert.match(detail, new RegExp(NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE.replace(/\./g, "\\.")));
  assert.match(detail, /Install a virtual audio driver/i);

  const row = buildSystemAudioCapability({
    ...baseInput,
    virtualAudioDevices: [],
  });
  assert.equal(row.label, "Virtual device needed");
  assert.match(row.detail ?? "", /Install a virtual audio driver/i);
});
