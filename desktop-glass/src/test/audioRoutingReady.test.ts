import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBlackHoleSystemAudioConfigured,
  isSystemAudioArmed,
  isSystemAudioConfigured,
  isSystemAudioRoutingReady,
  isSystemAudioSignalDetected,
  SYSTEM_AUDIO_ARMED_MESSAGE,
} from "../shared/audioRoutingReady.ts";
import { resolveDefaultPanelTab } from "../shared/glassSettings.ts";
import { BLACKHOLE_SILENT_INPUT_MESSAGE } from "../shared/virtualAudioCapture.ts";
import { detectVirtualAudioDevices } from "../shared/virtualAudioDevices.ts";

test("armed status counts as ready without live signal", () => {
  assert.equal(isSystemAudioArmed(SYSTEM_AUDIO_ARMED_MESSAGE), true);
  assert.equal(
    isSystemAudioRoutingReady("available", SYSTEM_AUDIO_ARMED_MESSAGE),
    true,
  );
  assert.equal(isSystemAudioSignalDetected("available", SYSTEM_AUDIO_ARMED_MESSAGE), false);
});

test("isSystemAudioRoutingReady accepts active virtual input", () => {
  assert.equal(
    isSystemAudioRoutingReady(
      "available",
      "Virtual system audio input active: BlackHole 2ch.",
    ),
    true,
  );
  assert.equal(
    isSystemAudioSignalDetected("available", "Virtual system audio input active: BlackHole 2ch."),
    true,
  );
});

test("isSystemAudioRoutingReady rejects silent BlackHole", () => {
  assert.equal(isSystemAudioRoutingReady("available", BLACKHOLE_SILENT_INPUT_MESSAGE), false);
});

test("blackhole selected counts as configured", () => {
  const devices = detectVirtualAudioDevices([{ deviceId: "bh2", label: "BlackHole 2ch" }]);
  assert.equal(isBlackHoleSystemAudioConfigured(devices, "bh2"), true);
  assert.equal(
    isSystemAudioConfigured({
      systemAudioStatus: "requires_virtual_device",
      virtualDevices: devices,
      selectedVirtualAudioDeviceId: "bh2",
    }),
    true,
  );
});

test("resolveDefaultPanelTab opens summary after routing is configured", () => {
  assert.equal(resolveDefaultPanelTab({ audioRoutingConfigured: true } as never), "summary");
  assert.equal(resolveDefaultPanelTab({} as never), "audio");
});
