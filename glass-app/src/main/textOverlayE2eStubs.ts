/**
 * E2E stubs for Glass This intelligence — instant realistic cards without API keys.
 */

import type { TextOverlayCard, TextOverlayExtraction } from "../shared/textOverlayTypes.ts";
import { buildMockTextOverlayCard } from "../shared/textOverlayFixtures.ts";

export function buildE2eTextOverlayCard(input: {
  extraction: TextOverlayExtraction;
  cursorX: number;
  cursorY: number;
  cardId: string;
}): TextOverlayCard {
  return buildMockTextOverlayCard({
    id: input.cardId,
    rawText: input.extraction.rawText,
    contentType: input.extraction.contentType,
    triggerSource: input.extraction.triggerSource,
    cursorX: input.cursorX,
    cursorY: input.cursorY,
  });
}
