/**
 * Full capture permission diagnostics report (shared, testable formatting).
 */

import type { GlassAppIdentityReport, DuplicateGlassAppBundle } from "./glassAppIdentityReport.ts";
import { evaluatePackagedIdentity } from "./glassAppIdentityReport.ts";
import type { CaptureSourceProbeResult } from "./captureSourceEnumeration.ts";
import {
  formatCaptureSourceProbeLine,
  SCREEN_READY_SYSTEM_AUDIO_UNAVAILABLE_DETAIL,
  TCC_RESET_SCREEN_CAPTURE_STEPS,
} from "./captureSourceEnumeration.ts";
import type { ScreenCaptureProbeStatus } from "./captureSourceEnumeration.ts";
import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import { isSourceEnumerationFailedMessage } from "./systemAudioProbe.ts";

export interface CaptureDiagnosticsReport {
  generatedAt: string;
  runningMode: "packaged" | "dev";
  appIdentity: GlassAppIdentityReport;
  selectedDisplayId: number;
  selectedDisplayLabel?: string;
  probes: CaptureSourceProbeResult[];
  screenCaptureProbe: ScreenCaptureProbeStatus;
  screenCaptureDetail?: string;
  windowCaptureProbe: ScreenCaptureProbeStatus;
  windowCaptureDetail?: string;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  screenRecordingGuess: string;
  systemAudioGuess: string;
  exactError?: string;
  suggestedNextAction: string;
  duplicateAppBundles: DuplicateGlassAppBundle[];
  tccResetCommands?: string;
  lines: string[];
}

export function guessScreenRecordingStatus(
  screenProbe: ScreenCaptureProbeStatus,
  screenEnum: CaptureSourceProbeResult | undefined,
): string {
  if (screenProbe === "ready") return "Screen Recording appears granted (non-empty screen thumbnail).";
  if (screenProbe === "permission_required") {
    return "Screen Recording likely denied or not yet applied — empty thumbnail or permission error.";
  }
  if (screenProbe === "source_enumeration_failed") {
    const msg = screenEnum?.errorMessage ?? "";
    if (isSourceEnumerationFailedMessage(msg)) {
      return "desktopCapturer threw “failed to get sources” — macOS TCC or wrong app identity/path.";
    }
    return "Screen sources could not be enumerated.";
  }
  return "Screen Recording not verified yet.";
}

export function guessSystemAudioStatus(
  systemStatus: SystemAudioStatus,
  screenReady: boolean,
  systemProbe?: CaptureSourceProbeResult,
): string {
  if (systemStatus === "available") return "System audio loopback available.";
  if (systemStatus === "requires_virtual_device") {
    return "Screen works; macOS did not expose a native loopback audio track.";
  }
  if (systemStatus === "source_enumeration_failed" && screenReady) {
    return SCREEN_READY_SYSTEM_AUDIO_UNAVAILABLE_DETAIL;
  }
  if (systemStatus === "source_enumeration_failed") {
    const msg = systemProbe?.errorMessage ?? "";
    if (isSourceEnumerationFailedMessage(msg)) {
      return "Same “failed to get sources” as screen — likely Screen Recording not granted to this app.";
    }
    return "System audio enumeration failed.";
  }
  if (systemStatus === "not_tested" && screenReady) {
    return "Screen enumeration OK; loopback not verified until Retry System Audio.";
  }
  return `System audio status: ${systemStatus}`;
}

export function buildSuggestedNextAction(input: {
  screenProbe: ScreenCaptureProbeStatus;
  windowProbe: ScreenCaptureProbeStatus;
  systemStatus: SystemAudioStatus;
  identityOk: boolean;
  isPackaged: boolean;
  screenEnumFailed: boolean;
}): string {
  if (!input.isPackaged) {
    return "Build and open the packaged IIVO Glass.app (npm run glass:package:mac:arm64 && npm run glass:open:packaged), then run Capture Diagnostics there.";
  }
  if (!input.identityOk) {
    return "Reinstall or open the signed packaged app so bundle id is com.iivo.glass, then grant permissions to that binary.";
  }
  if (input.screenProbe === "ready" && input.systemStatus === "source_enumeration_failed") {
    return "Screen Recording is OK. Use Retry System Audio; if loopback still fails, configure a virtual audio device.";
  }
  if (input.screenProbe === "ready" && input.systemStatus === "requires_virtual_device") {
    return "Screen Recording is OK. Install BlackHole or Loopback for system audio capture.";
  }
  if (
    input.screenEnumFailed ||
    input.screenProbe === "source_enumeration_failed" ||
    input.screenProbe === "permission_required"
  ) {
    return `Grant Screen Recording to the app path shown above, quit and reopen, then run Capture Diagnostics. If still failing:\n${TCC_RESET_SCREEN_CAPTURE_STEPS}`;
  }
  if (input.windowProbe === "error" && input.screenProbe === "ready") {
    return "Window enumeration failed but screen works — window-specific capture may be limited; screen capture should still work.";
  }
  if (input.screenProbe === "ready") {
    return "Capture permissions look good. Try Capture Screen or a visual ask.";
  }
  return "Run Capture Diagnostics again after changing Privacy settings.";
}

export function formatCaptureDiagnosticsReport(
  report: CaptureDiagnosticsReport,
): string[] {
  const id = report.appIdentity;
  const lines: string[] = [
    `Running mode: ${report.runningMode}`,
    `App: ${id.appName} v${id.version}`,
    `Packaged: ${id.isPackaged} | defaultApp: ${id.defaultApp}`,
    `Bundle id: ${id.bundleIdentifier ?? "(unknown)"} (expected ${id.expectedBundleId})`,
    `Exec: ${id.execPath}`,
    `App path: ${id.appPath}`,
    `Privacy list label: ${id.privacySettingsLabel}`,
    ...id.identityNotes.map((n) => `• ${n}`),
    `Selected display: ${report.selectedDisplayId}${report.selectedDisplayLabel ? ` (${report.selectedDisplayLabel})` : ""}`,
    ...report.probes.map((p) => formatCaptureSourceProbeLine(p)),
    `Screen Capture: ${report.screenCaptureProbe}${report.screenCaptureDetail ? ` — ${report.screenCaptureDetail}` : ""}`,
    `Window Capture: ${report.windowCaptureProbe}${report.windowCaptureDetail ? ` — ${report.windowCaptureDetail}` : ""}`,
    `System Audio: ${report.systemAudioStatus}${report.systemAudioDetail ? ` — ${report.systemAudioDetail}` : ""}`,
    `Screen Recording guess: ${report.screenRecordingGuess}`,
    `System audio guess: ${report.systemAudioGuess}`,
  ];
  if (report.exactError) {
    lines.push(`Exact error: ${report.exactError}`);
  }
  if (report.duplicateAppBundles.length > 1) {
    lines.push("Multiple IIVO Glass.app bundles found:");
    for (const bundle of report.duplicateAppBundles) {
      lines.push(`  - ${bundle.path}`);
    }
  }
  lines.push(`Next: ${report.suggestedNextAction}`);
  if (report.tccResetCommands) {
    lines.push(`TCC reset:\n${report.tccResetCommands}`);
  }
  return lines;
}

export function buildCaptureDiagnosticsReport(input: Omit<CaptureDiagnosticsReport, "lines">): CaptureDiagnosticsReport {
  const withEval = {
    ...input.appIdentity,
    ...evaluatePackagedIdentity(input.appIdentity),
  };
  const report: CaptureDiagnosticsReport = {
    ...input,
    appIdentity: withEval,
    lines: [],
  };
  report.lines = formatCaptureDiagnosticsReport(report);
  return report;
}
