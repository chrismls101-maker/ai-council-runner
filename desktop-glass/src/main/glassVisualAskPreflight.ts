/**
 * Preflight checks before visual ask (main process).
 */

import type { GlassConfig } from "../shared/config.ts";
import {
  preflightFailure,
  type VisualAskPreflightResult,
} from "../shared/visualAskPreflight.ts";
import { isScreenCaptureProbeReady } from "../shared/screenCaptureProbe.ts";
import { runScreenCaptureProbe } from "./screenCaptureProbe.ts";

export interface GlassServerHealthSnapshot {
  ok: boolean;
  vision?: {
    enabled: boolean;
    configured: boolean;
    reason?: string;
  };
  stt?: {
    configured: boolean;
    enabled?: boolean;
    reason?: string;
    endpoint?: string;
  };
  missingKeys?: string[];
}

export async function fetchGlassServerHealth(
  config: GlassConfig,
  signal?: AbortSignal,
): Promise<GlassServerHealthSnapshot | null> {
  try {
    const res = await fetch(`${config.iivoApiUrl}/api/health`, { signal });
    if (!res.ok) return null;
    return (await res.json()) as GlassServerHealthSnapshot;
  } catch {
    return null;
  }
}

export async function fetchVisionConfig(
  config: GlassConfig,
  signal?: AbortSignal,
): Promise<{ enabled: boolean; configured: boolean; reason?: string } | null> {
  try {
    const res = await fetch(`${config.iivoApiUrl}/api/config/vision`, { signal });
    if (!res.ok) return null;
    return (await res.json()) as { enabled: boolean; configured: boolean; reason?: string };
  } catch {
    return null;
  }
}

export interface RunVisualAskPreflightInput {
  config: GlassConfig;
  prompt: string;
  displayId: number;
  displayLabel: string;
  hasConnectedDisplays: boolean;
  windowBoundsAvailable: boolean;
  signal?: AbortSignal;
  skipCaptureProbe?: boolean;
}

export async function runVisualAskPreflight(
  input: RunVisualAskPreflightInput,
): Promise<VisualAskPreflightResult> {
  if (!input.hasConnectedDisplays || input.displayId <= 0) {
    return preflightFailure("no_display");
  }

  const health = await fetchGlassServerHealth(input.config, input.signal);
  if (!health) {
    return preflightFailure("server_offline");
  }

  const vision =
    health.vision ?? (await fetchVisionConfig(input.config, input.signal));
  if (vision && (!vision.enabled || !vision.configured)) {
    return preflightFailure(
      "vision_disabled",
      vision.reason ?? "Vision is not enabled on the IIVO server.",
    );
  }

  if (input.skipCaptureProbe) {
    return {
      ok: true,
      screenProbe: {
        displayId: input.displayId,
        probe: {
          kind: "screen",
          types: ["screen"],
          ok: true,
          sourceCount: 1,
          sources: [],
          thumbnailEmpty: false,
        },
        status: "ready",
        ready: true,
      },
    };
  }

  const screenProbe = await runScreenCaptureProbe(input.displayId);
  if (!isScreenCaptureProbeReady(screenProbe)) {
    return preflightFailure(
      "capture_permission",
      screenProbe.detail ?? "Screen capture permission probe failed.",
      screenProbe,
    );
  }
  return { ok: true, screenProbe };
}
