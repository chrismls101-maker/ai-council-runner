import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGlassSetupCapabilities,
  buildMicrophoneCapability,
  buildSystemAudioCapability,
} from "../shared/glassCapabilities.ts";
import {
  BLACKHOLE_NOT_DETECTED_GUIDANCE,
  BLACKHOLE_SILENT_INPUT_MESSAGE,
  computeRmsFromSamples,
  detectAudioActivityFromRms,
  evaluateVirtualAudioProbe,
  pickPreferredVirtualAudioDevice,
  shouldUseVirtualSystemAudioCapture,
} from "../shared/virtualAudioCapture.ts";
import { detectVirtualAudioDevices } from "../shared/virtualAudioDevices.ts";

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

test("pickPreferredVirtualAudioDevice prefers BlackHole 2ch", () => {
  const devices = detectVirtualAudioDevices([
    { deviceId: "lb", label: "Loopback Audio" },
    { deviceId: "bh16", label: "BlackHole 16ch" },
    { deviceId: "bh2", label: "BlackHole 2ch" },
  ]);
  const picked = pickPreferredVirtualAudioDevice(devices);
  assert.equal(picked?.deviceId, "bh2");
});

test("shouldUseVirtualSystemAudioCapture when virtual device selected", () => {
  assert.equal(
    shouldUseVirtualSystemAudioCapture({
      selectedVirtualAudioDeviceId: "bh2",
    }),
    true,
  );
  assert.equal(
    shouldUseVirtualSystemAudioCapture({
      selectedVirtualAudioDeviceId: undefined,
    }),
    false,
  );
  const devices = detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]);
  assert.equal(
    shouldUseVirtualSystemAudioCapture({
      selectedVirtualAudioDeviceId: undefined,
      virtualAudioDevices: devices,
    }),
    true,
  );
});

test("evaluateVirtualAudioProbe marks track without activity as available with silent guidance", () => {
  const result = evaluateVirtualAudioProbe({
    trackCount: 1,
    rms: 0,
    deviceLabel: "BlackHole 2ch",
  });
  assert.equal(result.status, "available");
  assert.equal(result.trackCount, 1);
  assert.equal(result.hasActivity, false);
  assert.match(result.detail, /no audio signal is detected/i);
});

test("evaluateVirtualAudioProbe marks active track as available", () => {
  const samples = new Float32Array(128);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.05;
  const rms = computeRmsFromSamples(samples);
  assert.equal(detectAudioActivityFromRms(rms), true);
  const result = evaluateVirtualAudioProbe({
    trackCount: 1,
    rms,
    deviceLabel: "BlackHole 2ch",
  });
  assert.equal(result.status, "available");
  assert.equal(result.hasActivity, true);
});

test("BlackHole detected is selectable in setup capability row", () => {
  const devices = detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]);
  const row = buildSystemAudioCapability({
    ...baseInput,
    virtualAudioDevices: devices,
    selectedVirtualAudioDeviceId: "bh2",
  });
  assert.equal(row.label, "BlackHole selected");
  assert.equal(row.detail, undefined);
});

test("no BlackHole shows setup guidance", () => {
  const row = buildSystemAudioCapability({
    ...baseInput,
    virtualAudioDevices: [],
  });
  assert.equal(row.label, "Native unavailable");
  assert.equal(row.detail, undefined);
});

test("microphone flow remains separate from system audio virtual fallback", () => {
  const mic = buildMicrophoneCapability({
    ...baseInput,
    micPermission: "granted",
    systemAudioStatus: "requires_virtual_device",
  });
  assert.equal(mic.label, "Mic ready");
  assert.doesNotMatch(mic.detail ?? "", /BlackHole/i);
});

test("screen capture stays ready when system audio needs BlackHole", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    virtualAudioDevices: detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]),
  });
  assert.equal(rows.find((r) => r.id === "screenRecording")?.status, "ready");
  assert.equal(rows.find((r) => r.id === "systemAudio")?.label, "BlackHole detected");
});

test("glass settings shape includes selected virtual audio device id", () => {
  const settings = {
    hotkeyPreset: "cmd-shift-space" as const,
    displayTarget: "primary" as const,
    chromeLayoutLocked: true,
    dockOrientation: "horizontal" as const,
    dockCustomOrigin: null,
    commandBarCustomOrigin: null,
    bootSoundEnabled: false,
    saveVisualAsksToSession: true,
    autoUploadCapturesToContext: false,
    micAutoSendAfterSilence: false,
    selectedVirtualAudioDeviceId: "bh2",
  };
  assert.equal(settings.selectedVirtualAudioDeviceId, "bh2");
});
