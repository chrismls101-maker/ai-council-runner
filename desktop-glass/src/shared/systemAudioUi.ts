/**
 * System Audio configuration UI helpers (shared, testable).
 */

import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import type { VirtualAudioDeviceMatch } from "./virtualAudioDevices.ts";
import { BLACKHOLE_SILENT_INPUT_MESSAGE } from "./virtualAudioCapture.ts";

export const NATIVE_SYSTEM_AUDIO_SOURCE_VALUE = "";

export const SYSTEM_AUDIO_SOURCE_LABEL = "System Audio Source";

export const BLACKHOLE_DETECTED_SELECT_HINT =
  "BlackHole detected — select it as System Audio Source.";

export const NO_VIRTUAL_AUDIO_DEVICE_MESSAGE = "No virtual audio device detected.";

export const ROUTING_AUDIO_HELP_LINK = "Need help routing audio?";

export interface SystemAudioSourceOption {
  value: string;
  label: string;
}

export function buildSystemAudioSourceOptions(
  devices: VirtualAudioDeviceMatch[],
): SystemAudioSourceOption[] {
  const options: SystemAudioSourceOption[] = [
    { value: NATIVE_SYSTEM_AUDIO_SOURCE_VALUE, label: "Native System Audio" },
  ];
  for (const device of devices) {
    options.push({ value: device.deviceId, label: device.label });
  }
  return options;
}

export function findSelectedVirtualDevice(
  devices: VirtualAudioDeviceMatch[],
  selectedDeviceId?: string,
): VirtualAudioDeviceMatch | undefined {
  if (!selectedDeviceId?.trim()) return undefined;
  return devices.find((d) => d.deviceId === selectedDeviceId);
}

export function resolveSystemAudioRowStatus(input: {
  systemAudioStatus: SystemAudioStatus;
  virtualDevices: VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
}): string {
  if (input.systemAudioStatus === "available") return "Ready";

  const selected = findSelectedVirtualDevice(
    input.virtualDevices,
    input.selectedVirtualAudioDeviceId,
  );
  if (selected?.kind === "blackhole") return "BlackHole selected";
  if (selected) return `${selected.displayName} selected`;

  if (input.virtualDevices.some((d) => d.kind === "blackhole")) {
    return "BlackHole detected";
  }

  if (input.systemAudioStatus === "requires_virtual_device") {
    return "Native unavailable";
  }
  if (input.systemAudioStatus === "requires_permission") return "Permission needed";
  if (input.systemAudioStatus === "not_tested") return "Not verified";
  if (input.systemAudioStatus === "source_enumeration_failed") return "Enumeration failed";
  if (input.systemAudioStatus === "unsupported") return "Unavailable";
  if (input.systemAudioStatus === "error") return "Error";
  return "Not tested";
}

export function resolveSystemAudioConfigureHint(input: {
  virtualDevices: VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
}): string | undefined {
  const selected = findSelectedVirtualDevice(
    input.virtualDevices,
    input.selectedVirtualAudioDeviceId,
  );
  if (selected) return undefined;

  if (input.virtualDevices.some((d) => d.kind === "blackhole")) {
    return BLACKHOLE_DETECTED_SELECT_HINT;
  }
  if (input.virtualDevices.length === 0) {
    return NO_VIRTUAL_AUDIO_DEVICE_MESSAGE;
  }
  return undefined;
}

export type SystemAudioSignalStatus = "No signal" | "Signal detected" | "Not tested";

export function resolveSystemAudioSignalStatus(
  systemAudioDetail?: string,
): SystemAudioSignalStatus {
  if (!systemAudioDetail?.trim()) return "Not tested";
  if (
    systemAudioDetail === BLACKHOLE_SILENT_INPUT_MESSAGE ||
    /no audio signal|no audio is detected|no signal/i.test(systemAudioDetail)
  ) {
    return "No signal";
  }
  if (/active|detected|track|signal/i.test(systemAudioDetail)) {
    return "Signal detected";
  }
  return "Not tested";
}

export function resolveSelectedDeviceLabel(input: {
  virtualDevices: VirtualAudioDeviceMatch[];
  selectedVirtualAudioDeviceId?: string;
}): string {
  const selected = findSelectedVirtualDevice(
    input.virtualDevices,
    input.selectedVirtualAudioDeviceId,
  );
  if (selected) return selected.label;
  return "Native System Audio";
}

export function isSystemAudioCapabilityRowCompact(detail?: string): boolean {
  if (!detail?.trim()) return true;
  return !/Install BlackHole|Audio MIDI Setup|Multi-Output Device/i.test(detail);
}

export function isSystemAudioConnected(status: SystemAudioStatus): boolean {
  return status === "available";
}
