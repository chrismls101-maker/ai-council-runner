import { useCallback, useEffect, useRef } from "react";
import { playIivoTtsFromBase64, decodeMp3Base64, applyIivoTtsPlayback } from "../../shared/iivoVoiceSpec.ts";
import type { VoiceController } from "../onboarding/swarm/VoiceController.ts";

const TTS_WAIT_MS = 20_000;

export function useActivationTts(voice: VoiceController): {
  speak: (text: string, onStart?: () => void) => Promise<void>;
  stop: () => void;
} {
  const activeRef = useRef<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stop = useCallback((): void => {
    stopRef.current?.();
    stopRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    activeRef.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const speak = useCallback(
    async (text: string, onStart?: () => void): Promise<void> => {
      stop();
      const line = text.trim();
      if (!line) return;

      activeRef.current = line;
      const res = await window.glass.activationSpeak(line);

      if (activeRef.current !== line) return;

      if (!res.ok || !res.data) {
        console.warn("[Activation] TTS skipped — no audio");
        onStart?.();
        return;
      }

      const handleDone = (): void => {
        if (activeRef.current === line) activeRef.current = null;
      };

      try {
        const { ctx, input: fxInput } = voice.getFxContext();
        await playIivoTtsFromBase64(res.data, ctx, () => {
          onStart?.();
        }, fxInput, stopRef);
        handleDone();
      } catch (err) {
        console.warn("[Activation] WebAudio TTS failed, trying HTML fallback", err);
        const objectUrl = URL.createObjectURL(decodeMp3Base64(res.data));
        objectUrlRef.current = objectUrl;
        const audio = new Audio();
        audio.src = objectUrl;
        audioRef.current = audio;
        await new Promise<void>((resolve) => {
          const guard = window.setTimeout(resolve, TTS_WAIT_MS);
          audio.onended = () => {
            window.clearTimeout(guard);
            resolve();
          };
          audio.addEventListener(
            "canplaythrough",
            () => {
              applyIivoTtsPlayback(audio);
              onStart?.();
              void audio.play().catch(() => resolve());
            },
            { once: true },
          );
          audio.addEventListener("error", () => resolve(), { once: true });
          audio.load();
        });
        handleDone();
      }
    },
    [stop, voice],
  );

  return { speak, stop };
}
