/**
 * IIVO Glass direct ask client (main process — calls /api/glass/ask).
 */

import type { GlassConfig } from "../shared/config.ts";
import type { GlassAskRequest, GlassAskResponse } from "../shared/glassAskTypes.ts";
import { withIivoApiAuthHeaders } from "../shared/iivoApiAuth.ts";

export function buildGlassAskUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask`;
}

export function buildGlassAskStreamUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/glass/ask/stream`;
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

/**
 * Streaming variant: connects to /api/glass/ask/stream (SSE), calls
 * `onToken` with the accumulated partial answer on every chunk, and
 * resolves with the final GlassAskResponse when the stream closes.
 *
 * Falls back to askIivoGlass if the server doesn't support the stream
 * endpoint (404) or when the signal is already aborted.
 */
export async function askIivoGlassStream(
  config: GlassConfig,
  request: GlassAskRequest,
  onToken: (partial: string) => void,
  signal?: AbortSignal,
): Promise<GlassAskResponse> {
  if (signal?.aborted) throw new GlassAskCancelledError();

  let res: Response;
  try {
    res = await fetch(buildGlassAskStreamUrl(config), {
      method: "POST",
      headers: withIivoApiAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...request,
        responseStyle: request.responseStyle ?? "overlay",
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw new GlassAskCancelledError();
    throw err;
  }

  // If server doesn't have the streaming route yet, fall back gracefully.
  if (res.status === 404) {
    return askIivoGlass(config, request, signal);
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`IIVO ask stream failed (${res.status}): ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let finalResponse: GlassAskResponse | undefined;

  try {
    while (true) {
      if (signal?.aborted) throw new GlassAskCancelledError();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        let parsed: {
          token?: string;
          done?: boolean;
          error?: string;
          answer?: string;
          [k: string]: unknown;
        };
        try {
          parsed = JSON.parse(data) as typeof parsed;
        } catch {
          continue;
        }
        if (parsed.error) {
          throw new Error(`IIVO ask stream error: ${parsed.error}`);
        }
        if (parsed.token) {
          accumulated += parsed.token;
          onToken(accumulated);
        }
        if (parsed.done) {
          finalResponse = parsed as unknown as GlassAskResponse;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (signal?.aborted) throw new GlassAskCancelledError();

  if (!finalResponse?.answer?.trim()) {
    throw new Error("IIVO stream ended without a final answer.");
  }

  return finalResponse;
}
