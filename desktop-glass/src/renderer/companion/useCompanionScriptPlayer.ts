import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanionGuidancePayload, GuidanceManifestation } from "../../shared/companionGuidance.ts";
import {
  advanceScriptAfterSpeech,
  advanceScriptOnAck,
  createScriptPlayerState,
  currentScriptStep,
  hasGuidanceScript,
  initialManifestationsForStep,
  isScriptWaitingForAck,
  manifestationsForScriptStep,
  scriptStepStatusLabel,
  scriptWaitingAckLabel,
  speechTextForStep,
  type ScriptPlayerState,
} from "../../shared/companionScriptEngine.ts";
import {
  setCompanionScriptAckHandler,
} from "../../shared/companionScriptBridge.ts";

export interface CompanionScriptPlayer {
  scriptState: ScriptPlayerState | null;
  statusLabel: string | null;
  activeManifestations: GuidanceManifestation[] | null;
  /** Start playing a multi-step script from presence payload. */
  startScript: (presence: CompanionGuidancePayload) => Promise<void>;
  stopScript: () => void;
  isPlaying: boolean;
}

export function useCompanionScriptPlayer(input: {
  speakStep: (text: string, onSegmentChange?: (segmentIndex: number) => void) => Promise<void>;
  onScriptComplete: () => void;
}): CompanionScriptPlayer {
  const { speakStep, onScriptComplete } = input;
  const [scriptState, setScriptState] = useState<ScriptPlayerState | null>(null);
  const [activeManifestations, setActiveManifestations] = useState<GuidanceManifestation[] | null>(
    null,
  );
  const scriptStateRef = useRef(scriptState);
  scriptStateRef.current = scriptState;
  const playingRef = useRef(false);

  const stopScript = useCallback(() => {
    playingRef.current = false;
    setScriptState(null);
    setActiveManifestations(null);
    setCompanionScriptAckHandler(null);
  }, []);

  const playStepAt = useCallback(
    async (state: ScriptPlayerState, stepIndex: number): Promise<void> => {
      const step = state.steps[stepIndex];
      if (!step || !playingRef.current) return;

      setScriptState({ ...state, currentStepIndex: stepIndex, phase: "playing" });
      setActiveManifestations(initialManifestationsForStep(step));

      const text = speechTextForStep(step);
      if (!text.trim()) {
        const next = advanceScriptAfterSpeech({ ...state, currentStepIndex: stepIndex, phase: "playing" });
        if (next.phase === "done") {
          stopScript();
          onScriptComplete();
          return;
        }
        if (next.phase === "waiting_ack") {
          setScriptState(next);
          return;
        }
        await playStepAt(next, next.currentStepIndex);
        return;
      }

      await speakStep(text, (segmentIndex) => {
        setActiveManifestations(manifestationsForScriptStep(step, segmentIndex));
      });

      if (!playingRef.current) return;

      const afterSpeech = advanceScriptAfterSpeech({
        ...state,
        currentStepIndex: stepIndex,
        phase: "playing",
      });

      if (afterSpeech.phase === "waiting_ack") {
        setScriptState(afterSpeech);
        return;
      }

      if (afterSpeech.phase === "done") {
        stopScript();
        onScriptComplete();
        return;
      }

      await playStepAt(afterSpeech, afterSpeech.currentStepIndex);
    },
    [onScriptComplete, speakStep, stopScript],
  );

  const startScript = useCallback(
    async (presence: CompanionGuidancePayload) => {
      const plan = presence.guidancePlan;
      if (!hasGuidanceScript(plan)) return;
      playingRef.current = true;
      const initial = createScriptPlayerState(plan);
      setScriptState(initial);
      await playStepAt(initial, 0);
    },
    [playStepAt],
  );

  useEffect(() => {
    setCompanionScriptAckHandler((transcript) => {
      const state = scriptStateRef.current;
      if (!state || !isScriptWaitingForAck(state)) return false;
      void transcript;
      const next = advanceScriptOnAck(state);
      if (next.phase === "done") {
        stopScript();
        onScriptComplete();
        return true;
      }
      void playStepAt(next, next.currentStepIndex);
      return true;
    });
    return () => setCompanionScriptAckHandler(null);
  }, [onScriptComplete, playStepAt, stopScript]);

  const statusLabel = (() => {
    if (!scriptState) return null;
    const total = scriptState.steps.length;
    if (isScriptWaitingForAck(scriptState)) {
      return scriptWaitingAckLabel(scriptState.currentStepIndex, total);
    }
    const step = currentScriptStep(scriptState);
    if (step && total > 1) {
      return scriptStepStatusLabel(scriptState.currentStepIndex, total);
    }
    return null;
  })();

  return {
    scriptState,
    statusLabel,
    activeManifestations,
    startScript,
    stopScript,
    isPlaying: scriptState != null,
  };
}
