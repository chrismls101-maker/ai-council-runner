/**
 * System audio capture detection and error mapping (shared, testable).
 */

import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import {
  SYSTEM_AUDIO_CAPTURE_ACTIVE_MESSAGE,
  systemAudioStatusMessage,
} from "./systemAudioTypes.ts";

/** Darwin 22 ≈ macOS 13 — first macOS with loopback APIs Chromium uses. */
const MACOS_LOOPBACK_MIN_DARWIN = 22;

export function darwinMajorFromRelease(release: string): number {
  const major = parseInt(release.split(".")[0] ?? "0", 10);
  return Number.isFinite(major) ? major : 0;
}

export function resolveInitialSystemAudioStatus(
  platform: NodeJS.Platform,
  darwinMajor = 22,
): SystemAudioStatus {
  if (platform === "win32" || platform === "linux") {
    return "requires_permission";
  }
  if (platform === "darwin") {
    if (darwinMajor < MACOS_LOOPBACK_MIN_DARWIN) return "unsupported";
    return "requires_permission";
  }
  return "unsupported";
}

export function mapSystemAudioCaptureError(
  err: unknown,
  platform: NodeJS.Platform = process.platform,
): { status: SystemAudioStatus; detail?: string } {
  const name = err instanceof DOMException ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (name === "NotAllowedError" || /not allowed|permission|denied/i.test(lower)) {
    return { status: "requires_permission", detail: message };
  }
  if (/virtual|loopback|no audio|audio track/i.test(lower) && platform === "darwin") {
    return { status: "requires_virtual_device", detail: message };
  }
  if (/not supported|unsupported/i.test(lower)) {
    return { status: "unsupported", detail: message };
  }
  return { status: "error", detail: message };
}

export function mapSystemAudioStreamResult(
  audioTrackCount: number,
  platform: NodeJS.Platform = process.platform,
): SystemAudioStatus {
  if (audioTrackCount > 0) return "available";
  return platform === "darwin" ? "requires_virtual_device" : "requires_permission";
}

export function canAttemptSystemAudioCapture(status: SystemAudioStatus): boolean {
  return (
    status === "available" ||
    status === "requires_permission" ||
    status === "error"
  );
}

export function systemAudioListeningMessage(
  status: SystemAudioStatus,
  listening: boolean,
  detail?: string,
): string {
  if (listening && status === "available") {
    return SYSTEM_AUDIO_CAPTURE_ACTIVE_MESSAGE;
  }
  return systemAudioStatusMessage(status, detail);
}

export type StreamStopState = { streamActive: boolean; trackCount: number };

export function stopMediaStreamState(tracks: { stop: () => void }[]): StreamStopState {
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
  return { streamActive: false, trackCount: 0 };
}
