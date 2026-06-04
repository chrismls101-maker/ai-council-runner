/**
 * OpenAI audio transcription for IIVO server (Glass STT endpoint).
 */

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
export const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

const ALLOWED_MIME_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
];

export type TranscribeAudioResult = {
  text: string;
  provider: "openai";
  model: string;
  durationMs: number;
  warning?: string;
};

export function isAllowedAudioMime(mimeType: string): boolean {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_MIME_PREFIXES.some((p) => base === p || base.startsWith(p));
}

export function extensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.includes("webm")) return "webm";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("wav")) return "wav";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  return "webm";
}

export function parseTranscriptionResponse(body: unknown): string {
  if (body && typeof body === "object" && "text" in body) {
    const text = (body as { text?: unknown }).text;
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

export function getOpenAiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  model = process.env.IIVO_GLASS_STT_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL,
  fetchImpl: typeof fetch = fetch,
): Promise<TranscribeAudioResult> {
  const started = Date.now();
  const apiKey = getOpenAiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the IIVO server.");
  }
  if (buffer.length === 0) {
    throw new Error("Audio payload is empty.");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error(`Audio exceeds maximum size (${MAX_AUDIO_BYTES} bytes).`);
  }
  if (!isAllowedAudioMime(mimeType)) {
    throw new Error(`Unsupported audio type: ${mimeType}`);
  }

  const dir = await mkdtemp(join(tmpdir(), "iivo-stt-"));
  const filePath = join(dir, `${randomUUID()}.${extensionForMime(mimeType)}`);
  try {
    await writeFile(filePath, buffer);
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType.split(";")[0] });
    form.append("file", blob, filePath.split("/").pop() ?? "audio.webm");
    form.append("model", model);

    const res = await fetchImpl(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      text?: string;
    };
    if (!res.ok) {
      const detail = body.error?.message ?? res.statusText;
      throw new Error(`OpenAI transcription failed (${res.status}): ${detail}`);
    }
    const text = parseTranscriptionResponse(body);
    if (!text) {
      throw new Error("OpenAI returned an empty transcript.");
    }
    return {
      text,
      provider: "openai",
      model,
      durationMs: Date.now() - started,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
