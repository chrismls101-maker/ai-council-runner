/**
 * Virtual audio device detection and user-facing guidance (shared, testable).
 */

export type VirtualAudioDeviceKind =
  | "blackhole"
  | "loopback"
  | "soundflower"
  | "vb_cable"
  | "aggregate"
  | "multi_output";

export interface VirtualAudioDevicePattern {
  kind: VirtualAudioDeviceKind;
  label: string;
  patterns: RegExp[];
}

export const VIRTUAL_AUDIO_DEVICE_PATTERNS: VirtualAudioDevicePattern[] = [
  { kind: "blackhole", label: "BlackHole", patterns: [/blackhole/i] },
  { kind: "loopback", label: "Loopback", patterns: [/loopback/i] },
  { kind: "soundflower", label: "Soundflower", patterns: [/soundflower/i] },
  { kind: "vb_cable", label: "VB-CABLE", patterns: [/vb-?cable|vb cable/i] },
  {
    kind: "aggregate",
    label: "Aggregate Device",
    patterns: [/aggregate device/i],
  },
  {
    kind: "multi_output",
    label: "Multi-Output Device",
    patterns: [/multi-?output device/i],
  },
];

export interface VirtualAudioDeviceMatch {
  deviceId: string;
  label: string;
  kind: VirtualAudioDeviceKind;
  displayName: string;
}

export const NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE =
  "Native system audio is not available on this Mac. Use a virtual audio device such as BlackHole or Loopback.";

export const VIRTUAL_AUDIO_DEVICE_DETECTED_MESSAGE =
  "Virtual audio device detected — select it for system audio.";

export const VIRTUAL_AUDIO_SETUP_INSTRUCTIONS =
  "Install a virtual audio driver (BlackHole or Loopback recommended), open Audio MIDI Setup, create a Multi-Output Device that includes your speakers and the virtual device, set it as system output, then choose the virtual device input in Glass.";

export function detectVirtualAudioDevices(
  inputs: { deviceId: string; label: string }[],
): VirtualAudioDeviceMatch[] {
  const matches: VirtualAudioDeviceMatch[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const label = input.label.trim();
    if (!label) continue;
    for (const pattern of VIRTUAL_AUDIO_DEVICE_PATTERNS) {
      if (!pattern.patterns.some((re) => re.test(label))) continue;
      const key = `${pattern.kind}:${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        deviceId: input.deviceId,
        label,
        kind: pattern.kind,
        displayName: pattern.label,
      });
      break;
    }
  }

  return matches.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function buildSystemAudioVirtualDeviceDetail(input: {
  virtualDevices: VirtualAudioDeviceMatch[];
  selectedDeviceId?: string;
  nativeUnavailable?: boolean;
  extraDetail?: string;
}): string {
  const parts: string[] = [];
  if (input.nativeUnavailable) {
    parts.push(NATIVE_SYSTEM_AUDIO_UNAVAILABLE_MESSAGE);
  } else if (input.extraDetail?.trim()) {
    parts.push(input.extraDetail.trim());
  }

  if (input.virtualDevices.length > 0) {
    parts.push(VIRTUAL_AUDIO_DEVICE_DETECTED_MESSAGE);
    const selected = input.virtualDevices.find((d) => d.deviceId === input.selectedDeviceId);
    if (selected) {
      parts.push(`Selected: ${selected.label}`);
    } else {
      parts.push(
        `Detected: ${input.virtualDevices.map((d) => d.label).join(", ")}`,
      );
    }
  } else {
    parts.push(VIRTUAL_AUDIO_SETUP_INSTRUCTIONS);
  }

  return parts.join(" ");
}

export function formatVirtualAudioDeviceOption(device: VirtualAudioDeviceMatch): string {
  return `${device.displayName} — ${device.label}`;
}
