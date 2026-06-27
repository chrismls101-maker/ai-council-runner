import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import {
  initialVoiceModeState,
  voiceModeReducer,
  type VoiceModeState,
} from "../../shared/voiceModeState.ts";
import {
  stopEverythingCommand,
} from "../../shared/voiceModeActions.ts";
import { companionOrVoiceSubmitPlan, companionBargeInSubmitPlan } from "../../shared/companionActions.ts";
import { isLikelyEcho } from "../../shared/companionEchoDetect.ts";
import {
  detectPrivacyIntent,
  detectResumeIntent,
  looksLikeDirectQuestion,
} from "../../shared/companionPrivacyDetect.ts";
import { detectAmbientConversation } from "../../shared/companionAmbientDetect.ts";
import {
  canDrainCompanionNarrationQueue,
  isCompanionNarrationPrivacyBlocked,
  shouldEnqueueAgentNarrate,
} from "../../shared/companionNarrationGate.ts";
import {
  clearVoiceModeAutoSubmit,
  setVoiceModeAutoSubmit,
} from "../../shared/voiceModeBridge.ts";
import {
  COMPANION_LOOKING_SPEECH,
  COMPANION_MACHINE_AUDIO_DISCLOSURE,
  COMPANION_PRESENCE_SPEECH,
  COMPANION_THINKING_SPEECH,
  COMPANION_WARMING_SPEECH,
  COMPANION_LISTEN_RESTART_BASE_MS,
  COMPANION_LISTEN_RESTART_MAX_BACKOFF_MS,
  companionSpeechTextFromResponse,
  companionStatusLabel,
} from "../../shared/glassCompanion.ts";
import {
  companionSpeechFromGuidance,
  manifestationsForSegment,
  type GuidanceManifestation,
} from "../../shared/companionGuidance.ts";
import { hasGuidanceScript } from "../../shared/companionScriptEngine.ts";
import { useIivoTtsRequest } from "./useIivoTtsRequest.ts";
import { useCompanionTimedTts } from "./useCompanionTimedTts.ts";
import { useCompanionScriptPlayer } from "./useCompanionScriptPlayer.ts";

export interface GlassCompanionController {
  active: boolean;
  state: VoiceModeState;
  statusLabel: string;
  liveTranscript: string;
  speaking: boolean;
  activeManifestations: GuidanceManifestation[] | null;
  toggle: () => void;
  stop: () => void;
}

const GlassCompanionContext = createContext<GlassCompanionController | null>(null);

export function useGlassCompanion(): GlassCompanionController {
  const ctx = useContext(GlassCompanionContext);
  if (!ctx) {
    throw new Error("useGlassCompanion must be used within GlassCompanionProvider");
  }
  return ctx;
}

