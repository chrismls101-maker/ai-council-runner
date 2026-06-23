/**
 * Virtual system-audio capture helpers (BlackHole / Loopback via getUserMedia).
 */

import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import type { VirtualAudioDeviceMatch } from "./virtualAudioDevices.ts";

export const NATIVE_SYSTEM_AUDIO_UNAVAILABLE_LABEL = "Native system audio unavailable";

import { NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE } from "./virtualAudioDevices.ts";

export const NATIVE_SYSTEM_AUDIO_UNAVAILABLE_PANEL_MESSAGE =
  NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE;

export const BLACKHOLE_NOT_DETECTED_GUIDANCE =
  "Install BlackHole 2ch, create a Multi-Output Device, route Mac audio to it, then select BlackHole in IIVO Glass.";

export const BLACKHOLE_SILENT_INPUT_MESSAGE =
  "BlackHole is selected, but no audio signal is detected. Make sure Mac output is routed to a Multi-Output Device that includes BlackHole.";

export const BLACKHOLE_SETUP_INSTRUCTIONS = [
  "Open Audio MIDI Setup.",
  "Click +.",
  "Create Multi-Output Device.",
  "Check your normal output device: MacBook Speakers / HDMI / headphones.",
  "Check BlackHole 2ch.",
  "Set Mac output to Multi-Output Device.",
  "In IIVO Glass, select BlackHole 2ch for System Audio.",
  "Play YouTube/audio.",
  "Click Test System Audio.",
].join("\n");

export const AUDIO_ACTIVITY_RMS_THRESHOLD = 0.001;

export function buildVirtualAudioInputConstraints(
  deviceId: string,
): MediaStreamConstraints {
  return {
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  };
}

export function computeRmsFromSamples(samples: Float32Array | number[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

export function detectAudioActivityFromRms(
  rms: number,
  threshold = AUDIO_ACTIVITY_RMS_THRESHOLD,
): boolean {
  return rms > threshold;
}

export function pickPreferredVirtualAudioDevice(
  devices: VirtualAudioDeviceMatch[],
): VirtualAudioDeviceMatch | undefined {
  const blackhole2ch = devices.find((d) => /blackhole\s*2ch/i.test(d.label));
  if (blackhole2ch) return blackhole2ch;
  const blackhole = devices.find((d) => d.kind === "blackhole");
  if (blackhole) return blackhole;
  return devices[0];
}

export function formatVirtualDeviceDetectedLabel(
  device: VirtualAudioDeviceMatch,
): string {
  if (device.kind === "blackhole") return "BlackHole detected";
  return `${device.displayName} detected`;
}

export interface VirtualAudioProbeResult {
  status: SystemAudioStatus;
  detail: string;
  trackCount: number;
  hasActivity: boolean;
}

export function evaluateVirtualAudioProbe(input: {
  trackCount: number;
  rms?: number;
  deviceLabel?: string;
}): VirtualAudioProbeResult {
  if (input.trackCount === 0) {
    return {
      status: "requires_virtual_device",
      detail: BLACKHOLE_NOT_DETECTED_GUIDANCE,
      trackCount: 0,
      hasActivity: false,
    };
  }

  const hasActivity =
    input.rms === undefined ? true : detectAudioActivityFromRms(input.rms);
  const label = input.deviceLabel?.trim();

  if (!hasActivity) {
    return {
      status: "available",
      detail: BLACKHOLE_SILENT_INPUT_MESSAGE,
      trackCount: input.trackCount,
      hasActivity: false,
    };
  }

  return {
    status: "available",
    detail: label
      ? `Virtual system audio input active: ${label}.`
      : "Virtual system audio input active.",
    trackCount: input.trackCount,
    hasActivity: true,
  };
}

export function resolveVirtualAudioDeviceId(input: {
  selectedVirtualAudioDeviceId?: string;
  virtualAudioDevices?: VirtualAudioDeviceMatch[];
}): string | undefined {
  const selected = input.selectedVirtualAudioDeviceId?.trim();
  if (selected) return selected;
  return pickPreferredVirtualAudioDevice(input.virtualAudioDevices ?? [])?.deviceId;
}

export function hasVirtualSystemAudioDevice(input: {
  selectedVirtualAudioDeviceId?: string;
  virtualAudioDevices?: VirtualAudioDeviceMatch[];
}): boolean {
  return !!resolveVirtualAudioDeviceId(input);
}

export function shouldUseVirtualSystemAudioCapture(input: {
  selectedVirtualAudioDeviceId?: string;
  virtualAudioDevices?: VirtualAudioDeviceMatch[];
}): boolean {
  return hasVirtualSystemAudioDevice(input);
}
