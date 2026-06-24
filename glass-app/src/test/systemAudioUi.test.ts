import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGlassSetupCapabilities,
  buildMicrophoneCapability,
  buildSystemAudioCapability,
} from "../shared/glassCapabilities.ts";
import { BLACKHOLE_SETUP_INSTRUCTIONS } from "../shared/virtualAudioCapture.ts";
import { detectVirtualAudioDevices } from "../shared/virtualAudioDevices.ts";
import {
  buildSystemAudioSourceOptions,
  isSystemAudioCapabilityRowCompact,
  resolveSelectedDeviceLabel,
  resolveSystemAudioConfigureHint,
  resolveSystemAudioRowStatus,
  resolveSystemAudioSignalStatus,
  SYSTEM_AUDIO_SOURCE_LABEL,
} from "../shared/systemAudioUi.ts";

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

test("BlackHole 2ch appears in System Audio Source dropdown", () => {
  const devices = detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]);
  const options = buildSystemAudioSourceOptions(devices);
  assert.equal(options[0]?.label, "Native System Audio");
  assert.ok(options.some((o) => o.label === "BlackHole 2ch" && o.value === "bh2"));
});

test("selecting BlackHole updates selected device label", () => {
  const devices = detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]);
  assert.equal(
    resolveSelectedDeviceLabel({
      virtualDevices: devices,
      selectedVirtualAudioDeviceId: "bh2",
    }),
    "BlackHole 2ch",
  );
  assert.equal(
    resolveSystemAudioRowStatus({
      systemAudioStatus: "requires_virtual_device",
      virtualDevices: devices,
      selectedVirtualAudioDeviceId: "bh2",
    }),
    "BlackHole selected",
  );
});

test("BlackHole detected but not selected shows configure hint", () => {
  const devices = detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]);
  assert.match(
    resolveSystemAudioConfigureHint({
      virtualDevices: devices,
      selectedVirtualAudioDeviceId: undefined,
    }) ?? "",
    /BlackHole detected — select it as System Audio Source/i,
  );
});

test("no virtual device shows compact not-detected message", () => {
  assert.equal(
    resolveSystemAudioConfigureHint({
      virtualDevices: [],
      selectedVirtualAudioDeviceId: undefined,
    }),
    "No virtual audio device detected.",
  );
});

test("main setup capability row stays compact without tutorial text", () => {
  const row = buildSystemAudioCapability({
    ...baseInput,
    virtualAudioDevices: detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]),
  });
  assert.equal(row.label, "BlackHole detected");
  assert.equal(row.detail, undefined);
  assert.equal(row.actions, undefined);
  assert.equal(isSystemAudioCapabilityRowCompact(row.detail), true);
});

test("tutorial text only lives in routing help content constant", () => {
  const row = buildSystemAudioCapability({
    ...baseInput,
    virtualAudioDevices: [],
  });
  assert.doesNotMatch(row.detail ?? "", /Audio MIDI Setup/i);
  assert.match(BLACKHOLE_SETUP_INSTRUCTIONS, /Audio MIDI Setup/i);
});

test("microphone capability remains separate from system audio source UI", () => {
  const mic = buildMicrophoneCapability({
    ...baseInput,
    micPermission: "granted",
    virtualAudioDevices: detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]),
    selectedVirtualAudioDeviceId: "bh2",
  });
  assert.equal(mic.label, "Mic ready");
  assert.doesNotMatch(mic.detail ?? "", /System Audio Source/i);
});

test("signal status derives from silent and active probe details", () => {
  assert.equal(
    resolveSystemAudioSignalStatus(
      "BlackHole is selected, but no audio signal is detected. Make sure Mac output is routed to a Multi-Output Device that includes BlackHole.",
    ),
    "No signal",
  );
  assert.equal(
    resolveSystemAudioSignalStatus("Virtual system audio input active: BlackHole 2ch."),
    "Signal detected",
  );
});

test("system audio source dropdown label constant", () => {
  assert.equal(SYSTEM_AUDIO_SOURCE_LABEL, "System Audio Source");
});

test("setup rows exclude verbose system audio duplication via compact status labels", () => {
  const rows = buildGlassSetupCapabilities({
    ...baseInput,
    virtualAudioDevices: detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]),
    selectedVirtualAudioDeviceId: "bh2",
  });
  const sys = rows.find((r) => r.id === "systemAudio");
  assert.equal(sys?.label, "BlackHole selected");
  assert.equal(sys?.detail, undefined);
});