function useGlassCompanionSession(): GlassCompanionController {
  const glass = useGlassState();
  const tx = useTranscriptionContext();
  const tts = useIivoTtsRequest();
  const timedTts = useCompanionTimedTts();
  const [state, dispatch] = useReducer(voiceModeReducer, initialVoiceModeState);
  const [speaking, setSpeaking] = useState(false);
  const [flatManifestations, setFlatManifestations] = useState<GuidanceManifestation[] | null>(
    null,
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const prevAskStatusRef = useRef(glass.askStatus);
  const prevCompanionActiveRef = useRef(glass.companionModeActive === true);
  const lastSpokenResponseAtRef = useRef<string | null>(null);
  const lookingSpeechSentRef = useRef(false);
  const wasVisualAskRef = useRef(false);
  const thinkingSpeechSentRef = useRef(false);
  const lastWarmupSpeakNonceRef = useRef(0);
  const machineAudioDisclosureSpokenRef = useRef(false);
  const pendingMachineAudioDisclosureRef = useRef(false);
  const prevSystemAudioActiveRef = useRef(false);
  const listenRestartFailCountRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const companionMemoryRef = useRef(glass.companionMemory);
  companionMemoryRef.current = glass.companionMemory;
  const companionPrivacyRef = useRef(glass.companionPrivacy);
  companionPrivacyRef.current = glass.companionPrivacy;
  const privacyPendingRef = useRef(false);
  const narrateQueueRef = useRef<string[]>([]);
  const narrateBusyRef = useRef(false);
  const activeAppRef = useRef(glass.activeApp);
  activeAppRef.current = glass.activeApp;
  const lastTtsTextRef = useRef("");
  const lastResponseAtRef = useRef(0);
  const lastResponseMarkerRef = useRef<string | null>(null);
  const lastSpeakerIdRef = useRef<number | undefined>(undefined);
  const speakerChangeCountRef = useRef(0);
  const bargeInTimerRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  speakingRef.current = speaking;

  const resetAmbientRefs = useCallback(() => {
    lastSpeakerIdRef.current = undefined;
    speakerChangeCountRef.current = 0;
    lastResponseAtRef.current = 0;
    lastResponseMarkerRef.current = null;
  }, []);

  const speakTracked = useCallback(
    (line: string) => {
      lastTtsTextRef.current = line;
      return tts.speak(line);
    },
    [tts],
  );

  const companionActive = glass.companionModeActive === true;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const scheduleRestartListening = useCallback(
    (outcome: "success" | "error" = "success") => {
      if (!stateRef.current.active || stoppingRef.current) return;
      if (outcome === "success") {
        listenRestartFailCountRef.current = 0;
      } else {
        listenRestartFailCountRef.current = Math.min(listenRestartFailCountRef.current + 1, 6);
      }
      const fails = listenRestartFailCountRef.current;
      const delay =
        fails === 0
          ? 0
          : Math.min(
              COMPANION_LISTEN_RESTART_MAX_BACKOFF_MS,
              COMPANION_LISTEN_RESTART_BASE_MS * 2 ** (fails - 1),
            );
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        void tx.startCompanionListening();
      }, delay);
    },
    [clearRestartTimer, tx],
  );

  const restartListening = useCallback(() => {
    scheduleRestartListening("success");
  }, [scheduleRestartListening]);

  const finishGuidanceBeat = useCallback(() => {
    setSpeaking(false);
    setFlatManifestations(null);
    send({ type: "clear-companion-presence" });
    restartListening();
  }, [restartListening]);

  const scriptPlayer = useCompanionScriptPlayer({
    speakStep: useCallback(
      (text, onSegmentChange) => {
        lastTtsTextRef.current = text;
        setSpeaking(true);
        speakingRef.current = true;
        return timedTts.speakTimed(text, (segmentIndex) => {
          onSegmentChange?.(segmentIndex);
        });
      },
      [timedTts],
    ),
    onScriptComplete: finishGuidanceBeat,
  });

  const stopAllTts = useCallback(() => {
    tts.stop();
    timedTts.stop();
    scriptPlayer.stopScript();
    narrateBusyRef.current = false;
    setSpeaking(false);
    speakingRef.current = false;
    setFlatManifestations(null);
  }, [tts, timedTts, scriptPlayer]);

  const triggerPrivacyMode = useCallback(
    (durationMs?: number) => {
      const ms = durationMs ?? 10 * 60 * 1000;
      const minutes = Math.max(1, Math.round(ms / 60_000));
      const ack = `Of course — going quiet. I'll check back in ${minutes} minutes.`;
      privacyPendingRef.current = true;
      narrateQueueRef.current = [];
      stopAllTts();
      lastTtsTextRef.current = ack;
      resetAmbientRefs();
      setSpeaking(true);
      speakingRef.current = true;
      void tts.speak(ack).finally(() => {
        setSpeaking(false);
        speakingRef.current = false;
      });
      window.setTimeout(() => send({ type: "companion-privacy-start", durationMs: ms }), 600);
    },
    [resetAmbientRefs, stopAllTts, tts],
  );

  const submitCompanionPlan = useCallback(
    (draft: string, bargeIn: boolean) => {
      const plan = bargeIn
        ? companionBargeInSubmitPlan(draft)
        : companionOrVoiceSubmitPlan(draft, {
            companionActive: true,
            memory: companionMemoryRef.current ?? null,
            memoryContext: {
              frontApp: activeAppRef.current,
              windowTitle: undefined,
            },
            voiceCoderEnabled: glass.glassSettings.voiceCoderEnabled !== false,
          });
      dispatch({ type: "SUBMIT", text: draft });
      for (const command of plan.commands) send(command);
      if (plan.route === "debrief") {
        dispatch({ type: "ANSWER_DONE" });
        scheduleRestartListening("success");
      }
    },
    [glass.glassSettings.voiceCoderEnabled, scheduleRestartListening],
  );

  const handleCompanionTranscript = useCallback(
    (draft: string, meta?: { speakerId?: number }) => {
      const text = draft.trim();
      if (!text) return;

      if (isLikelyEcho(text, lastTtsTextRef.current)) return;

      if (companionPrivacyRef.current?.active) {
        const extendPrivacy = detectPrivacyIntent(text);
        if (extendPrivacy.isPrivacy) {
          send({ type: "companion-privacy-end" });
          triggerPrivacyMode(extendPrivacy.durationMs);
          return;
        }
        if (detectResumeIntent(text) || looksLikeDirectQuestion(text)) {
          send({ type: "companion-privacy-end" });
          if (detectResumeIntent(text)) return;
        } else {
          return;
        }
      }

      const privacyIntent = detectPrivacyIntent(text);
      if (privacyIntent.isPrivacy) {
        triggerPrivacyMode(privacyIntent.durationMs);
        return;
      }

      let bargeIn = false;
      if (speakingRef.current) {
        stopAllTts();
        bargeIn = true;
      }

      const runPipeline = () => {
        const speakerId = meta?.speakerId;
        const prevSpeakerId = lastSpeakerIdRef.current;
        if (speakerId !== undefined && speakerId !== prevSpeakerId) {
          speakerChangeCountRef.current += 1;
        }
        if (speakerId !== undefined) {
          lastSpeakerIdRef.current = speakerId;
        }

        if (!bargeIn) {
          const ambient = detectAmbientConversation(
            text,
            speakerId,
            prevSpeakerId,
            speakerChangeCountRef.current,
          );
          const recentConversation = Date.now() - lastResponseAtRef.current < 30_000;
          if (!ambient.addressedToCompanion && !recentConversation) {
            return;
          }
        }

        submitCompanionPlan(text, bargeIn);
      };

      if (bargeIn) {
        if (bargeInTimerRef.current != null) {
          window.clearTimeout(bargeInTimerRef.current);
        }
        bargeInTimerRef.current = window.setTimeout(() => {
          bargeInTimerRef.current = null;
          runPipeline();
        }, 80);
      } else {
        runPipeline();
      }
    },
    [submitCompanionPlan, triggerPrivacyMode, stopAllTts],
  );

  const stopLocal = useCallback(() => {
    stoppingRef.current = true;
    clearRestartTimer();
    listenRestartFailCountRef.current = 0;
    dispatch({ type: "STOP_EVERYTHING" });
    clearVoiceModeAutoSubmit();
    scriptPlayer.stopScript();
    tts.stop();
    timedTts.stop();
    setSpeaking(false);
    setFlatManifestations(null);
    tx.stopListeningLocal();
    lookingSpeechSentRef.current = false;
    wasVisualAskRef.current = false;
    thinkingSpeechSentRef.current = false;
    lastWarmupSpeakNonceRef.current = 0;
    machineAudioDisclosureSpokenRef.current = false;
    pendingMachineAudioDisclosureRef.current = false;
    prevSystemAudioActiveRef.current = false;
    stoppingRef.current = false;
  }, [tts, timedTts, tx, scriptPlayer, clearRestartTimer]);

  const start = useCallback(() => {
    dispatch({ type: "START" });
    setVoiceModeAutoSubmit((draft) => {
      handleCompanionTranscript(draft);
      return true;
    });
    void tx.startCompanionListening();
  }, [tx, handleCompanionTranscript]);

  const stop = useCallback(() => {
    send(stopEverythingCommand());
    stopLocal();
  }, [stopLocal]);

  const toggle = useCallback(() => {
    send({ type: "toggle-companion-mode" });
  }, []);

  useEffect(() => {
    const wasActive = prevCompanionActiveRef.current;
    const nowActive = companionActive;
    prevCompanionActiveRef.current = nowActive;

    if (nowActive && !wasActive && !stateRef.current.active) {
      start();
      return;
    }
    if (!nowActive && wasActive && stateRef.current.active) {
      stopLocal();
    }
  }, [companionActive, start, stopLocal]);

  useEffect(() => {
    if (!state.active) return;
    const denied =
      glass.micPermission === "denied" ||
      !!tx.lastError?.toLowerCase().includes("permission denied");
    if (denied && state.status !== "error") {
      dispatch({ type: "MIC_DENIED", message: tx.lastError ?? "Microphone permission denied." });
    }
  }, [glass.micPermission, tx.lastError, state.active, state.status]);

  useEffect(() => {
    if (!state.active) return;
    if (tx.transcribing && state.status === "listening") {
      dispatch({ type: "TRANSCRIBING" });
    }
  }, [tx.transcribing, state.active, state.status]);

  useEffect(() => {
    if (!companionActive || !state.active) return;
    const nonce = glass.companionWarmupSpeakNonce ?? 0;
    if (nonce === 0 || nonce === lastWarmupSpeakNonceRef.current) return;

    const phase = glass.companionWarmupPhase ?? "none";
    const line =
      phase === "warming"
        ? COMPANION_WARMING_SPEECH
        : phase === "ready"
          ? COMPANION_PRESENCE_SPEECH
          : null;
    if (!line) return;

    // Ready intro waits until mic is live — not only OmniParser warm complete.
    if (phase === "ready" && state.status !== "listening") return;

    lastWarmupSpeakNonceRef.current = nonce;

    setSpeaking(true);
    lastTtsTextRef.current = line;
    void speakTracked(line).finally(() => setSpeaking(false));
  }, [
    companionActive,
    state.active,
    glass.companionWarmupPhase,
    glass.companionWarmupSpeakNonce,
    state.status,
    tts,
    speakTracked,
  ]);

  useEffect(() => {
    if (!state.active) return;
    if (glass.screenContextStatus?.kind === "looking") {
      dispatch({ type: "LOOKING" });
      wasVisualAskRef.current = true;
      if (!lookingSpeechSentRef.current) {
        lookingSpeechSentRef.current = true;
        setSpeaking(true);
        lastTtsTextRef.current = COMPANION_LOOKING_SPEECH;
        void speakTracked(COMPANION_LOOKING_SPEECH).finally(() => setSpeaking(false));
      }
    } else if (state.status !== "looking") {
      lookingSpeechSentRef.current = false;
    }
  }, [glass.screenContextStatus?.kind, state.active, state.status, speakTracked]);

  // Once per session: disclose parallel machine-audio listening (+ audio on strip).
  useEffect(() => {
    if (!companionActive || !state.active) return;
    const now = tx.companionSystemAudioActive;
    const was = prevSystemAudioActiveRef.current;
    prevSystemAudioActiveRef.current = now;
    if (!now || was || machineAudioDisclosureSpokenRef.current) return;

    if (speaking) {
      pendingMachineAudioDisclosureRef.current = true;
      return;
    }

    machineAudioDisclosureSpokenRef.current = true;
    setSpeaking(true);
    lastTtsTextRef.current = COMPANION_MACHINE_AUDIO_DISCLOSURE;
    void speakTracked(COMPANION_MACHINE_AUDIO_DISCLOSURE).finally(() => setSpeaking(false));
  }, [companionActive, state.active, tx.companionSystemAudioActive, speaking, speakTracked]);

  useEffect(() => {
    if (speaking || !pendingMachineAudioDisclosureRef.current) return;
    if (machineAudioDisclosureSpokenRef.current) return;
    pendingMachineAudioDisclosureRef.current = false;
    machineAudioDisclosureSpokenRef.current = true;
    setSpeaking(true);
    lastTtsTextRef.current = COMPANION_MACHINE_AUDIO_DISCLOSURE;
    void speakTracked(COMPANION_MACHINE_AUDIO_DISCLOSURE).finally(() => setSpeaking(false));
  }, [speaking, speakTracked]);

  // Restart listening when script is waiting for ack (mic stays hot).
  useEffect(() => {
    if (!state.active || !scriptPlayer.scriptState) return;
    if (scriptPlayer.scriptState.phase === "waiting_ack") {
      dispatch({ type: "ANSWER_DONE" });
      restartListening();
    }
  }, [scriptPlayer.scriptState, state.active, restartListening]);

  useEffect(() => {
    const now = glass.askStatus;
    const prev = prevAskStatusRef.current;
    const wasInFlight = prev === "pending" || prev === "streaming";
    prevAskStatusRef.current = now;
    if (!state.active) return;

    if (now === "pending" || now === "streaming") {
      dispatch({ type: "THINKING" });
      if (
        wasVisualAskRef.current &&
        !thinkingSpeechSentRef.current &&
        glass.screenContextStatus?.kind !== "looking"
      ) {
        thinkingSpeechSentRef.current = true;
        setSpeaking(true);
        lastTtsTextRef.current = COMPANION_THINKING_SPEECH;
        void speakTracked(COMPANION_THINKING_SPEECH).finally(() => setSpeaking(false));
      }
      if (!scriptPlayer.isPlaying) {
        setFlatManifestations(null);
      }
      return;
    }

    if (!wasInFlight) return;

    if (now === "error") {
      dispatch({ type: "ERROR", message: glass.lastError ?? "Something went wrong." });
      scriptPlayer.stopScript();
      setFlatManifestations(null);
      scheduleRestartListening("error");
      return;
    }

    dispatch({ type: "ANSWER_DONE" });
    wasVisualAskRef.current = false;
    thinkingSpeechSentRef.current = false;

    const response = glass.lastAskResponse;
    const responseAt = response?.at ?? null;
    const presence = glass.companionPresence;
    const guidancePlan = presence?.guidancePlan;
    const guidanceSpeech = companionSpeechFromGuidance(guidancePlan);
    const speech = guidanceSpeech || companionSpeechTextFromResponse(response);
    if (!speech || responseAt === lastSpokenResponseAtRef.current) {
      scheduleRestartListening("success");
      return;
    }
    lastSpokenResponseAtRef.current = responseAt;

    if (presence && guidancePlan && hasGuidanceScript(guidancePlan)) {
      setSpeaking(true);
      void scriptPlayer.startScript(presence).finally(() => setSpeaking(false));
      return;
    }

    const useTimed = Boolean(guidancePlan?.speech?.length && presence);
    if (useTimed && guidancePlan) {
      const initial = manifestationsForSegment(
        guidancePlan,
        guidancePlan.speech[0]?.segmentIndex ?? 0,
      );
      setFlatManifestations(initial);
    }

    setSpeaking(true);
    lastTtsTextRef.current = speech;
    const speakPromise = useTimed
      ? timedTts.speakTimed(speech, (segmentIndex) => {
          if (!guidancePlan) return;
          setFlatManifestations(manifestationsForSegment(guidancePlan, segmentIndex));
        })
      : tts.speak(speech);

    void speakPromise
      .catch(() => undefined)
      .finally(finishGuidanceBeat);
  }, [
    glass.askStatus,
    glass.lastError,
    glass.lastAskResponse,
    glass.companionPresence,
    state.active,
    restartListening,
    scheduleRestartListening,
    tts,
    timedTts,
    scriptPlayer,
    finishGuidanceBeat,
  ]);

  useEffect(() => () => {
    clearVoiceModeAutoSubmit();
    clearRestartTimer();
    if (bargeInTimerRef.current != null) {
      window.clearTimeout(bargeInTimerRef.current);
    }
  }, [clearRestartTimer]);

  useEffect(() => {
    return window.glass.onCompanionPrivacyResumed(() => {
      if (companionPrivacyRef.current?.active) return;
      const line = "I'm back when you need me.";
      lastTtsTextRef.current = line;
      setSpeaking(true);
      void tts.speak(line).finally(() => setSpeaking(false));
    });
  }, [tts]);

  const handleCompanionTranscriptRef = useRef(handleCompanionTranscript);
  handleCompanionTranscriptRef.current = handleCompanionTranscript;

  useEffect(() => {
    return window.glass.onCompanionDeepgramFinal(({ text, speakerId }) => {
      handleCompanionTranscriptRef.current(text, { speakerId });
    });
  }, []);

  useEffect(() => {
    const at = glass.lastAskResponse?.at;
    if (!at || !companionActive) return;
    if (at === lastResponseMarkerRef.current) return;
    lastResponseMarkerRef.current = at;
    lastResponseAtRef.current = Date.now();
  }, [glass.lastAskResponse?.at, companionActive]);

  useEffect(() => {
    if (!companionActive) {
      resetAmbientRefs();
    }
  }, [companionActive, resetAmbientRefs]);

  // ── Agent narration — Aletheia speaks agent progress when active ───────────
  const companionActiveRef = useRef(companionActive);
  companionActiveRef.current = companionActive;
  const companionWarmupRef = useRef(glass.companionWarmupPhase ?? "none");
  companionWarmupRef.current = glass.companionWarmupPhase ?? "none";
  const glassIdeActiveRef = useRef(glass.glassIdeActive === true);
  glassIdeActiveRef.current = glass.glassIdeActive === true;

  const narrationPrivacyBlocked = useCallback((): boolean => {
    return isCompanionNarrationPrivacyBlocked(
      companionPrivacyRef.current?.active === true,
      privacyPendingRef.current,
    );
  }, []);

  const canDrainNarrationQueue = useCallback((): boolean => {
    return canDrainCompanionNarrationQueue({
      privacyActive: companionPrivacyRef.current?.active === true,
      privacyPending: privacyPendingRef.current,
      companionActive: companionActiveRef.current,
      queueLength: narrateQueueRef.current.length,
    });
  }, []);

  const tryDequeueNarration = useCallback(async (): Promise<void> => {
    if (narrateBusyRef.current) return;
    if (narrationPrivacyBlocked()) return;
    if (!canDrainNarrationQueue()) {
      narrateQueueRef.current = [];
      return;
    }
    if (companionActiveRef.current && companionWarmupRef.current === "warming") return;
    if (speakingRef.current) return;

    const text = narrateQueueRef.current.shift();
    if (!text) return;

    narrateBusyRef.current = true;
    setSpeaking(true);
    speakingRef.current = true;
    lastTtsTextRef.current = text;
    try {
      await tts.speak(text);
    } catch {
      // Skip failed narration clips and continue the queue.
    } finally {
      narrateBusyRef.current = false;
      setSpeaking(false);
      speakingRef.current = false;
      if (narrateQueueRef.current.length > 0) {
        void tryDequeueNarration();
      }
    }
  }, [canDrainNarrationQueue, tts.speak]);

  useEffect(() => {
    const mountedRef = { current: true };

    const enqueueNarration = (text: string): void => {
      const queue = narrateQueueRef.current;
      if (queue[queue.length - 1] !== text) {
        queue.push(text);
      }
      void tryDequeueNarration();
    };

    const handleAgentNarrate = (ev: import("../../shared/ipc.ts").AgentEvent): void => {
      if (ev.kind !== "narrate" || !ev.text?.trim()) return;
      if (!shouldEnqueueAgentNarrate({
        privacyActive: companionPrivacyRef.current?.active === true,
        privacyPending: privacyPendingRef.current,
        companionActive: companionActiveRef.current,
        glassIdeActive: glassIdeActiveRef.current,
        agentId: ev.agentId,
      })) {
        return;
      }
      enqueueNarration(ev.text.trim());
    };

    const unsub = window.glass.onAgentEvent(handleAgentNarrate);

    return () => {
      mountedRef.current = false;
      narrateQueueRef.current = [];
      unsub();
    };
  }, [tryDequeueNarration]);

  const ideAdvisorySpokenRef = useRef(0);

  useEffect(() => {
    if (glass.companionPrivacy?.active) {
      privacyPendingRef.current = false;
    } else if (!glass.companionPrivacy) {
      privacyPendingRef.current = false;
    }
    if (!glass.companionPrivacy?.active && !privacyPendingRef.current) return;
    narrateQueueRef.current = [];
    if (narrateBusyRef.current) {
      tts.stop();
      narrateBusyRef.current = false;
      setSpeaking(false);
      speakingRef.current = false;
    }
  }, [glass.companionPrivacy?.active, glass.companionPrivacy, tts]);

  useEffect(() => {
    if (!glass.glassIdeActive || !companionActive) return;
    if (isCompanionNarrationPrivacyBlocked(
      glass.companionPrivacy?.active === true,
      privacyPendingRef.current,
    )) {
      return;
    }
    const advisory = glass.glassIdeAletheia;
    const text = advisory?.spokenText?.trim();
    if (!text || !advisory?.spokenNonce) return;
    if (advisory.spokenNonce <= ideAdvisorySpokenRef.current) return;
    ideAdvisorySpokenRef.current = advisory.spokenNonce;
    const queue = narrateQueueRef.current;
    if (queue[queue.length - 1] !== text) {
      queue.push(text);
    }
    void tryDequeueNarration();
  }, [
    glass.glassIdeActive,
    glass.glassIdeAletheia?.spokenNonce,
    glass.glassIdeAletheia?.spokenText,
    companionActive,
    glass.companionPrivacy?.active,
    glass.companionPrivacy,
    tryDequeueNarration,
  ]);

  // When companion speech finishes or warmup completes, drain queued agent narrations.
  useEffect(() => {
    if (!speaking && narrateQueueRef.current.length > 0) {
      void tryDequeueNarration();
    }
  }, [speaking, companionActive, glass.companionWarmupPhase, tryDequeueNarration]);

  const activeManifestations =
    scriptPlayer.activeManifestations ?? flatManifestations;

  const liveTranscript =
    tx.commandBarListenText?.trim() || state.interim || state.transcript || "";

  return {
    active: companionActive && state.active,
    state,
    statusLabel: companionStatusLabel(state.status, {
      speaking,
      scriptLabel: scriptPlayer.statusLabel,
      hearingMachineAudio: tx.companionSystemAudioActive,
    }),
    liveTranscript,
    speaking,
    activeManifestations,
    toggle,
    stop,
  };
}

export function GlassCompanionProvider({ children }: { children: ReactNode }): JSX.Element {
  const companion = useGlassCompanionSession();
  return (
    <GlassCompanionContext.Provider value={companion}>{children}</GlassCompanionContext.Provider>
  );
}
