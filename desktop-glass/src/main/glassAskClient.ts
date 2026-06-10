/**
 * IIVO Glass direct ask client (main process — calls /api/glass/ask).
 */

import type { GlassConfig } from "../shared/config.ts";
import type { GlassAskRequest, GlassAskResponse } from "../shared/glassAskTypes.ts";
import { withIivoApiAuthHeaders } from "../shared/iivoApiAuth.ts";

export function buildGlassAskUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask`;
}

export class GlassAskCancelledError extends Error {
  constructor() {
    super("Glass ask cancelled");
    this.name = "GlassAskCancelledError";
  }
}

export function isGlassAskPayloadTooLargeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /\b413\b/.test(err.message) || /payload too large/i.test(err.message);
}

export async function askIivoGlass(
  config: GlassConfig,
  request: GlassAskRequest,
  signal?: AbortSignal,
): Promise<GlassAskResponse> {
  const res = await fetch(buildGlassAskUrl(config), {
    method: "POST",
    headers: withIivoApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ...request,
      responseStyle: request.responseStyle ?? "overlay",
    }),
    signal,
  });

  if (signal?.aborted) {
    throw new GlassAskCancelledError();
  }

  const body = (await res.json().catch(() => ({}))) as GlassAskResponse & {
    error?: string;
    message?: string;
  };

  if (signal?.aborted) {
    throw new GlassAskCancelledError();
  }

  if (!res.ok) {
    const detail = body.error ?? body.message ?? res.statusText;
    if (res.status === 404) {
      throw new Error(
        `Glass ask is not available at ${buildGlassAskUrl(config)} (${detail}). Deploy the latest IIVO server or set IIVO_API_URL to your local server (e.g. http://127.0.0.1:3001).`,
      );
    }
    throw new Error(`IIVO ask failed (${res.status}): ${detail}`);
  }

  if (!body.answer?.trim()) {
    throw new Error("IIVO returned an empty answer.");
  }

  return body;
}
