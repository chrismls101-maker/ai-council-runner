/**
 * desktopCapturer source enumeration — shared probe types and status mapping.
 */

import { isSourceEnumerationFailedMessage } from "./systemAudioProbe.ts";

export type DesktopCaptureSourceType = "screen" | "window";

export type CaptureSourceProbeKind =
  | "screen"
  | "window"
  | "screen_and_window"
  | "system_audio_screen";

export interface RedactedCaptureSource {
  id: string;
  name: string;
  displayId?: string;
}

export interface CaptureSourceProbeResult {
  kind: CaptureSourceProbeKind;
  types: DesktopCaptureSourceType[];
  ok: boolean;
  sourceCount: number;
  sources: RedactedCaptureSource[];
  selectedDisplayId?: number;
  matchedDisplayId?: string;
  thumbnailEmpty?: boolean;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
}

export type ScreenCaptureProbeStatus =
  | "unknown"
  | "ready"
  | "permission_required"
  | "source_enumeration_failed"
  | "error";

export type WindowCaptureProbeStatus = ScreenCaptureProbeStatus;

export const SCREEN_SOURCE_ENUMERATION_USER_MESSAGE =
  "Screen sources could not be enumerated. This usually means macOS has not granted Screen Recording to this exact app identity.";

export const WINDOW_SOURCE_ENUMERATION_USER_MESSAGE =
  "Window sources could not be enumerated. Grant Screen Recording to the exact IIVO Glass.app you are launching.";

export const SCREEN_READY_SYSTEM_AUDIO_UNAVAILABLE_DETAIL =
  "Screen capture works. System audio source is unavailable.";

export const MULTIPLE_APP_BUNDLES_HINT =
  "If multiple IIVO Glass.app copies exist, grant Screen Recording to the one you are launching.";

export const TCC_RESET_SCREEN_CAPTURE_STEPS = [
  "Quit IIVO Glass completely.",
  "Run in Terminal:",
  "  tccutil reset ScreenCapture com.iivo.glass",
  "  tccutil reset Microphone com.iivo.glass",
  "Reopen the packaged IIVO Glass.app from the same path shown in diagnostics.",
  "Trigger Capture once and approve the macOS prompt.",
  "Quit and reopen IIVO Glass again.",
  "Run Capture Diagnostics in Setup.",
].join("\n");

export function redactSourceName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}…`;
}

export function redactCaptureSources(
  sources: { id: string; name: string; display_id?: string }[],
): RedactedCaptureSource[] {
  return sources.map((s) => ({
    id: s.id,
    name: redactSourceName(s.name),
    displayId: s.display_id,
  }));
}

export function mapEnumerationErrorToScreenCaptureStatus(
  message: string,
): ScreenCaptureProbeStatus {
  if (isSourceEnumerationFailedMessage(message)) {
    return "source_enumeration_failed";
  }
  if (/permission|screen recording|empty image|not allowed|denied/i.test(message)) {
    return "permission_required";
  }
  return "error";
}

export function deriveScreenCaptureStatusFromProbe(
  probe: CaptureSourceProbeResult,
): { status: ScreenCaptureProbeStatus; detail?: string } {
  if (!probe.ok) {
    const message = probe.errorMessage ?? "Screen source enumeration failed.";
    const status = mapEnumerationErrorToScreenCaptureStatus(message);
    const detail =
      status === "source_enumeration_failed"
        ? [SCREEN_SOURCE_ENUMERATION_USER_MESSAGE, message, MULTIPLE_APP_BUNDLES_HINT]
            .filter(Boolean)
            .join(" ")
        : message;
    return { status, detail };
  }
  if (probe.sourceCount === 0) {
    return {
      status: "source_enumeration_failed",
      detail: [
        SCREEN_SOURCE_ENUMERATION_USER_MESSAGE,
        "No screen sources returned from desktopCapturer.",
        MULTIPLE_APP_BUNDLES_HINT,
      ].join(" "),
    };
  }
  if (probe.thumbnailEmpty) {
    return {
      status: "permission_required",
      detail:
        "Screen capture returned an empty thumbnail. On macOS, grant Screen Recording permission to IIVO Glass.",
    };
  }
  return { status: "ready" };
}

export function deriveWindowCaptureStatusFromProbe(
  probe: CaptureSourceProbeResult,
): { status: WindowCaptureProbeStatus; detail?: string } {
  if (!probe.ok) {
    const message = probe.errorMessage ?? "Window source enumeration failed.";
    const status = mapEnumerationErrorToScreenCaptureStatus(message);
    const detail =
      status === "source_enumeration_failed"
        ? [WINDOW_SOURCE_ENUMERATION_USER_MESSAGE, message].filter(Boolean).join(" ")
        : message;
    return { status, detail };
  }
  if (probe.sourceCount === 0) {
    return {
      status: "error",
      detail: "No window sources returned (this can be normal if no other apps have visible windows).",
    };
  }
  return { status: "ready" };
}

export function formatCaptureSourceProbeLine(probe: CaptureSourceProbeResult): string {
  const base = `${probe.kind}: ${probe.ok ? "pass" : "fail"} count=${probe.sourceCount}`;
  if (probe.errorMessage) {
    return `${base} error=${probe.errorName ?? "Error"}:${probe.errorMessage}`;
  }
  return base;
}
