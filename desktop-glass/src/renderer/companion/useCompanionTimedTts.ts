import { useCallback, useEffect, useRef } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { applyIivoTtsPlayback, decodeMp3Base64 } from "../../shared/iivoVoiceSpec.ts";
import type { TimedTtsPayload } from "../../shared/ttsAlignment.ts";
import { activeSegmentIndexAtTime } from "../../shared/ttsAlignment.ts";

type PendingTts = {
  resolve: () => void;
  reject: (err: Error) => void;
  onSegmentChange?: (segmentIndex: number, currentSeconds: number) => void;
};

export function useCompanionTimedTts(): {
  speakTimed: (
    text: string,
    onSegmentChange?: (segmentIndex: number, currentSeconds: number) => void,
  ) => Promise<void>;
  stop: () => void;
} {
  const state = useGlassState();
  const pendingRef = useRef<PendingTts | null>(null);
  const lastPlayedIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback((): void => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
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

  const failPending = useCallback(
    (message: string): void => {
      cleanup();
      const pending = pendingRef.current;
      pendingRef.current = null;
      pending?.reject(new Error(message));
    },
    [cleanup],
  );

  const stop = useCallback((): void => {
    cleanup();
    if (pendingRef.current) {
      failPending("TTS stopped");
    }
  }, [cleanup, failPending]);

  const startSegmentLoop = useCallback(
    (audio: HTMLAudioElement, payload: TimedTtsPayload, onSegmentChange?: PendingTts["onSegmentChange"]) => {
      if (!payload.segmentTimings?.length || !onSegmentChange) return;
      let lastSegment = -1;
      const tick = (): void => {
        if (!audioRef.current) return;
        const t = audioRef.current.currentTime;
        const segmentIndex = activeSegmentIndexAtTime(payload.segmentTimings!, t);
        if (segmentIndex !== lastSegment) {
          lastSegment = segmentIndex;
          onSegmentChange(segmentIndex, t);
        }
        if (!audioRef.current.paused && !audioRef.current.ended) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  const speakTimed = useCallback(
    (
      text: string,
      onSegmentChange?: (segmentIndex: number, currentSeconds: number) => void,
    ): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return Promise.resolve();
      stop();
      return new Promise<void>((resolve, reject) => {
        pendingRef.current = { resolve, reject, onSegmentChange };
        send({ type: "glass-tts-timed", text: trimmed });
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

    cleanup();
    const pending = pendingRef.current;
    const objectUrl = URL.createObjectURL(decodeMp3Base64(ttsAudio.data));
    objectUrlRef.current = objectUrl;
    const audio = new Audio();
    audio.src = objectUrl;
    audioRef.current = audio;
    applyIivoTtsPlayback(audio);

    audio.onended = () => {
      cleanup();
      finishPending();
    };
    audio.onerror = () => failPending("TTS playback failed");

    void audio.play().then(() => {
      if (ttsAudio.segmentTimings?.length && pending?.onSegmentChange) {
        const first = ttsAudio.segmentTimings[0]!.segmentIndex;
        pending.onSegmentChange(first, 0);
        startSegmentLoop(audio, ttsAudio, pending.onSegmentChange);
      }
    }).catch(() => failPending("TTS playback blocked"));
  }, [state.ttsAudio, cleanup, failPending, finishPending, startSegmentLoop]);

  useEffect(() => () => stop(), [stop]);

  return { speakTimed, stop };
}
