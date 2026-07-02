/**
 * Realistic Glass This QA fixtures — legal PDF, medical chart, mock card payloads.
 */

import type { TextContentType, TextOverlayCard } from "./textOverlayTypes.ts";
import { deriveTextOverlayActions } from "./textOverlayTypes.ts";
import { enrichTextOverlayActions } from "./textOverlayActions.ts";

/** Dense legal clause — typical PDF contract language. */
export const LEGAL_PDF_SENTENCE =
  "The Indemnifying Party shall indemnify, defend, and hold harmless the Indemnified Party from and against any and all claims, liabilities, damages, losses, and expenses arising out of or relating to any breach of the representations and warranties set forth herein.";

/** Medical chart excerpt — typical EHR / clinical note language. */
export const MEDICAL_CHART_SENTENCE =
  "Patient presents with acute exacerbation of chronic obstructive pulmonary disease (COPD) with SpO2 88% on room air; initiate bronchodilator therapy and evaluate for supplemental oxygen per protocol.";

/** Haiku ambient probe response for a legal PDF screen. */
export const AMBIENT_LEGAL_PROBE_JSON = JSON.stringify({
  found: true,
  text: LEGAL_PDF_SENTENCE,
  contentType: "legal_contract" as TextContentType,
});

/** Haiku ambient probe response when nothing confusing is on screen. */
export const AMBIENT_SKIP_PROBE_JSON = "SKIP";

export function buildMockTextOverlayCard(input: {
  id: string;
  rawText: string;
  contentType: TextContentType;
  triggerSource: TextOverlayCard["triggerSource"];
  cursorX?: number;
  cursorY?: number;
}): TextOverlayCard {
  const level1 =
    input.contentType === "legal_contract"
      ? "This clause shifts liability to you — if something goes wrong, you may have to cover the other party's losses and legal costs."
      : input.contentType === "medical_health"
        ? "The patient is having a COPD flare with low blood oxygen; they need breathing treatment and may need extra oxygen."
        : "Plain-language summary of the selected text.";

  return {
    id: input.id,
    rawText: input.rawText,
    logicalUnit: input.rawText,
    contentType: input.contentType,
    level1,
    level1Disclaimer:
      input.contentType === "legal_contract" || input.contentType === "medical_health"
        ? "Not legal or medical advice."
        : undefined,
    level2: null,
    verificationConfidence: "unverifiable",
    level3: null,
    level4: enrichTextOverlayActions(
      deriveTextOverlayActions(input.contentType),
      { rawText: input.rawText, level1, contentType: input.contentType },
    ),
    triggerSource: input.triggerSource,
    cursorX: input.cursorX ?? 640,
    cursorY: input.cursorY ?? 480,
    createdAt: Date.now(),
  };
}
