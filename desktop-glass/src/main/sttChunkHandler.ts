/**
 * Process audio chunks: save to disk and transcribe via OpenAI STT.
 */

import { randomUUID } from "node:crypto";
import type { GlassSessionStore } from "../shared/sessionStore.ts";
import {
  buildGlassSttState,
  buildTranscriptEventMetadata,
  classifySttFailure,
  type GlassSttState,
  type SttAudioSource,
  sttSourceErrorMessage,
} from "../shared/sttTypes.ts";
import { saveSessionAudioChunk } from "./audioStorage.ts";
import { getSttConfig, transcribeWithProvider } from "./sttProvider.ts";
import {
  isDuplicateTranscriptChunk,
} from "../shared/transcriptDedupe.ts";
import type { WindowContext } from "../shared/windowContextTypes.ts";
import type { GlassConfig } from "../shared/config.ts";

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
  /** When false, errors from in-flight chunks after Stop Everything are suppressed. */
  shouldReportSttErrors?: () => boolean;
  push: () => void;
}

export async function processSttChunk(
  payload: SttProcessChunkPayload,
  deps: SttChunkHandlerDeps,
): Promise<SttProcessChunkResult> {
  const reportErrors = deps.shouldReportSttErrors?.() ?? true;
  const fail = (error: string): SttProcessChunkResult => {
    if (reportErrors) {
      deps.setSttState({ ...deps.getSttState(), transcribing: false, lastError: error });
      deps.push();
      return { ok: false, error };
    }
    deps.setSttState({ ...deps.getSttState(), transcribing: false, lastError: undefined });
    deps.push();
    return { ok: false };
  };

  const config = getSttConfig();
  const stt = deps.getSttState();
  deps.setSttState({ ...stt, transcribing: true, lastError: undefined });
  deps.push();

  if (!config.enabled || config.status !== "configured") {
    return fail(sttSourceErrorMessage(payload.source, "config_missing"));
  }

  const buffer = Buffer.from(payload.buffer);
  if (buffer.length < 512) {
    return fail(sttSourceErrorMessage(payload.source, "no_signal"));
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
    return fail("Failed to save audio chunk locally.");
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
      const recentEvents = (session.events ?? [])
        .filter((e) => e.kind === "transcript_note")
        .slice(-40);
      const source = payload.source === "system_audio" ? "system_audio" : "microphone";
      if (
        isDuplicateTranscriptChunk(result.text, source, recentEvents)
      ) {
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
      }
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
    const detail = err instanceof Error ? err.message : "Transcription failed.";
    const kind = classifySttFailure(detail);
    const error = sttSourceErrorMessage(payload.source, kind, detail);
    if (reportErrors) {
      deps.setSttState({
        ...deps.getSttState(),
        transcribing: false,
        lastError: error,
      });
      deps.setLastError(error);
      deps.push();
      return { ok: false, error, eventId };
    }
    deps.setSttState({ ...deps.getSttState(), transcribing: false, lastError: undefined });
    deps.push();
    return { ok: false, eventId };
  }
}
