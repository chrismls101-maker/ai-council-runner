/**
 * Listen Mode audio engine — Deepgram Nova-3 streaming (primary) with Whisper fallback.
 */

import { DeepgramStreamingSession } from "./deepgramStreamingSTT.ts";
import {
  labelToSpeakerIdMap,
  resolveSpeakerLabels,
  updateSpeakerWordCounts,
} from "../shared/listenSpeakerLabels.ts";
import { resolveListenFragmentStartMs } from "../shared/listenStreamingTranscript.ts";

export type ListenAudioEngine = "deepgram" | "whisper";

export interface ListenDeepgramFragment {
  text: string;
  speakerId?: number;
  speakerLabel?: string;
  /** Ms offset from listen session start. */
  startMs?: number;
  speechFinal?: boolean;
}

export interface ListenModeAudioEngineDeps {
  onFragment: (fragment: ListenDeepgramFragment) => void;
  onEngineChange: (engine: ListenAudioEngine, reason: string) => void;
  onFallbackRequested: (reason: string) => void;
  shouldRun: () => boolean;
  getSessionStartMs: () => number | undefined;
}

export interface ListenDeepgramEngine {
  sendAudio: (buffer: Buffer) => void;
  stop: () => void;
  getEngine: () => ListenAudioEngine;
  getSession: () => DeepgramStreamingSession | null;
  getSpeakerLabelToId: () => Record<string, string>;
  activateWhisperFallback: (reason: string) => void;
}

const LISTEN_DEEPGRAM_RECONNECT_BASE_MS = 1_000;
const LISTEN_DEEPGRAM_RECONNECT_MAX_MS = 30_000;
const LISTEN_DEEPGRAM_MAX_CONNECT_ATTEMPTS = 2;
const LISTEN_DEEPGRAM_MAX_RECONNECT_ATTEMPTS = 5;
const LISTEN_DEEPGRAM_SAFETY_FLUSH_WORDS = 40;

function debugListen(msg: string): void {
  if (process.env.IIVO_GLASS_DEBUG === "1" || process.env.IIVO_GLASS_DEBUG === "true") {
    console.log(`[listen:audio-engine] ${msg}`);
  }
}

/** Switch Listen Mode from Deepgram to Whisper fallback. */
export function activateWhisperListenFallback(
  engine: ListenDeepgramEngine | null,
  reason: string,
  onFallbackRequested: (reason: string) => void,
): void {
  engine?.activateWhisperFallback(reason);
  onFallbackRequested(reason);
}

