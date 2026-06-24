/**
 * Transcribe audio via IIVO server POST /api/transcribe-audio.
 */

import { readFile } from "node:fs/promises";
import type { GlassConfig } from "../shared/config.ts";
import { withIivoApiAuthHeaders } from "../shared/iivoApiAuth.ts";
import type { SttTranscribeRequest, SttTranscribeResult } from "../shared/sttTypes.ts";
import { STT_SERVER_UNAVAILABLE_MESSAGE } from "../shared/sttTypes.ts";
import type { FetchLike } from "./sttOpenAI.ts";

export function buildTranscribeAudioUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/transcribe-audio`;
}

export async function transcribeViaServer(
  config: GlassConfig,
  model: string,
  request: SttTranscribeRequest,
  fetchImpl: FetchLike = fetch,
): Promise<SttTranscribeResult> {
  const buffer = await readFile(request.audioPath);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetchImpl(buildTranscribeAudioUrl(config), {
      method: "POST",
      headers: withIivoApiAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        audioBase64: buffer.toString("base64"),
        mimeType: request.mimeType,
        model,
        source: request.source,
      }),
    });
  } catch {
    throw new Error(STT_SERVER_UNAVAILABLE_MESSAGE);
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    text?: string;
    model?: string;
    durationMs?: number;
    warning?: string;
  };

  if (!res.ok) {
    const detail = body.error ?? res.statusText;
    if (res.status === 503) {
      throw new Error(detail || STT_SERVER_UNAVAILABLE_MESSAGE);
    }
    throw new Error(detail || `Server transcription failed (${res.status})`);
  }

  const text = body.text?.trim();
  if (!text) {
    throw new Error("Server returned an empty transcript.");
  }

  return {
    text,
    provider: "openai",
    model: body.model ?? model,
    durationMs: body.durationMs ?? Date.now() - started,
    warning: body.warning,
    endpoint: "server",
  };
}
