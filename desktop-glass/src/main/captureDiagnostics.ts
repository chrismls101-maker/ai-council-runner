/**
 * Full capture diagnostics orchestration (main process).
 */

import {
  buildCaptureDiagnosticsReport,
  guessScreenRecordingStatus,
  guessSystemAudioStatus,
  buildSuggestedNextAction,
} from "../shared/captureDiagnostics.ts";
import type { CaptureDiagnosticsReport } from "../shared/captureDiagnostics.ts";
import { deriveWindowCaptureStatusFromProbe } from "../shared/captureSourceEnumeration.ts";
import { probeDesktopCaptureSources } from "./captureSourceProbe.ts";
import { runScreenCaptureProbe } from "./screenCaptureProbe.ts";
import {
  collectGlassAppIdentityReport,
  findDuplicateGlassAppBundles,
} from "./glassAppIdentityDiagnostic.ts";
import { probeSystemAudioEnumeration } from "./systemAudioProbe.ts";
import type { GlassDisplayTarget } from "../shared/glassSettings.ts";
import { resolveCaptureDisplay } from "./displayRegistry.ts";

export async function runCaptureDiagnosticsReport(input: {
  displayTarget: GlassDisplayTarget;
}): Promise<CaptureDiagnosticsReport> {
  const target = resolveCaptureDisplay(input.displayTarget);
  const appIdentity = collectGlassAppIdentityReport();
  const duplicateAppBundles = findDuplicateGlassAppBundles(process.execPath);

  const screenSnapshot = await runScreenCaptureProbe(target.id);
  const screenProbe = screenSnapshot.probe;
  const windowProbe = await probeDesktopCaptureSources({
    kind: "window",
    types: ["window"],
    displayId: target.id,
  });
  const combinedProbe = await probeDesktopCaptureSources({
    kind: "screen_and_window",
    types: ["screen", "window"],
    displayId: target.id,
  });
  const systemAudioScreenProbe = await probeDesktopCaptureSources({
    kind: "system_audio_screen",
    types: ["screen"],
    displayId: target.id,
  });

  const windowDerived = deriveWindowCaptureStatusFromProbe(windowProbe);

  const audioProbe = await probeSystemAudioEnumeration(
    target.id,
    screenSnapshot.status,
  );

  const screenEnumFailed =
    !screenProbe.ok || screenSnapshot.status === "source_enumeration_failed";
  const exactError =
    screenProbe.errorMessage ??
    systemAudioScreenProbe.errorMessage ??
    audioProbe.diagnostics.errorMessage;

  const suggestedNextAction = buildSuggestedNextAction({
    screenProbe: screenSnapshot.status,
    windowProbe: windowDerived.status,
    systemStatus: audioProbe.status,
    identityOk: appIdentity.identityOk,
    isPackaged: appIdentity.isPackaged,
    screenEnumFailed,
  });

  const report = buildCaptureDiagnosticsReport({
    generatedAt: new Date().toISOString(),
    runningMode: appIdentity.runningMode,
    appIdentity,
    selectedDisplayId: target.id,
    selectedDisplayLabel: target.label,
    probes: [screenProbe, windowProbe, combinedProbe, systemAudioScreenProbe],
    screenCaptureProbe: screenSnapshot.status,
    screenCaptureDetail: screenSnapshot.detail,
    windowCaptureProbe: windowDerived.status,
    windowCaptureDetail: windowDerived.detail,
    systemAudioStatus: audioProbe.status,
    systemAudioDetail: audioProbe.detail,
    screenRecordingGuess: guessScreenRecordingStatus(screenSnapshot.status, screenProbe),
    systemAudioGuess: guessSystemAudioStatus(
      audioProbe.status,
      screenSnapshot.status === "ready",
      systemAudioScreenProbe,
    ),
    exactError,
    suggestedNextAction,
    duplicateAppBundles,
    tccResetCommands: screenEnumFailed
      ? "tccutil reset ScreenCapture com.iivo.glass\ntccutil reset Microphone com.iivo.glass"
      : undefined,
  });

  console.info("[IIVO Glass] capture diagnostics:\n" + report.lines.join("\n"));
  return report;
}