export function createDeepgramListenEngine(
  apiKey: string,
  deps: ListenModeAudioEngineDeps,
): ListenDeepgramEngine {
  let session: DeepgramStreamingSession | null = null;
  let engine: ListenAudioEngine = "deepgram";
  let reconnectAttempts = 0;
  let streamAnchorSessionMs: number | undefined;
  const speakerWordCounts = new Map<number, number>();
  let speakerLabels = new Map<number, string>();

  const getSpeakerLabelToId = () => labelToSpeakerIdMap(speakerLabels);

  const resetStreamAnchor = () => {
    streamAnchorSessionMs = undefined;
  };

  const emitFragment = (payload: {
    text: string;
    isFinal: boolean;
    speechFinal?: boolean;
    speakerId?: number;
    startMs?: number;
  }) => {
    if (!payload.isFinal) return;
    const text = payload.text.trim();
    if (!text) return;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    // speech_final / utterance_end, or safety flush for long run-on sentences
    if (payload.speechFinal !== true && wordCount < LISTEN_DEEPGRAM_SAFETY_FLUSH_WORDS) return;

    updateSpeakerWordCounts(speakerWordCounts, payload.speakerId, text);
    speakerLabels = resolveSpeakerLabels(speakerWordCounts);
    const speakerLabel =
      payload.speakerId != null ? speakerLabels.get(payload.speakerId) : undefined;

    const startMs = resolveListenFragmentStartMs({
      sessionStartMs: deps.getSessionStartMs(),
      streamAnchorSessionMs,
      deepgramStartMs: payload.startMs,
    });

    deps.onFragment({
      text,
      speakerId: payload.speakerId,
      speakerLabel,
      startMs,
      speechFinal: true,
    });
  };

  const makeCallbacks = () => ({
    onTranscript: (t: {
      text: string;
      isFinal: boolean;
      speechFinal?: boolean;
      speakerId?: number;
      startMs?: number;
    }) => emitFragment(t),
    onError: (err: Error) => {
      console.error("[deepgram:listen] error:", err.message);
      // Transient errors — onClose handles reconnect / fallback.
    },
    onClose: () => {
      if (!deps.shouldRun() || engine !== "deepgram") return;
      reconnectAttempts += 1;
      if (reconnectAttempts > LISTEN_DEEPGRAM_MAX_RECONNECT_ATTEMPTS) {
        deps.onFallbackRequested("max reconnect attempts exceeded");
        return;
      }
      const delayMs = Math.min(
        LISTEN_DEEPGRAM_RECONNECT_BASE_MS * 2 ** (reconnectAttempts - 1),
        LISTEN_DEEPGRAM_RECONNECT_MAX_MS,
      );
      console.warn(
        `[deepgram:listen] WS closed unexpectedly — reconnecting in ${Math.round(delayMs / 1000)}s…`,
      );
      setTimeout(() => {
        if (!deps.shouldRun() || engine !== "deepgram") return;
        startSession();
      }, delayMs);
    },
  });

  const attemptConnect = (attemptsLeft: number) => {
    session?.connect().then(() => {
      reconnectAttempts = 0;
      debugListen("engine: deepgram (connected)");
    }).catch((err: unknown) => {
      const msg = (err as Error).message ?? String(err);
      console.error(`[deepgram:listen] connect failed (${attemptsLeft} retries left):`, msg);
      if (attemptsLeft > 0 && deps.shouldRun()) {
        console.log("[deepgram:listen] retrying in 1.5s…");
        setTimeout(() => {
          if (!deps.shouldRun()) return;
          session = new DeepgramStreamingSession(apiKey, "auto", makeCallbacks());
          attemptConnect(attemptsLeft - 1);
        }, 1_500);
      } else {
        session = null;
        deps.onFallbackRequested(`connect_failed:${msg}`);
      }
    });
  };

  const startSession = () => {
    session?.close();
    resetStreamAnchor();
    session = new DeepgramStreamingSession(apiKey, "auto", makeCallbacks());
    attemptConnect(LISTEN_DEEPGRAM_MAX_CONNECT_ATTEMPTS);
    console.log("[deepgram:listen] session started (diarization enabled)");
    debugListen("engine: deepgram (starting)");
  };

  startSession();
  deps.onEngineChange("deepgram", "session_started");

  return {
    sendAudio(buffer: Buffer) {
      if (streamAnchorSessionMs == null) {
        const sessionStart = deps.getSessionStartMs();
        if (sessionStart != null) streamAnchorSessionMs = Date.now() - sessionStart;
      }
      session?.sendAudio(buffer);
    },
    stop() {
      if (session) {
        session.close();
        session = null;
        reconnectAttempts = 0;
        console.log("[deepgram:listen] session closed");
      }
      resetStreamAnchor();
      speakerWordCounts.clear();
      speakerLabels = new Map();
    },
    getEngine: () => engine,
    getSession: () => session,
    getSpeakerLabelToId,
    activateWhisperFallback(reason: string) {
      if (engine === "whisper") return;
      engine = "whisper";
      session?.close();
      session = null;
      reconnectAttempts = 0;
      resetStreamAnchor();
      speakerWordCounts.clear();
      speakerLabels = new Map();
      deps.onEngineChange("whisper", reason);
      debugListen(`engine: whisper (${reason})`);
    },
  };
}
