/**
 * Glass Pathways — derive bounded steps from stage content.
 */

import {
  createPathwayId,
  defaultGatePolicy,
  defaultPrivacyPolicy,
  defaultRetryPolicy,
  inferRiskLevelFromMode,
  inferStepModeFromText,
} from "./glassPathwaysDefaults.ts";
import type { GeneratedPathwayStage, Stage, Step, StepId } from "./glassPathwaysTypes.ts";
import { sanitizeGuidanceArray } from "./glassPathwaysText.ts";

function createStepId(): StepId {
  return createPathwayId("step");
}

function createCriterionId(): string {
  return createPathwayId("crit");
}

export function buildStepsForStage(
  pathwayId: string,
  stage: Pick<
    Stage,
    "id" | "title" | "objective" | "userActions" | "completionCriteria"
  >,
  raw?: GeneratedPathwayStage,
): Step[] {
  const actions = sanitizeGuidanceArray(
    raw?.userActions ?? stage.userActions ?? [],
  );
  const criteria = sanitizeGuidanceArray(
    Array.isArray(raw?.completionCriteria)
      ? (raw!.completionCriteria as string[])
      : stage.completionCriteria.map((c) => c.description),
  );

  const lines =
    actions.length > 0
      ? actions
      : criteria.length > 0
        ? criteria
        : [stage.objective];

  return lines.map((line, i) => {
    const mode = inferStepModeFromText(line);
    const riskLevel = inferRiskLevelFromMode(mode);
    return {
      id: createStepId(),
      stageId: stage.id,
      index: i + 1,
      title: lines.length > 1 ? `${stage.title} — part ${i + 1}` : stage.title,
      description: line,
      status: "pending" as const,
      mode,
      riskLevel,
      requiredUserInputs: [],
      outputArtifacts: [],
      gatePolicy: defaultGatePolicy(riskLevel),
      privacyPolicy: defaultPrivacyPolicy(),
      retryPolicy: defaultRetryPolicy(),
    };
  });
}

export function buildCompletionCriteria(
  raw: GeneratedPathwayStage | undefined,
  fallback: string[],
): Stage["completionCriteria"] {
  const strings = sanitizeGuidanceArray(
    raw?.completionCriteria ?? fallback,
  );
  return strings.map((description) => ({
    id: createCriterionId(),
    description,
    required: true,
  }));
}

export function attachStepsToStages(
  pathwayId: string,
  stages: Stage[],
  rawStages?: GeneratedPathwayStage[],
): { stages: Stage[]; steps: Step[] } {
  const allSteps: Step[] = [];

  const nextStages = stages.map((stage, i) => {
    const raw = rawStages?.[i];
    const steps = buildStepsForStage(pathwayId, stage, raw);
    allSteps.push(...steps);
    return {
      ...stage,
      pathwayId,
      stepIds: steps.map((s) => s.id),
      userActions: sanitizeGuidanceArray(raw?.userActions ?? stage.userActions ?? []),
      completionCriteria:
        stage.completionCriteria.length > 0
          ? stage.completionCriteria
          : buildCompletionCriteria(raw, []),
    };
  });

  return { stages: nextStages, steps: allSteps };
}
