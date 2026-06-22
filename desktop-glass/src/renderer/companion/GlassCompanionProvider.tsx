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
  COMPANION_READY_SPEECH,
  COMPANION_WARMING_SPEECH,
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
  const lastWarmupSpeakNonceRef = useRef(0);
  const stoppingRef = useRef(false);
  const companionMemoryRef = useRef(glass.companionMemory);
  companionMemoryRef.current = glass.companionMemory;
  const activeAppRef = useRef(glass.activeApp);
  activeAppRef.current = glass.activeApp;

  const companionActive = glass.companionModeActive === true;

  const restartListening = useCallback(() => {
    if (!stateRef.current.active || stoppingRef.current) return;
    void tx.startCompanionListening();
  }, [tx]);

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
    dispatch({ type: "STOP_EVERYTHING" });
    clearVoiceModeAutoSubmit();
    scriptPlayer.stopScript();
    tts.stop();
    timedTts.stop();
    setSpeaking(false);
    setFlatManifestations(null);
    tx.stopListeningLocal();
    lookingSpeechSentRef.current = false;
    lastWarmupSpeakNonceRef.current = 0;
    stoppingRef.current = false;
  }, [tts, timedTts, tx, scriptPlayer]);

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
      });
      dispatch({ type: "SUBMIT", text: draft });
      for (const command of plan.commands) send(command);
      if (plan.route === "debrief") {
        dispatch({ type: "ANSWER_DONE" });
        setTimeout(restartListening, 0);
      }
      return true;
    });
    void tx.startCompanionListening();
  }, [tx, restartListening]);

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
    lastWarmupSpeakNonceRef.current = nonce;

    const phase = glass.companionWarmupPhase ?? "none";
    const line =
      phase === "warming"
        ? COMPANION_WARMING_SPEECH
        : phase === "ready"
          ? COMPANION_READY_SPEECH
          : null;
    if (!line) return;

    setSpeaking(true);
    void tts.speak(line).finally(() => setSpeaking(false));
  }, [
    companionActive,
    state.active,
    glass.companionWarmupPhase,
    glass.companionWarmupSpeakNonce,
    tts,
  ]);

  useEffect(() => {
    if (!state.active) return;
    if (glass.screenContextStatus?.kind === "looking") {
      dispatch({ type: "LOOKING" });
      if (!lookingSpeechSentRef.current) {
        lookingSpeechSentRef.current = true;
        setSpeaking(true);
        void tts.speak(COMPANION_LOOKING_SPEECH).finally(() => setSpeaking(false));
      }
    } else if (state.status !== "looking") {
      lookingSpeechSentRef.current = false;
    }
  }, [glass.screenContextStatus?.kind, state.active, state.status, tts]);

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
      setTimeout(restartListening, 0);
      return;
    }

    dispatch({ type: "ANSWER_DONE" });

    const response = glass.lastAskResponse;
    const responseAt = response?.at ?? null;
    const presence = glass.companionPresence;
    const guidancePlan = presence?.guidancePlan;
    const guidanceSpeech = companionSpeechFromGuidance(guidancePlan);
    const speech = guidanceSpeech || companionSpeechTextFromResponse(response);
    if (!speech || responseAt === lastSpokenResponseAtRef.current) {
      setTimeout(restartListening, 0);
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
    tts,
    timedTts,
    scriptPlayer,
    finishGuidanceBeat,
  ]);

  useEffect(() => () => clearVoiceModeAutoSubmit(), []);

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
