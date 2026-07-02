/**
 * Glass this — L4 action prompts and memory fact builders (pure, testable).
 */

import type { ExtractedFact } from "../shared/glassMemory.ts";
import type {
  TextContentType,
  TextOverlayAction,
  TextOverlayActionOp,
  TextOverlayCard,
} from "../shared/textOverlayTypes.ts";

function slugKey(text: string, max = 48): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, max);
  return slug || "snippet";
}

export function buildTextOverlayOpenInGlassPrompt(card: TextOverlayCard): string {
  const lines = [
    "Explain and help me act on this text I was reading on screen:",
    "",
    `"""${card.logicalUnit ?? card.rawText}"""`,
    "",
    card.level1 ? `Glass summary: ${card.level1}` : "",
    card.level2 ? `Verification note: ${card.level2}` : "",
    card.level3 ? `Personal context: ${card.level3}` : "",
  ].filter(Boolean);
  return lines.join("\n").trim();
}

export function buildTextOverlayDraftReplyPrompt(card: TextOverlayCard): string {
  if (card.contentType === "legal_contract") {
    return `Draft a redline or counter-language for this contract clause:\n\n"""${card.rawText}"""\n\nContext: ${card.level1}`;
  }
  if (card.contentType === "meeting_notes") {
    return `Draft a follow-up email based on these meeting notes:\n\n"""${card.rawText}"""`;
  }
  if (card.contentType === "medical_health") {
    return `Help me prepare questions for my doctor about:\n\n"""${card.rawText}"""\n\nPlain-language context: ${card.level1}`;
  }
  return `Draft a reply to this:\n\n"""${card.rawText}"""\n\nContext: ${card.level1}`;
}

export function buildTextOverlayApplyFixPrompt(card: TextOverlayCard): string {
  return `I'm seeing this error or technical text on screen. Suggest a fix:\n\n"""${card.rawText}"""\n\nContext: ${card.level1}`;
}

export function buildTextOverlayActionItemPrompt(card: TextOverlayCard): string {
  return `Create a clear action item from this:\n\n"""${card.rawText}"""\n\nSummary: ${card.level1}`;
}

export function buildMemoryFactFromTextOverlayCard(
  card: TextOverlayCard,
  op: TextOverlayActionOp,
): ExtractedFact {
  const prefix =
    op === "flag_risk"
      ? "flagged_risk"
      : op === "save_to_memory"
        ? "saved_text"
        : "text_overlay";
  const key = `${prefix}:${card.contentType}:${slugKey(card.rawText)}`;
  const value = [
    card.rawText.slice(0, 280),
    card.level1,
    card.level2 ? `Note: ${card.level2}` : "",
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 600);
  return { key, value, confidence: 0.75 };
}

export function copyPayloadForAction(
  action: TextOverlayAction,
  card: Pick<TextOverlayCard, "rawText" | "level1" | "contentType">,
): string {
  if (typeof action.payload === "string" && action.payload.trim()) {
    return action.payload;
  }
  if (action.label.toLowerCase().includes("translation") || card.contentType === "foreign_language") {
    return card.level1 ?? card.rawText;
  }
  if (action.label.toLowerCase().includes("command") || action.label.toLowerCase().includes("finding")) {
    return card.rawText;
  }
  return card.level1 || card.rawText;
}

export function enrichTextOverlayActions(
  actions: TextOverlayAction[],
  card: Pick<TextOverlayCard, "rawText" | "level1" | "contentType">,
): TextOverlayAction[] {
  return actions.map((action) => {
    if (action.op !== "copy_to_clipboard") return action;
    return {
      ...action,
      payload: copyPayloadForAction(action, card),
    };
  });
}

export function promptForTextOverlayAction(
  card: TextOverlayCard,
  op: TextOverlayActionOp,
): string | null {
  switch (op) {
    case "open_in_glass":
      return buildTextOverlayOpenInGlassPrompt(card);
    case "draft_reply":
      return buildTextOverlayDraftReplyPrompt(card);
    case "apply_fix":
      return buildTextOverlayApplyFixPrompt(card);
    case "create_action_item":
      return buildTextOverlayActionItemPrompt(card);
    case "flag_risk":
      return `Review this for risk and suggest what to watch for:\n\n"""${card.rawText}"""\n\nContext: ${card.level1}`;
    default:
      return null;
  }
}

export function usesCommandBar(op: TextOverlayActionOp): boolean {
  return (
    op === "draft_reply"
    || op === "apply_fix"
    || op === "create_action_item"
  );
}

/** Map content type to a short label for memory keys when auto-saving vocabulary. */
export function vocabularyMemoryKey(contentType: TextContentType, rawText: string): ExtractedFact {
  return {
    key: `vocabulary:${contentType}:${slugKey(rawText)}`,
    value: rawText.slice(0, 400),
    confidence: 0.8,
  };
}
