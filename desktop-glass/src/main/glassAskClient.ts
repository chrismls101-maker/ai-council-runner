/**
 * IIVO Glass direct ask client (main process — calls /api/glass/ask).
 */

import type { GlassConfig } from "../shared/config.ts";
import type { GlassAskRequest, GlassAskResponse } from "../shared/glassAskTypes.ts";

export function buildGlassAskUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask`;
}

export async function askIivoGlass(
  config: GlassConfig,
  request: GlassAskRequest,
): Promise<GlassAskResponse> {
  const res = await fetch(buildGlassAskUrl(config), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, responseStyle: "overlay" }),
  });

  const body = (await res.json().catch(() => ({}))) as GlassAskResponse & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    const detail = body.error ?? body.message ?? res.statusText;
    throw new Error(`IIVO ask failed (${res.status}): ${detail}`);
  }

  if (!body.answer?.trim()) {
    throw new Error("IIVO returned an empty answer.");
  }

  return body;
}
