import { useCallback, useEffect, useMemo, useRef } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import {
  applyIivoTtsPlayback,
  decodeMp3Base64,
  playIivoTtsFromBase64,
} from "../../shared/iivoVoiceSpec.ts";

type PendingTts = {
  resolve: () => void;
  reject: (err: Error) => void;
};

/**
 * Request ElevenLabs audio via `glass-tts` and play it in the overlay window.
 * Resolves when playback finishes (or rejects on missing/failed audio).
 */
export function useIivoTtsRequest(): {
  speak: (text: string) => Promise<void>;
  stop: () => void;
} {
  const state = useGlassState();
  const pendingRef = useRef<PendingTts | null>(null);
  const lastPlayedIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stopWebAudioRef = useRef<(() => void) | null>(null);

  const cleanupHtml = useCallback((): void => {
    stopWebAudioRef.current?.();
    stopWebAudioRef.current = null;
    if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
      htmlAudioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const finishPending = useCallback((): void => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.resolve();
  }, []);

  const failPending = useCallback((message: string): void => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.reject(new Error(message));
  }, []);

  const stop = useCallback((): void => {
    cleanupHtml();
    if (pendingRef.current) {
      failPending("TTS stopped");
    }
  }, [cleanupHtml, failPending]);

  const speak = useCallback(
    (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return Promise.resolve();
      stop();
      return new Promise<void>((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        send({ type: "glass-tts", text: trimmed });
      });
    },
    [stop],
  );

  useEffect(() => {
    const ttsAudio = state.ttsAudio;
    if (!ttsAudio || !pendingRef.current) return;
    if (lastPlayedIdRef.current === ttsAudio.id) return;
    lastPlayedIdRef.current = ttsAudio.id;

    if (!ttsAudio.data) {
      failPending("No ElevenLabs audio returned");
      return;
    }

    let cancelled = false;
    cleanupHtml();

    const runHtmlFallback = (): void => {
      const objectUrl = URL.createObjectURL(decodeMp3Base64(ttsAudio.data));
      objectUrlRef.current = objectUrl;
      const audio = new Audio();
      audio.src = objectUrl;
      htmlAudioRef.current = audio;
      audio.onended = () => {
        if (cancelled) return;
        finishPending();
      };
      audio.onerror = () => {
        if (cancelled) return;
        failPending("TTS playback failed");
      };
      applyIivoTtsPlayback(audio);
      void audio.play().catch(() => {
        if (cancelled) return;
        failPending("TTS playback blocked");
      });
    };

    void (async () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        const stopRef = { current: null as (() => void) | null };
        stopWebAudioRef.current = () => stopRef.current?.();
        await playIivoTtsFromBase64(ttsAudio.data, ctx, undefined, undefined, stopRef);
        if (cancelled) return;
        finishPending();
      } catch {
        if (cancelled) return;
        runHtmlFallback();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.ttsAudio, cleanupHtml, finishPending, failPending]);

  useEffect(() => () => stop(), [stop]);

  return useMemo(() => ({ speak, stop }), [speak, stop]);
}
