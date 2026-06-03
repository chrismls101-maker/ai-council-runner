import { cleanArtifactText } from "./cleanArtifactText.js";
import { runDirectAnswerAgent } from "../agents/runDirectAnswer.js";
import type { TokenMode } from "../config/tokenModes.js";
import { resolveResponsePlan } from "../responseContracts/resolveResponsePlan.js";
import type { ArtifactType } from "./artifactTypes.js";

export type SectionVariantType =
  | "shorter"
  | "premium"
  | "direct"
  | "human"
  | "proof"
  | "risk_reduced"
  | "spanish"
  | "custom";

const VARIANT_INSTRUCTIONS: Record<Exclude<SectionVariantType, "custom">, string> = {
  shorter: "Make this section shorter while keeping the key message.",
  premium: "Make the tone more premium, polished, and confident.",
  direct: "Make the tone more direct and concise.",
  human: "Make the tone warmer and more human, less corporate.",
  proof: "Add credible proof points or specifics where appropriate.",
  risk_reduced: "Reduce risky claims and soften compliance-sensitive language.",
  spanish: "Translate this section to Spanish while preserving meaning.",
};

export async function regenerateArtifactSection(params: {
  userPrompt: string;
  artifactType: ArtifactType;
  sectionLabel: string;
  sectionContent: string;
  fullAnswer: string;
  action: "regenerate" | "edit";
  editInstruction?: string;
  variantType?: SectionVariantType;
  tokenMode?: TokenMode;
}): Promise<string> {
  const {
    userPrompt,
    artifactType,
    sectionLabel,
    sectionContent,
    fullAnswer,
    action,
    editInstruction,
    variantType,
    tokenMode = "small",
  } = params;

  const variantInstruction =
    variantType && variantType !== "custom"
      ? VARIANT_INSTRUCTIONS[variantType]
      : editInstruction?.trim();

  const taskPrompt =
    action === "edit"
      ? [
          `Edit only the "${sectionLabel}" section of this ${artifactType.replace(/_/g, " ")}.`,
          `User instruction: ${variantInstruction || "Improve clarity and tone."}`,
          "",
          "Current section:",
          sectionContent,
          "",
          "Return ONLY the revised section body. No markdown headings, no ## or ** decorators.",
        ].join("\n")
      : [
          `Regenerate only the "${sectionLabel}" section for this ${artifactType.replace(/_/g, " ")} deliverable.`,
          variantInstruction ? `Style instruction: ${variantInstruction}` : "",
          "",
          `Original user request: ${userPrompt}`,
          "",
          "Full answer context (for reference):",
          fullAnswer.slice(0, 6000),
          "",
          "Section to replace:",
          sectionContent,
          "",
          "Return ONLY the new section body. No markdown headings, no ## or ** decorators.",
        ].join("\n");

  const noop = () => {};
  const controller = new AbortController();
  const runId = `artifact-section-${Date.now()}`;

  const result = await runDirectAnswerAgent(taskPrompt, tokenMode, controller.signal, noop, runId, {
    responsePlan: resolveResponsePlan(userPrompt),
  });

  const output = result.output?.trim() ?? "";
  if (!output) {
    throw new Error("Model returned an empty section.");
  }
  return cleanArtifactText(output, { preserveCodeBlocks: true });
}
