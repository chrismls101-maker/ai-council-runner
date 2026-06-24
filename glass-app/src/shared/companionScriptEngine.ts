/**
 * Glass Companion — multi-step script player (Phase 4b).
 *
 * Pure state machine — no Electron / DOM.
 */

import type {
  GuidanceManifestation,
  GuidancePlan,
  GuidanceSpeechSegment,
  GuidanceStep,
} from "./companionGuidance.ts";
import { manifestationsForSegment } from "./companionGuidance.ts";

export type ScriptPlayerPhase = "playing" | "waiting_ack" | "done";

export interface ScriptPlayerState {
  plan: GuidancePlan;
  steps: GuidanceStep[];
  currentStepIndex: number;
  phase: ScriptPlayerPhase;
}

export function hasGuidanceScript(plan: GuidancePlan | null | undefined): boolean {
  return Boolean(plan?.steps?.length && plan.steps.length > 1);
}

/** Normalize plan into ordered steps (multi-beat script or single flat step). */
export function normalizeGuidanceSteps(plan: GuidancePlan): GuidanceStep[] {
  if (plan.steps?.length) {
    return plan.steps
      .slice()
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map((step, index) => ({
        ...step,
        stepIndex: index,
      }));
  }
  return [
    {
      stepIndex: 0,
      speech: plan.speech,
      manifestations: plan.manifestations,
      waitFor: "speech_end",
      transition: "hold",
    },
  ];
}

export function createScriptPlayerState(plan: GuidancePlan): ScriptPlayerState {
  const steps = normalizeGuidanceSteps(plan);
  return {
    plan,
    steps,
    currentStepIndex: 0,
    phase: steps.length > 0 ? "playing" : "done",
  };
}

export function currentScriptStep(state: ScriptPlayerState): GuidanceStep | null {
  if (state.phase === "done") return null;
  return state.steps[state.currentStepIndex] ?? null;
}

export function speechTextForStep(step: GuidanceStep): string {
  return step.speech
    .slice()
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .map((s) => s.text)
    .join(" ");
}

export function manifestationsForScriptStep(
  step: GuidanceStep,
  segmentIndex: number,
): GuidanceManifestation[] {
  const fromStep = step.manifestations.filter((m) => {
    const exit = m.exitAtSegment ?? Number.POSITIVE_INFINITY;
    return m.enterAtSegment <= segmentIndex && segmentIndex <= exit;
  });
  if (fromStep.length) return fromStep;
  return manifestationsForSegment(
    { captureId: "", speech: step.speech, manifestations: step.manifestations },
    segmentIndex,
  );
}

export function initialManifestationsForStep(step: GuidanceStep): GuidanceManifestation[] {
  const firstSegment = step.speech[0]?.segmentIndex ?? 0;
  return manifestationsForScriptStep(step, firstSegment);
}

export function scriptStepStatusLabel(stepIndex: number, totalSteps: number): string {
  if (totalSteps <= 1) return "Aletheia · Speaking";
  return `Aletheia · Step ${stepIndex + 1} of ${totalSteps}`;
}

export function scriptWaitingAckLabel(stepIndex: number, totalSteps: number): string {
  return `Aletheia · Step ${stepIndex + 1} of ${totalSteps} · Say "next"`;
}

/** Called when TTS for current step finishes. */
export function advanceScriptAfterSpeech(state: ScriptPlayerState): ScriptPlayerState {
  const step = currentScriptStep(state);
  if (!step) return { ...state, phase: "done" };

  if (step.waitFor === "user_ack") {
    return { ...state, phase: "waiting_ack" };
  }

  return advanceToNextStep(state);
}

/** Called when user says "next" / "okay" while waiting_ack. */
export function advanceScriptOnAck(state: ScriptPlayerState): ScriptPlayerState {
  if (state.phase !== "waiting_ack") return state;
  return advanceToNextStep(state);
}

function advanceToNextStep(state: ScriptPlayerState): ScriptPlayerState {
  const nextIndex = state.currentStepIndex + 1;
  if (nextIndex >= state.steps.length) {
    return { ...state, phase: "done", currentStepIndex: state.steps.length - 1 };
  }
  return {
    ...state,
    currentStepIndex: nextIndex,
    phase: "playing",
  };
}

export function isScriptWaitingForAck(state: ScriptPlayerState | null | undefined): boolean {
  return state?.phase === "waiting_ack";
}

export function isScriptActive(state: ScriptPlayerState | null | undefined): boolean {
  if (!state) return false;
  return state.phase === "playing" || state.phase === "waiting_ack";
}

/** Flatten all speech segments across steps for timed TTS alignment (global indices). */
export function flattenScriptSpeech(plan: GuidancePlan): GuidanceSpeechSegment[] {
  const steps = normalizeGuidanceSteps(plan);
  let globalIndex = 0;
  const out: GuidanceSpeechSegment[] = [];
  for (const step of steps) {
    const ordered = step.speech.slice().sort((a, b) => a.segmentIndex - b.segmentIndex);
    for (const seg of ordered) {
      out.push({ segmentIndex: globalIndex, text: seg.text });
      globalIndex += 1;
    }
  }
  return out;
}

export function segmentIndexForScriptStep(
  plan: GuidancePlan,
  stepIndex: number,
  localSegmentIndex: number,
): number {
  const steps = normalizeGuidanceSteps(plan);
  let offset = 0;
  for (let i = 0; i < stepIndex; i += 1) {
    offset += steps[i]?.speech.length ?? 0;
  }
  return offset + localSegmentIndex;
}
