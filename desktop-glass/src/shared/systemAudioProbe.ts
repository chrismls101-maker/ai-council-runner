/**
 * System audio setup probe — separate from screen capture (video-only) probe.
 */

import type { ScreenCaptureProbeStatus } from "./glassCapabilities.ts";
import type { SystemAudioStatus } from "./systemAudioTypes.ts";

export const PERMISSION_JUST_GRANTED_RESTART_HINT =
  "Quit and reopen IIVO Glass after granting Screen/System Audio permission.";

export const MACOS_RESTART_ONCE_HINT = "If still failing, restart macOS once.";

export const SCREEN_READY_SYSTEM_AUDIO_UNAVAILABLE =
  "Screen Recording ready. System audio source unavailable.";

export const VIRTUAL_DEVICE_AFTER_PERMISSIONS_HINT =
  "If screen capture works but system audio still fails, your Mac may require a virtual audio device.";

export interface SystemAudioProbeDiagnostics {
  platform: NodeJS.Platform;
  packaged: boolean;
  appName: string;
  bundleId: string;
  displayId: number;
  screenCaptureProbe: ScreenCaptureProbeStatus;
  videoSourceCount: number;
  hasVideoSources: boolean;
  /** True only after getDisplayMedia returns an audio track (renderer test). */
  hasNativeAudioTrack: boolean;
  errorMessage?: string;
}

export interface SystemAudioProbeInput {
  screenCaptureReady: boolean;
  enumerationError?: string;
  videoSourceCount: number;
  videoThumbnailEmpty: boolean;
  hasNativeAudioTrack?: boolean;
}

export function isSourceEnumerationFailedMessage(message: string): boolean {
  return /failed to get sources/i.test(message);
}

export function mapEnumerationErrorToSystemAudioStatus(
  message: string,
  screenCaptureReady: boolean,
): SystemAudioStatus {
  if (isSourceEnumerationFailedMessage(message)) {
    return "source_enumeration_failed";
  }
  if (/permission|not allowed|denied|screen recording|empty image/i.test(message)) {
    return "requires_permission";
  }
  return "error";
}

export function buildSystemAudioProbeDetail(
  status: SystemAudioStatus,
  input: {
    screenCaptureReady: boolean;
    errorMessage?: string;
    diagnosticsLine?: string;
  },
): string {
  const parts: string[] = [];
  if (input.errorMessage?.trim()) {
    parts.push(input.errorMessage.trim());
  }
  if (status === "source_enumeration_failed") {
    if (input.screenCaptureReady) {
      parts.unshift(SCREEN_READY_SYSTEM_AUDIO_UNAVAILABLE);
    }
    parts.push(PERMISSION_JUST_GRANTED_RESTART_HINT, MACOS_RESTART_ONCE_HINT);
  } else if (status === "requires_permission") {
    parts.push(PERMISSION_JUST_GRANTED_RESTART_HINT);
  } else if (status === "requires_virtual_device") {
    parts.push(VIRTUAL_DEVICE_AFTER_PERMISSIONS_HINT);
  }
  if (input.diagnosticsLine) {
    parts.push(input.diagnosticsLine);
  }
  return parts.filter(Boolean).join(" ");
}

export function resolveSystemAudioProbeStatus(
  input: SystemAudioProbeInput,
): { status: SystemAudioStatus; detail: string } {
  if (input.hasNativeAudioTrack) {
    return {
      status: "available",
      detail: "Native loopback audio track detected.",
    };
  }

  if (input.enumerationError?.trim()) {
    const status = mapEnumerationErrorToSystemAudioStatus(
      input.enumerationError,
      input.screenCaptureReady,
    );
    return {
      status,
      detail: buildSystemAudioProbeDetail(status, {
        screenCaptureReady: input.screenCaptureReady,
        errorMessage: input.enumerationError,
      }),
    };
  }

  if (input.videoSourceCount === 0) {
    const status: SystemAudioStatus = "source_enumeration_failed";
    return {
      status,
      detail: buildSystemAudioProbeDetail(status, {
        screenCaptureReady: input.screenCaptureReady,
        errorMessage: "No screen sources returned from desktopCapturer.",
      }),
    };
  }

  if (input.videoThumbnailEmpty) {
    return {
      status: "requires_permission",
      detail: buildSystemAudioProbeDetail("requires_permission", {
        screenCaptureReady: false,
        errorMessage:
          "Screen capture returned an empty thumbnail. Grant Screen Recording for IIVO Glass.",
      }),
    };
  }

  return {
    status: "not_tested",
    detail:
      "Screen sources are available. Tap Retry System Audio or Test System Audio to verify loopback.",
  };
}

export function formatSystemAudioProbeDiagnostics(
  diagnostics: SystemAudioProbeDiagnostics,
): string {
  return [
    `platform=${diagnostics.platform}`,
    `packaged=${diagnostics.packaged}`,
    `app=${diagnostics.appName}`,
    `bundleId=${diagnostics.bundleId}`,
    `displayId=${diagnostics.displayId}`,
    `screenProbe=${diagnostics.screenCaptureProbe}`,
    `videoSources=${diagnostics.videoSourceCount}`,
    `hasVideo=${diagnostics.hasVideoSources}`,
    `nativeAudioTrack=${diagnostics.hasNativeAudioTrack}`,
    diagnostics.errorMessage ? `error=${diagnostics.errorMessage}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function shouldShowVirtualDeviceGuidance(
  status: SystemAudioStatus,
  screenCaptureReady: boolean,
): boolean {
  return (
    status === "requires_virtual_device" &&
    screenCaptureReady
  );
}
