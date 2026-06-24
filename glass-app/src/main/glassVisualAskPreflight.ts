/**
 * Preflight checks before visual ask (main process).
 */

import type { GlassConfig } from "../shared/config.ts";
import { iivoApiAuthHeaders } from "../shared/iivoApiAuth.ts";
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

export interface GlassServerHealthFetchResult {
  snapshot: GlassServerHealthSnapshot | null;
  httpStatus?: number;
  error?: string;
}

export async function fetchGlassServerHealth(
  config: GlassConfig,
  signal?: AbortSignal,
): Promise<GlassServerHealthFetchResult> {
  try {
    const res = await fetch(`${config.iivoApiUrl}/api/health`, {
      signal,
      headers: iivoApiAuthHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) {
        return {
          snapshot: null,
          httpStatus: 401,
          error:
            "Server rejected API credentials (401). Rebuild Glass with a matching IIVO_GLASS_API_SECRET.",
        };
      }
      return {
        snapshot: null,
        httpStatus: res.status,
        error: `Health check failed (HTTP ${res.status}).`,
      };
    }
    return { snapshot: (await res.json()) as GlassServerHealthSnapshot };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return {
      snapshot: null,
      error: `Could not reach ${config.iivoApiUrl}: ${message}`,
    };
  }
}

export async function fetchVisionConfig(
  config: GlassConfig,
  signal?: AbortSignal,
): Promise<{ enabled: boolean; configured: boolean; reason?: string } | null> {
  try {
    const res = await fetch(`${config.iivoApiUrl}/api/config/vision`, {
      signal,
      headers: iivoApiAuthHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as { enabled: boolean; configured: boolean; reason?: string };
  } catch {
    return null;
  }
}

/** Older /api/health payloads omit vision/stt — hydrate from dedicated endpoints. */
export async function enrichGlassServerHealthSnapshot(
  config: GlassConfig,
  snapshot: GlassServerHealthSnapshot,
  signal?: AbortSignal,
): Promise<GlassServerHealthSnapshot> {
  const enriched: GlassServerHealthSnapshot = { ...snapshot };

  if (!enriched.vision) {
    const vision = await fetchVisionConfig(config, signal);
    if (vision) enriched.vision = vision;
  }

  if (!enriched.stt) {
    const openAiMissing = enriched.missingKeys?.includes("OPENAI_API_KEY") ?? false;
    const configured = !openAiMissing && enriched.ok !== false;
    enriched.stt = {
      configured,
      enabled: configured,
      endpoint: "/api/transcribe-audio",
      reason: openAiMissing
        ? "OpenAI API key not configured on server (OPENAI_API_KEY)."
        : undefined,
    };
  }

  return enriched;
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

  const healthResult = await fetchGlassServerHealth(input.config, input.signal);
  if (!healthResult.snapshot) {
    return preflightFailure("server_offline", healthResult.error);
  }
  const health = await enrichGlassServerHealthSnapshot(
    input.config,
    healthResult.snapshot,
    input.signal,
  );

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
