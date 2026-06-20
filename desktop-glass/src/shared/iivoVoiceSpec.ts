/**
 * IIVO Glass — canonical ElevenLabs voice (Matilda).
 * Server ttsRoute mirrors these values for /api/tts fallback.
 */

export const IIVO_ELEVENLABS_VOICE_ID = "XrExE9yKIg1WjnnlVkGX"; // Matilda
export const IIVO_ELEVENLABS_MODEL = "eleven_turbo_v2_5";
/** Multilingual model + voice for non-English onboarding TTS. */
export const IIVO_ELEVENLABS_MULTILINGUAL_MODEL = "eleven_multilingual_v2";
/** Sarah — clear multilingual voice for Spanish onboarding. */
export const IIVO_ELEVENLABS_VOICE_ID_ES = "EXAVITQu4vr4xnSDxMaL";

export const IIVO_ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.85,
  style: 0.5,
  use_speaker_boost: true,
} as const;

/** Client playback — slightly lower pitch for a serious, deliberate read. */
export const IIVO_TTS_PLAYBACK_RATE = 0.9;

export function describeIivoVoice(voiceId: string): string {
  return voiceId === IIVO_ELEVENLABS_VOICE_ID
    ? "Matilda (ElevenLabs)"
    : `custom (${voiceId})`;
}

export function decodeMp3Base64(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "audio/mpeg" });
}

/** HTMLMediaElement path — used when Web Audio decode is unavailable. */
export function applyIivoTtsPlayback(audio: HTMLMediaElement): void {
  audio.preservesPitch = false;
  audio.defaultPlaybackRate = IIVO_TTS_PLAYBACK_RATE;
  audio.playbackRate = IIVO_TTS_PLAYBACK_RATE;
}

/**
 * Play ElevenLabs MP3 with pitch drop via Web Audio (reliable in Electron).
 * BufferSource.playbackRate changes pitch + speed together — matches speak.ts intent.
 *
 * @param outputNode  Optional destination node (e.g. VoiceController's processed FX
 *                    input for chorus + reverb). Falls back to ctx.destination.
 */
export async function playIivoTtsFromBase64(
  base64: string,
  ctx: AudioContext,
  onStart?: () => void,
  outputNode?: AudioNode,
  stopRef?: { current: (() => void) | null },
): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  const arrayBuffer = await decodeMp3Base64(base64).arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = IIVO_TTS_PLAYBACK_RATE;
  source.connect(outputNode ?? ctx.destination);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (stopRef) stopRef.current = null;
      resolve();
    };
    if (stopRef) {
      stopRef.current = () => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        finish();
      };
    }
    source.onended = finish;
    try {
      onStart?.();
      source.start(0);
    } catch (err) {
      if (stopRef) stopRef.current = null;
      reject(err);
    }
  });
}
