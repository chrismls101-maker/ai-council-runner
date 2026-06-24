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

function openAiTranscriptionErrorMessage(status: number, detail: string): string {
  if (status === 401) return "OpenAI API key rejected.";
  if (
    status === 429 ||
    /quota|rate limit|too many requests|insufficient_quota/i.test(detail)
  ) {
    return `OpenAI quota or rate limit exceeded: ${detail}`;
  }
  if (status === 402 || /billing|payment required/i.test(detail)) {
    return `OpenAI billing issue: ${detail}`;
  }
  if (
    status === 415 ||
    /unsupported.*(audio|format|media)|invalid.*(audio|format|file)/i.test(detail)
  ) {
    return `Unsupported audio format: ${detail}`;
  }
  return `OpenAI transcription failed (${status}): ${detail}`;
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
    throw new Error(openAiTranscriptionErrorMessage(res.status, detail));
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
