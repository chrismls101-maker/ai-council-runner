/**
 * Glass Pathways — active guidance helpers.
 */

import type { Pathway, Stage, Step } from "./glassPathwaysTypes.ts";
import {
  stageCompletionStrings,
  stageUserActions,
  stepsForStage,
} from "./glassPathwaysTypes.ts";

export function resolveFocusStage(pathway: Pathway): Stage | null {
  const markedActive = pathway.stages.find(
    (s) => s.status === "active" || s.status === "privacy_handoff",
  );
  if (markedActive) return markedActive;

  if (pathway.currentStageId) {
    const current = pathway.stages.find((s) => s.id === pathway.currentStageId);
    if (current && current.status !== "completed") return current;
  }

  return pathway.stages.find((s) => s.status === "pending" || s.status === "ready") ?? null;
}

export function resolveFocusStep(pathway: Pathway): Step | null {
  if (pathway.currentStepId) {
    const step = pathway.steps.find((s) => s.id === pathway.currentStepId);
    if (step && step.status !== "completed") return step;
  }

  const stage = resolveFocusStage(pathway);
  if (!stage) return null;

  return (
    stepsForStage(pathway, stage.id).find(
      (s) => s.status === "active" || s.status === "running_operator" || s.status === "privacy_handoff",
    )
    ?? stepsForStage(pathway, stage.id).find((s) => s.status !== "completed")
    ?? null
  );
}

export function resolveNextStage(pathway: Pathway, afterStage?: Stage | null): Stage | null {
  const ref = afterStage ?? resolveFocusStage(pathway);
  if (!ref) {
    return pathway.stages.find((s) => s.status === "pending") ?? null;
  }

  return (
    pathway.stages.find((s) => s.index > ref.index && s.status !== "completed") ?? null
  );
}

export function recommendedNextMove(stage: Stage, pathway?: Pathway): string {
  if (pathway) {
    const step = stepsForStage(pathway, stage.id).find((s) => s.status !== "completed");
    if (step) return step.description.trim();
  }
  return stageUserActions(stage)[0]?.trim() || stage.objective.trim();
}

export function pathwaySubsteps(stage: Stage, pathway?: Pathway): string[] {
  if (pathway) {
    const steps = stepsForStage(pathway, stage.id);
    if (steps.length > 0) return steps.map((s) => s.description);
  }
  const actions = stageUserActions(stage);
  if (actions.length > 0) return actions;
  return stageCompletionStrings(stage).slice(0, 3);
}

export function substepDoneAt(stage: Stage, index: number, pathway?: Pathway): boolean {
  if (pathway) {
    const stepId = stage.stepIds[index];
    const step = stepId ? pathway.steps.find((s) => s.id === stepId) : null;
    if (step) return step.status === "completed";
  }
  return stage.substepDone?.[index] === true;
}

export function substepProgressLabel(stage: Stage, pathway?: Pathway): string | null {
  const steps = pathwaySubsteps(stage, pathway);
  if (steps.length === 0) return null;
  const done = steps.filter((_, i) => substepDoneAt(stage, i, pathway)).length;
  return `${done}/${steps.length} steps`;
}

function pathwayContextBlock(pathway: Pathway, stage: Stage, step?: Step | null): string {
  const narrative = pathway.context.currentNarrative
    ? `Narrative: ${pathway.context.currentNarrative}`
    : "";
  return [
    `Pathway: ${pathway.title}`,
    `Goal: ${pathway.goal}`,
    `Stage ${stage.index}: ${stage.title}`,
    `Objective: ${stage.objective}`,
    stage.whyItMatters ? `Why it matters: ${stage.whyItMatters}` : "",
    step ? `Current step (${step.mode}): ${step.description}` : "",
    narrative,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStageExplainPrompt(pathway: Pathway, stage: Stage): string {
  const step = resolveFocusStep(pathway);
  return [
    "I'm working through a Glass Pathway stage. Explain this stage more deeply — what matters, what I might miss, and how to think about it.",
    "",
    pathwayContextBlock(pathway, stage, step),
    "",
    (stage.whatToReview?.length ?? 0) > 0
      ? `What to review: ${stage.whatToReview!.join("; ")}`
      : "",
    stage.commonMistakes.length ? `Common mistakes: ${stage.commonMistakes.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStageStuckPrompt(pathway: Pathway, stage: Stage): string {
  const actions = stageUserActions(stage);
  const criteria = stageCompletionStrings(stage);
  return [
    "I'm stuck on this Glass Pathway stage. Help me think it through — break down what's blocking me and suggest a concrete next move.",
    "",
    pathwayContextBlock(pathway, stage, resolveFocusStep(pathway)),
    "",
    actions.length ? `Suggested actions so far: ${actions.join("; ")}` : "",
    criteria.length ? `Done when: ${criteria.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAletheiaHelpPrompt(
  pathway: Pathway,
  stage: Stage,
  helpTopic: string,
): string {
  return [
    `On this Glass Pathway stage, help me with: ${helpTopic}`,
    "",
    pathwayContextBlock(pathway, stage, resolveFocusStep(pathway)),
  ].join("\n");
}
