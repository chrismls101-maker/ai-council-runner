/**
 * Run Glass setup check (main process) — server, vision, STT, screen capture probe.
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

export interface GlassSetupCheckResult {
  serverHealth: GlassServerHealthForSetup | null;
  screenCaptureProbe: ScreenCaptureProbeStatus;
  screenCaptureDetail?: string;
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

  if (input.skipCaptureProbe || process.env.IIVO_GLASS_E2E === "1") {
    return {
      serverHealth,
      screenCaptureProbe: "unknown",
      screenCaptureDetail:
        process.env.IIVO_GLASS_E2E === "1"
          ? "Screen capture probe skipped in E2E."
          : undefined,
    };
  }

  const target = resolveCaptureDisplay(input.displayTarget);
  const probe = await probeScreenCapturePermission(target.id);
  if (probe.ok) {
    return { serverHealth, screenCaptureProbe: "ready" };
  }

  return {
    serverHealth,
    screenCaptureProbe: mapCaptureErrorToScreenCaptureStatus(probe.error),
    screenCaptureDetail: probe.error,
  };
}
