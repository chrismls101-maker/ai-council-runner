import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import type { VirtualAudioDeviceMatch } from "./virtualAudioDevices.ts";
import { BLACKHOLE_SILENT_INPUT_MESSAGE } from "./virtualAudioCapture.ts";

/** Shown when BlackHole is selected and the input opens — no playback required yet. */
export const SYSTEM_AUDIO_ARMED_MESSAGE =
  "System audio armed — BlackHole is ready. Capture starts when you play audio.";

export function isSystemAudioArmed(detail?: string): boolean {
  const text = detail?.trim() ?? "";
  return text === SYSTEM_AUDIO_ARMED_MESSAGE || /system audio armed/i.test(text);
}

/** True when live audio signal was heard during a probe. */
export function isSystemAudioSignalDetected(
  status: SystemAudioStatus,
  detail?: string,
): boolean {
  if (status !== "available") return false;
  const text = detail?.trim() ?? "";
  if (!text || isSystemAudioArmed(text)) return false;
  if (text === BLACKHOLE_SILENT_INPUT_MESSAGE) return false;
  if (/no audio signal|no audio is detected|no signal/i.test(text)) return false;
  return /active|detected|loopback/i.test(text);
}

/** Ready for the user — armed or live signal (no yellow setup needed). */
export function isSystemAudioRoutingReady(
  status: SystemAudioStatus,
  detail?: string,
): boolean {
  if (status !== "available") return false;
  return isSystemAudioArmed(detail) || isSystemAudioSignalDetected(status, detail);
}

export function isBlackHoleSystemAudioConfigured(
  virtualDevices: VirtualAudioDeviceMatch[],
  selectedVirtualAudioDeviceId?: string,
): boolean {
  if (!selectedVirtualAudioDeviceId?.trim()) return false;
  const selected = virtualDevices.find((d) => d.deviceId === selectedVirtualAudioDeviceId);
  return selected?.kind === "blackhole";
}

export function isSystemAudioConfigured(input: {
  systemAudioStatus: SystemAudioStatus;
  virtualDevices?: VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
  audioRoutingConfigured?: boolean;
  systemAudioDetail?: string;
}): boolean {
  if (isSystemAudioRoutingReady(input.systemAudioStatus, input.systemAudioDetail)) return true;
  if (input.audioRoutingConfigured) return true;
  return isBlackHoleSystemAudioConfigured(
    input.virtualDevices ?? [],
    input.selectedVirtualAudioDeviceId,
  );
}
