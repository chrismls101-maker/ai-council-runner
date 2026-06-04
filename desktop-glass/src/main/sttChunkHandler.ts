/**
 * Process audio chunks: save to disk and transcribe via OpenAI STT.
 */

import { randomUUID } from "node:crypto";
import type { GlassSessionStore } from "../shared/sessionStore.ts";
import {
  buildGlassSttState,
  buildTranscriptEventMetadata,
  type GlassSttState,
  type SttAudioSource,
} from "../shared/sttTypes.ts";
import { saveSessionAudioChunk } from "./audioStorage.ts";
import { getSttConfig, transcribeWithProvider } from "./sttProvider.ts";
import type { WindowContext } from "../shared/windowContextTypes.ts";
import type { GlassConfig } from "../shared/config.ts";
import { sttStatusMessage } from "../shared/sttTypes.ts";

export interface SttProcessChunkPayload {
  buffer: ArrayBuffer;
  mimeType: string;
  source: SttAudioSource;
  sessionId?: string;
}

export interface SttProcessChunkResult {
  ok: boolean;
  text?: string;
  error?: string;
  eventId?: string;
}

export interface SttChunkHandlerDeps {
  userDataPath: string;
  glassConfig: GlassConfig;
  sessions: GlassSessionStore;
  sessionIsLive: () => boolean;
  eventContextFields: () => {
    sourceApp?: string;
    sourceTitle?: string;
    metadata: { windowContext: WindowContext };
  };
  persistSessions: (store: GlassSessionStore) => Promise<void>;
  appendTranscript: (text: string) => void;
  getSttState: () => GlassSttState;
  setSttState: (next: GlassSttState) => void;
  setLastNotice: (msg: string | undefined) => void;
  setLastError: (msg: string | undefined) => void;
  push: () => void;
}

export async function processSttChunk(
  payload: SttProcessChunkPayload,
  deps: SttChunkHandlerDeps,
): Promise<SttProcessChunkResult> {
  const config = getSttConfig();
  const stt = deps.getSttState();
  deps.setSttState({ ...stt, transcribing: true, lastError: undefined });
  deps.push();

  if (!config.enabled || config.status !== "configured") {
    const error = sttStatusMessage(config.status, config.endpoint);
    deps.setSttState({ ...deps.getSttState(), transcribing: false, lastError: error });
    deps.push();
    return { ok: false, error };
  }

  const buffer = Buffer.from(payload.buffer);
  if (buffer.length < 512) {
    deps.setSttState({ ...deps.getSttState(), transcribing: false });
    deps.push();
    return { ok: false, error: "Audio chunk too small to transcribe." };
  }

  const session = deps.sessions.current();
  const sessionId = payload.sessionId ?? session?.id ?? "unsessioned";
  const eventId = randomUUID();

  let audioPath: string;
  let audioMimeType: string;
  try {
    const saved = await saveSessionAudioChunk(
      deps.userDataPath,
      sessionId,
      eventId,
      buffer,
      payload.mimeType,
    );
    audioPath = saved.audioPath;
    audioMimeType = saved.audioMimeType;
  } catch {
    const error = "Failed to save audio chunk locally.";
    deps.setSttState({ ...deps.getSttState(), transcribing: false, lastError: error });
    deps.push();
    return { ok: false, error };
  }

  try {
    const result = await transcribeWithProvider(
      config,
      deps.glassConfig,
      {
        audioPath,
        mimeType: audioMimeType,
        source: payload.source,
        sessionId,
        eventId,
      },
    );

    deps.appendTranscript(result.text);
    const tag = payload.source === "system_audio" ? "system_audio" : "microphone";
    const ctxFields = deps.eventContextFields();

    if (deps.sessionIsLive() && session?.status === "active") {
      deps.sessions.addEvent({
        kind: "transcript_note",
        title: result.text.length > 70 ? `${result.text.slice(0, 69)}…` : result.text,
        text: result.text,
        tags: [tag],
        sourceApp: ctxFields.sourceApp,
        sourceTitle: ctxFields.sourceTitle,
        metadata: {
          ...ctxFields.metadata,
          ...buildTranscriptEventMetadata({
            audioPath,
            audioMimeType,
            model: result.model,
            source: payload.source,
            durationMs: result.durationMs,
            status: "success",
            endpoint: result.endpoint,
          }),
        },
      });
      await deps.persistSessions(deps.sessions);
    } else if (!deps.sessionIsLive()) {
      deps.setLastNotice("Transcript saved. Start a session to keep chunks in the timeline.");
    }

    deps.setSttState(
      buildGlassSttState(config, {
        ...deps.getSttState(),
        transcribing: false,
        lastTranscript: result.text,
        lastError: undefined,
      }),
    );
    deps.push();
    return { ok: true, text: result.text, eventId };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Transcription failed.";
    deps.setSttState({
      ...deps.getSttState(),
      transcribing: false,
      lastError: error,
    });
    deps.setLastError(error);
    deps.push();
    return { ok: false, error, eventId };
  }
}
