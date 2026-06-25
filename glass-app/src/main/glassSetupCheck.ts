/**
 * Run Glass setup check (main process) — server, vision, STT, screen/window/system audio probes.
 */

import type { GlassConfig } from "../shared/config.ts";
import type { GlassServerHealthForSetup } from "../shared/glassCapabilities.ts";
import {
  deriveWindowCaptureStatusFromProbe,
  type ScreenCaptureProbeStatus,
  type WindowCaptureProbeStatus,
} from "../shared/captureSourceEnumeration.ts";
import { probeDesktopCaptureSources } from "./captureSourceProbe.ts";
import { runScreenCaptureProbe } from "./screenCaptureProbe.ts";
import {
  enrichGlassServerHealthSnapshot,
  fetchGlassServerHealth,
} from "./glassVisualAskPreflight.ts";
import { resolveCaptureDisplay } from "./displayRegistry.ts";
import type { GlassDisplayTarget } from "../shared/glassSettings.ts";
import { probeSystemAudioEnumeration } from "./systemAudioProbe.ts";
import type { SystemAudioStatus } from "../shared/systemAudioTypes.ts";

export interface GlassSetupCheckResult {
  serverHealth: GlassServerHealthForSetup | null;
  screenCaptureProbe: ScreenCaptureProbeStatus;
  screenCaptureDetail?: string;
  windowCaptureProbe: WindowCaptureProbeStatus;
  windowCaptureDetail?: string;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  systemAudioDiagnostics?: string;
}

export async function runGlassSetupCheck(input: {
  config: GlassConfig;
  displayTarget: GlassDisplayTarget;
  skipCaptureProbe?: boolean;
}): Promise<GlassSetupCheckResult> {
  const healthFetch = await fetchGlassServerHealth(input.config);
  const rawHealth = healthFetch.snapshot
    ? await enrichGlassServerHealthSnapshot(input.config, healthFetch.snapshot)
    : null;
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
    : {
        reachable: false,
        checkError: healthFetch.error,
      };

  const initial: GlassSetupCheckResult = {
    serverHealth,
    screenCaptureProbe: "unknown",
    windowCaptureProbe: "unknown",
    systemAudioStatus: "not_tested",
    systemAudioDetail: "Run Setup Check to probe screen, window, and system audio separately.",
  };

  if (input.skipCaptureProbe) {
    const e2eStub = process.env.IIVO_GLASS_E2E === "1";
    return {
      ...initial,
      screenCaptureDetail: e2eStub ? "Screen capture probe skipped in E2E." : undefined,
      windowCaptureDetail: e2eStub ? "Window capture probe skipped in E2E." : undefined,
      systemAudioStatus: e2eStub ? "available" : "not_tested",
      systemAudioDetail: e2eStub
        ? "System audio simulated for E2E."
        : "System audio probe skipped.",
    };
  }

  const target = resolveCaptureDisplay(input.displayTarget);

  const screenSnapshot = await runScreenCaptureProbe(target.id);
  const windowEnum = await probeDesktopCaptureSources({
    kind: "window",
    types: ["window"],
    displayId: target.id,
  });

  const windowDerived = deriveWindowCaptureStatusFromProbe(windowEnum);

  const audioProbe = await probeSystemAudioEnumeration(
    target.id,
    screenSnapshot.status,
  );

  return {
    serverHealth,
    screenCaptureProbe: screenSnapshot.status,
    screenCaptureDetail: screenSnapshot.detail,
    windowCaptureProbe: windowDerived.status,
    windowCaptureDetail: windowDerived.detail,
    systemAudioStatus: audioProbe.status,
    systemAudioDetail: audioProbe.detail,
    systemAudioDiagnostics: audioProbe.diagnosticsLine,
  };
}

/** Lightweight server-only health ping (no capture probes). */
export async function runGlassServerHealthCheck(
  config: GlassConfig,
): Promise<GlassServerHealthForSetup | null> {
  const healthFetch = await fetchGlassServerHealth(config);
  const rawHealth = healthFetch.snapshot
    ? await enrichGlassServerHealthSnapshot(config, healthFetch.snapshot)
    : null;
  if (rawHealth) {
    return {
      reachable: true,
      vision: rawHealth.vision,
      stt: rawHealth.stt
        ? {
            configured: rawHealth.stt.configured,
            enabled: rawHealth.stt.enabled ?? rawHealth.stt.configured,
            reason: rawHealth.stt.reason,
          }
        : undefined,
    };
  }
  return {
    reachable: false,
    checkError: healthFetch.error,
  };
}
