/**
 * Main-process system audio enumeration probe (desktopCapturer, separate from video capture).
 */

import { app, desktopCapturer, screen } from "electron";
import { GLASS_BUNDLE_ID, glassMenuAppName } from "../shared/glassAppIdentity.ts";
import type { ScreenCaptureProbeStatus } from "../shared/glassCapabilities.ts";
import {
  formatSystemAudioProbeDiagnostics,
  resolveSystemAudioProbeStatus,
  type SystemAudioProbeDiagnostics,
} from "../shared/systemAudioProbe.ts";
import type { SystemAudioStatus } from "../shared/systemAudioTypes.ts";

export interface SystemAudioEnumerationProbeResult {
  status: SystemAudioStatus;
  detail: string;
  diagnostics: SystemAudioProbeDiagnostics;
  diagnosticsLine: string;
}

export async function probeSystemAudioEnumeration(
  displayId: number,
  screenCaptureProbe: ScreenCaptureProbeStatus,
): Promise<SystemAudioEnumerationProbeResult> {
  const screenCaptureReady = screenCaptureProbe === "ready";
  const baseDiagnostics: SystemAudioProbeDiagnostics = {
    platform: process.platform,
    packaged: app.isPackaged,
    appName: glassMenuAppName(app.isPackaged),
    bundleId: app.isPackaged ? GLASS_BUNDLE_ID : "dev.electron",
    displayId,
    screenCaptureProbe,
    videoSourceCount: 0,
    hasVideoSources: false,
    hasNativeAudioTrack: false,
  };

  if (process.env.IIVO_GLASS_E2E === "1") {
    const resolved = resolveSystemAudioProbeStatus({
      screenCaptureReady,
      videoSourceCount: screenCaptureReady ? 1 : 0,
      videoThumbnailEmpty: !screenCaptureReady,
      platform: process.platform,
      hasNativeAudioTrack: false,
    });
    const diagnostics = {
      ...baseDiagnostics,
      videoSourceCount: screenCaptureReady ? 1 : 0,
      hasVideoSources: screenCaptureReady,
    };
    const diagnosticsLine = formatSystemAudioProbeDiagnostics(diagnostics);
    console.info(`[IIVO Glass] system audio probe (E2E): ${diagnosticsLine}`);
    return { ...resolved, diagnostics, diagnosticsLine };
  }

  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 64, height: 64 },
    });
    baseDiagnostics.videoSourceCount = sources.length;
    baseDiagnostics.hasVideoSources = sources.length > 0;

    if (sources.length === 0) {
      const resolved = resolveSystemAudioProbeStatus({
        screenCaptureReady,
        videoSourceCount: 0,
        videoThumbnailEmpty: true,
        platform: process.platform,
        enumerationError: "No screen sources available for system audio enumeration.",
      });
      const diagnosticsLine = formatSystemAudioProbeDiagnostics(baseDiagnostics);
      console.info(`[IIVO Glass] system audio probe: ${diagnosticsLine}`);
      return {
        ...resolved,
        diagnostics: baseDiagnostics,
        diagnosticsLine,
      };
    }

    const targetId = String(display.id);
    const source = sources.find((s) => s.display_id === targetId) ?? sources[0];
    const videoThumbnailEmpty = source.thumbnail.isEmpty();

    const resolved = resolveSystemAudioProbeStatus({
      screenCaptureReady,
      videoSourceCount: sources.length,
      videoThumbnailEmpty,
      platform: process.platform,
      hasNativeAudioTrack: false,
    });
    const diagnosticsLine = formatSystemAudioProbeDiagnostics(baseDiagnostics);
    console.info(`[IIVO Glass] system audio probe: ${diagnosticsLine}`);
    return {
      ...resolved,
      diagnostics: baseDiagnostics,
      diagnosticsLine,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    baseDiagnostics.errorMessage = errorMessage;
    const resolved = resolveSystemAudioProbeStatus({
      screenCaptureReady,
      enumerationError: errorMessage,
      videoSourceCount: 0,
      videoThumbnailEmpty: true,
      platform: process.platform,
    });
    const detail =
      resolved.detail +
      (resolved.detail ? " " : "") +
      `(${formatSystemAudioProbeDiagnostics(baseDiagnostics)})`;
    const diagnosticsLine = formatSystemAudioProbeDiagnostics(baseDiagnostics);
    console.warn(`[IIVO Glass] system audio probe failed: ${diagnosticsLine}`);
    return {
      status: resolved.status,
      detail,
      diagnostics: baseDiagnostics,
      diagnosticsLine,
    };
  }
}
