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
import { companionOrVoiceSubmitPlan } from "../../shared/companionActions.ts";
import {
  clearVoiceModeAutoSubmit,
  setVoiceModeAutoSubmit,
} from "../../shared/voiceModeBridge.ts";
import {
  COMPANION_LOOKING_SPEECH,
  COMPANION_MACHINE_AUDIO_DISCLOSURE,
  COMPANION_READY_SPEECH,
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
  const activeAppRef = useRef(glass.activeApp);
  activeAppRef.current = glass.activeApp;

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
        setSpeaking(true);
        return timedTts.speakTimed(text, (segmentIndex) => {
          onSegmentChange?.(segmentIndex);
        });
      },
      [timedTts],
    ),
    onScriptComplete: finishGuidanceBeat,
  });

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
      const plan = companionOrVoiceSubmitPlan(draft, {
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
      return true;
    });
    void tx.startCompanionListening();
  }, [tx, scheduleRestartListening, glass.glassSettings.voiceCoderEnabled]);

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
          ? COMPANION_READY_SPEECH
          : null;
    if (!line) return;

    // Ready intro waits until mic is live — not only OmniParser warm complete.
    if (phase === "ready" && state.status !== "listening") return;

    lastWarmupSpeakNonceRef.current = nonce;

    setSpeaking(true);
    void tts.speak(line).finally(() => setSpeaking(false));
  }, [
    companionActive,
    state.active,
    glass.companionWarmupPhase,
    glass.companionWarmupSpeakNonce,
    state.status,
    tts,
  ]);

  useEffect(() => {
    if (!state.active) return;
    if (glass.screenContextStatus?.kind === "looking") {
      dispatch({ type: "LOOKING" });
      wasVisualAskRef.current = true;
      if (!lookingSpeechSentRef.current) {
        lookingSpeechSentRef.current = true;
        setSpeaking(true);
        void tts.speak(COMPANION_LOOKING_SPEECH).finally(() => setSpeaking(false));
      }
    } else if (state.status !== "looking") {
      lookingSpeechSentRef.current = false;
    }
  }, [glass.screenContextStatus?.kind, state.active, state.status, tts]);

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
    void tts.speak(COMPANION_MACHINE_AUDIO_DISCLOSURE).finally(() => setSpeaking(false));
  }, [companionActive, state.active, tx.companionSystemAudioActive, speaking, tts]);

  useEffect(() => {
    if (speaking || !pendingMachineAudioDisclosureRef.current) return;
    if (machineAudioDisclosureSpokenRef.current) return;
    pendingMachineAudioDisclosureRef.current = false;
    machineAudioDisclosureSpokenRef.current = true;
    setSpeaking(true);
    void tts.speak(COMPANION_MACHINE_AUDIO_DISCLOSURE).finally(() => setSpeaking(false));
  }, [speaking, tts]);

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
        void tts.speak(COMPANION_THINKING_SPEECH).finally(() => setSpeaking(false));
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
  }, [clearRestartTimer]);

  // ── Agent narration — Aletheia speaks agent progress when active ───────────
  const companionActiveRef = useRef(companionActive);
  companionActiveRef.current = companionActive;
  const companionWarmupRef = useRef(glass.companionWarmupPhase ?? "none");
  companionWarmupRef.current = glass.companionWarmupPhase ?? "none";
  const glassIdeActiveRef = useRef(glass.glassIdeActive === true);
  glassIdeActiveRef.current = glass.glassIdeActive === true;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const narrateQueueRef = useRef<string[]>([]);
  const narrateBusyRef = useRef(false);

  const tryDequeueNarration = useCallback(async (): Promise<void> => {
    if (narrateBusyRef.current) return;
    if (!companionActiveRef.current) {
      narrateQueueRef.current = [];
      return;
    }
    if (companionWarmupRef.current === "warming") return;
    if (speakingRef.current) return;

    const text = narrateQueueRef.current.shift();
    if (!text) return;

    narrateBusyRef.current = true;
    setSpeaking(true);
    speakingRef.current = true;
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
  }, [tts.speak]);

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
      if (!companionActiveRef.current) return;
      if (glassIdeActiveRef.current) return;
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
    if (!glass.glassIdeActive || !companionActive) return;
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
    tryDequeueNarration,
  ]);

  // When companion speech finishes or warmup completes, drain queued agent narrations.
  useEffect(() => {
    if (!companionActive) {
      narrateQueueRef.current = [];
      return;
    }
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
