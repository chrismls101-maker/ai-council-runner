/**
 * ElevenLabs TTS for Glass main process (Sorting Hat + greeting).
 * Uses the canonical IIVO voice spec (Matilda + eleven_turbo_v2_5 + voice_settings).
 */

import { loadGlassEnv } from "./loadGlassEnv.ts";
import {
  IIVO_ELEVENLABS_MODEL,
  IIVO_ELEVENLABS_VOICE_ID,
  IIVO_ELEVENLABS_VOICE_SETTINGS,
  describeIivoVoice,
} from "../shared/iivoVoiceSpec.ts";
import { parseUiLocale, resolveLocaleVoiceConfig } from "../shared/glassLocale.ts";
import type { GlassUiLocale } from "../shared/glassLocale.ts";

export { describeIivoVoice as describeElevenLabsVoice };

let envLoaded = false;

function ensureGlassEnv(): void {
  if (envLoaded) return;
  loadGlassEnv();
  envLoaded = true;
}

export function glassElevenLabsConfig(locale?: GlassUiLocale): {
  apiKey: string | undefined;
  voiceId: string;
  model: string;
} {
  ensureGlassEnv();
  const loc = parseUiLocale(locale);
  const resolved = resolveLocaleVoiceConfig(loc);
  return {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId:
      loc === "en" && process.env.ELEVENLABS_VOICE_ID?.trim()
        ? process.env.ELEVENLABS_VOICE_ID.trim()
        : resolved.voiceId,
    model:
      loc === "en" && process.env.ELEVENLABS_MODEL?.trim()
        ? process.env.ELEVENLABS_MODEL.trim()
        : resolved.model,
  };
}

/** Direct ElevenLabs — returns null when no local API key. */
export async function fetchElevenLabsTtsBuffer(
  text: string,
  locale?: GlassUiLocale,
): Promise<Buffer | null> {
  ensureGlassEnv();
  const { apiKey, voiceId, model } = glassElevenLabsConfig(locale);
  if (!apiKey) {
    console.warn("[Glass TTS] ELEVENLABS_API_KEY missing after loadGlassEnv");
    return null;
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: IIVO_ELEVENLABS_VOICE_SETTINGS,
    }),
  });
  if (!res.ok) {
    console.error("[Glass TTS] ElevenLabs error", res.status, "voice=", voiceId);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(
    `[Glass TTS] ElevenLabs ok — ${describeIivoVoice(voiceId)} model=${model} bytes=${buf.length}`,
  );
  return buf;
}

export interface ElevenLabsCharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface ElevenLabsTimedTtsResult {
  audio: Buffer;
  alignment: ElevenLabsCharacterAlignment | null;
}

/** ElevenLabs with character timestamps — Phase 3 Companion sync. */
export async function fetchElevenLabsTtsWithTimestamps(
  text: string,
  locale?: GlassUiLocale,
): Promise<ElevenLabsTimedTtsResult | null> {
  ensureGlassEnv();
  const { apiKey, voiceId, model } = glassElevenLabsConfig(locale);
  if (!apiKey) {
    console.warn("[Glass TTS] ELEVENLABS_API_KEY missing for timed TTS");
    return null;
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: IIVO_ELEVENLABS_VOICE_SETTINGS,
      }),
    },
  );
  if (!res.ok) {
    console.error("[Glass TTS] ElevenLabs timed error", res.status, "voice=", voiceId);
    return null;
  }
  const body = (await res.json()) as {
    audio_base64?: string;
    alignment?: ElevenLabsCharacterAlignment | null;
    normalized_alignment?: ElevenLabsCharacterAlignment | null;
  };
  if (!body.audio_base64) return null;
  const audio = Buffer.from(body.audio_base64, "base64");
  const alignment = body.alignment ?? body.normalized_alignment ?? null;
  console.log(
    `[Glass TTS] ElevenLabs timed ok — ${describeIivoVoice(voiceId)} bytes=${audio.length} chars=${alignment?.characters?.length ?? 0}`,
  );
  return { audio, alignment };
}
