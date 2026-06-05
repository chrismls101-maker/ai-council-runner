/**
 * Run Glass setup check (main process) — server, vision, STT, screen + system audio probes.
 */

import type { GlassConfig } from "../shared/config.ts";
import type {
  GlassServerHealthForSetup,
  ScreenCaptureProbeStatus,
} from "../shared/glassCapabilities.ts";
import { mapCaptureErrorToScreenCaptureStatus } from "../shared/glassCapabilities.ts";
import { probeScreenCapturePermission } from "./capture.ts";
import { fetchGlassServerHealth } from "./glassVisualAskPreflight.ts";
import { resolveCaptureDisplay } from "./displayRegistry.ts";
import type { GlassDisplayTarget } from "../shared/glassSettings.ts";
import { probeSystemAudioEnumeration } from "./systemAudioProbe.ts";
import type { SystemAudioStatus } from "../shared/systemAudioTypes.ts";

export interface GlassSetupCheckResult {
  serverHealth: GlassServerHealthForSetup | null;
  screenCaptureProbe: ScreenCaptureProbeStatus;
  screenCaptureDetail?: string;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  systemAudioDiagnostics?: string;
}

export async function runGlassSetupCheck(input: {
  config: GlassConfig;
  displayTarget: GlassDisplayTarget;
  skipCaptureProbe?: boolean;
}): Promise<GlassSetupCheckResult> {
  const rawHealth = await fetchGlassServerHealth(input.config);
  const serverHealth: GlassServerHealthForSetup | null = rawHealth
    ? {
        reachable: true,
        vision: rawHealth.vision,
        stt: rawHealth.stt
          ? {
              configured: rawHealth.stt.configured,
              enabled: rawHealth.stt.enabled ?? rawHealth.stt.configured,
              reason: rawHealth.stt.reason,
            }
          : undefined,
      }
    : { reachable: false };

  const initial: GlassSetupCheckResult = {
    serverHealth,
    screenCaptureProbe: "unknown",
    systemAudioStatus: "not_tested",
    systemAudioDetail: "Run Setup Check to probe screen and system audio separately.",
  };

  if (input.skipCaptureProbe || process.env.IIVO_GLASS_E2E === "1") {
    return {
      ...initial,
      screenCaptureDetail:
        process.env.IIVO_GLASS_E2E === "1"
          ? "Screen capture probe skipped in E2E."
          : undefined,
      systemAudioStatus: "not_tested",
      systemAudioDetail: "System audio probe skipped.",
    };
  }

  const target = resolveCaptureDisplay(input.displayTarget);

  const screenProbe = await probeScreenCapturePermission(target.id);
  const screenCaptureProbe: ScreenCaptureProbeStatus = screenProbe.ok
    ? "ready"
    : mapCaptureErrorToScreenCaptureStatus(screenProbe.error);
  const screenCaptureDetail = screenProbe.ok ? undefined : screenProbe.error;

  const audioProbe = await probeSystemAudioEnumeration(target.id, screenCaptureProbe);

  return {
    serverHealth,
    screenCaptureProbe,
    screenCaptureDetail,
    systemAudioStatus: audioProbe.status,
    systemAudioDetail: audioProbe.detail,
    systemAudioDiagnostics: audioProbe.diagnosticsLine,
  };
}
