import type { ResponsePlan } from "../responseContracts/resolveResponsePlan.js";
import { selectArtifactType } from "./artifactSelector.js";
import { generateStructuredArtifact } from "./artifactStructuredGenerator.js";
import type { ArtifactBuildTrace, ArtifactTrace, IivoArtifact } from "./artifactTypes.js";
import { repairArtifact, validateArtifact } from "./artifactValidation.js";

export function estimateArtifactSizeBytes(artifact: IivoArtifact): number {
  try {
    return new TextEncoder().encode(JSON.stringify(artifact)).length;
  } catch {
    return JSON.stringify(artifact).length;
  }
}

export type BuildRunArtifactResult = {
  artifact: IivoArtifact | null;
  trace: ArtifactTrace | null;
};

export async function buildRunArtifact(
  prompt: string,
  answer: string,
  responsePlan: ResponsePlan,
  options?: { storedByReference?: boolean },
): Promise<BuildRunArtifactResult> {
  const selection = selectArtifactType({
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });

  if (selection.type === "plain_answer") {
    return { artifact: null, trace: null };
  }

  const structured = await generateStructuredArtifact({
    prompt,
    answer,
    artifactType: selection.type,
    responseContract: responsePlan.contract,
    renderMode: selection.renderMode,
  });

  let artifact = structured.artifact;
  let validationIssues = [...structured.validationIssues];
  let schemaValidationPassed = structured.schemaValidationPassed;

  if (artifact) {
    let validation = validateArtifact(artifact);
    if (!validation.valid) {
      artifact = repairArtifact(artifact, answer);
      validation = validateArtifact(artifact);
      validationIssues = [...validationIssues, ...validation.issues];
    }
    if (!validation.valid && validation.severity === "blocker") {
      return {
        artifact: null,
        trace: {
          artifactType: selection.type,
          renderMode: selection.renderMode,
          builderModeSuggested: selection.renderMode === "canvas",
          artifactBuild: buildArtifactBuildTrace({
            selection,
            buildMode: "plain_fallback",
            schemaValidationPassed: false,
            validationIssues: [...validationIssues, ...validation.issues],
            artifact: null,
            storedByReference: options?.storedByReference ?? false,
            warnings: [
              ...structured.warnings,
              "Artifact validation failed; showing plain answer.",
            ],
          }),
        },
      };
    }
    schemaValidationPassed = validation.valid && schemaValidationPassed;
  }

  if (!artifact) {
    return {
      artifact: null,
      trace: structured.warnings.length
        ? {
            artifactType: selection.type,
            renderMode: selection.renderMode,
            builderModeSuggested: selection.renderMode === "canvas",
            artifactBuild: buildArtifactBuildTrace({
              selection,
              buildMode: structured.buildMode,
              schemaValidationPassed: false,
              validationIssues,
              artifact: null,
              storedByReference: options?.storedByReference ?? false,
              warnings: structured.warnings,
            }),
          }
        : null,
    };
  }

  const sizeBytes = estimateArtifactSizeBytes(artifact);

  return {
    artifact,
    trace: {
      artifactType: artifact.type,
      renderMode: artifact.renderMode,
      builderModeSuggested: selection.renderMode === "canvas",
      artifactBuild: buildArtifactBuildTrace({
        selection,
        buildMode: structured.buildMode,
        schemaValidationPassed,
        validationIssues,
        artifact,
        storedByReference: options?.storedByReference ?? false,
        warnings: structured.warnings,
        sizeBytes,
      }),
    },
  };
}

function buildArtifactBuildTrace({
  selection,
  buildMode,
  schemaValidationPassed,
  validationIssues,
  artifact,
  storedByReference,
  warnings,
  sizeBytes,
}: {
  selection: { type: string; renderMode: "inline" | "canvas" };
  buildMode: ArtifactBuildTrace["buildMode"];
  schemaValidationPassed: boolean;
  validationIssues: string[];
  artifact: IivoArtifact | null;
  storedByReference: boolean;
  warnings: string[];
  sizeBytes?: number;
}): ArtifactBuildTrace {
  return {
    artifactType: selection.type,
    renderMode: selection.renderMode,
    buildMode,
    schemaValidationPassed,
    validationIssues,
    artifactSizeBytes: sizeBytes ?? (artifact ? estimateArtifactSizeBytes(artifact) : 0),
    storedByReference,
    fallbackUsed: buildMode !== "schema_first",
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
