/**
 * OpenAI speech-to-text in Glass main process (API key never leaves main).
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { SttTranscribeRequest, SttTranscribeResult } from "../shared/sttTypes.ts";
import { audioExtensionForMime } from "../shared/audioPersistence.ts";

export const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

export type FetchLike = typeof fetch;

export function buildOpenAITranscriptionFormData(
  request: SttTranscribeRequest,
  fileBuffer: Buffer,
): FormData {
  const ext = audioExtensionForMime(request.mimeType);
  const filename = `${basename(request.audioPath).replace(/\.[^.]+$/, "")}.${ext}`;
  const blob = new Blob([new Uint8Array(fileBuffer)], {
    type: request.mimeType.split(";")[0],
  });
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", "MODEL_PLACEHOLDER");
  if (request.language?.trim()) {
    form.append("language", request.language.trim());
  }
  return form;
}

export function parseOpenAITranscriptionResponse(body: unknown): string {
  if (typeof body === "string") return body.trim();
  if (body && typeof body === "object" && "text" in body) {
    const text = (body as { text?: unknown }).text;
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

export async function transcribeOpenAI(
  apiKey: string,
  model: string,
  request: SttTranscribeRequest,
  fetchImpl: FetchLike = fetch,
): Promise<SttTranscribeResult> {
  const started = Date.now();
  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(request.audioPath);
  } catch {
    throw new Error("Could not read audio file for transcription.");
  }
  if (fileBuffer.length === 0) {
    throw new Error("Audio file is empty.");
  }

  const form = buildOpenAITranscriptionFormData(request, fileBuffer);
  form.set("model", model);

  let res: Response;
  try {
    res = await fetchImpl(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    throw new Error("Network failure contacting OpenAI transcription API.");
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    text?: string;
  };

  if (!res.ok) {
    const detail = body.error?.message ?? res.statusText;
    if (res.status === 401) throw new Error("OpenAI API key rejected.");
    if (res.status === 415 || /format|audio/i.test(detail)) {
      throw new Error(`Unsupported audio format: ${detail}`);
    }
    throw new Error(`OpenAI transcription failed (${res.status}): ${detail}`);
  }

  const text = parseOpenAITranscriptionResponse(body);
  if (!text) {
    throw new Error("OpenAI returned an empty transcript.");
  }

  return {
    text,
    provider: "openai",
    model,
    durationMs: Date.now() - started,
  };
}
