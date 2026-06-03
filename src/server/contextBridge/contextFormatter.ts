import {
  sourceConfidenceFromType,
  sourceConfidenceLabel,
} from "./contextConfidence.js";
import {
  formatRelevanceLabel,
  scoreContextRelevance,
  type ContextRelevanceLabel,
} from "./contextRelevance.js";
import type {
  ExternalContextAttachment,
  ExternalContextPayload,
  PrepareExternalContextResult,
  PreparedContextItem,
} from "./types.js";
import { getImageVisionConfig } from "../config/vision.js";

export const MAX_ATTACHED_CONTEXT_ITEMS = 5;
export const MAX_EXTERNAL_CONTEXT_CHARS = 10_000;
export const MAX_CONTEXT_ITEM_CHARS = 4_000;

export const EXTERNAL_CONTEXT_INSTRUCTION = `Instruction:
Use relevant context only when it helps answer the current prompt. Treat possibly relevant context cautiously. Ignore not relevant context unless the user explicitly asks about it.
If attached context seems unrelated to the prompt, say briefly: "The attached context does not appear directly relevant, so I'm not relying on it."
Do not force context into the answer just because it is attached.
Do not treat user-pasted or imported context as verified fact unless it includes reliable source information. If the context is a user-pasted opinion or AI-generated answer, treat it as context to analyze, not guaranteed truth.`;

export const CONTEXT_TRUNCATION_NOTE = "Context was truncated for this run.";

export const SCREENSHOT_CONTEXT_RUN_NOTE =
  "Screenshot attached as evidence. Visual pixel analysis requires an image-capable route.";

export const SCREENSHOT_VISION_AVAILABLE_NOTE =
  "Screenshot attached. Visual analysis is available when image vision is enabled.";

export const SCREENSHOT_VISION_UNAVAILABLE_NOTE =
  "Screenshot attached. Visual pixel analysis requires image-capable route.";

export function contextTypeLabel(type: string): string {
  switch (type) {
    case "pasted_text":
      return "pasted text";
    case "url":
      return "URL import";
    case "screenshot":
      return "screenshot";
    case "file":
      return "file";
    case "evidence":
      return "evidence";
    default:
      return type.replace(/_/g, " ");
  }
}

export function truncateContextText(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean; sentLength: number } {
  if (text.length <= maxChars) {
    return { text, truncated: false, sentLength: text.length };
  }
  const slice = text.slice(0, maxChars);
  return {
    text: slice,
    truncated: true,
    sentLength: slice.length,
  };
}

function screenshotRunNote(): string {
  const vision = getImageVisionConfig();
  if (vision.configured) return SCREENSHOT_VISION_AVAILABLE_NOTE;
  if (vision.enabled) return SCREENSHOT_VISION_UNAVAILABLE_NOTE;
  return SCREENSHOT_CONTEXT_RUN_NOTE;
}

function buildPreparedItem(
  item: ExternalContextAttachment,
  userPrompt: string,
  maxChars: number,
): PreparedContextItem {
  const sourceText =
    item.type === "screenshot"
      ? [item.contentText.trim(), item.sourceUrl ? `Source URL: ${item.sourceUrl}` : "", screenshotRunNote()]
          .filter(Boolean)
          .join("\n\n")
      : item.contentText;
  const originalLength = sourceText.length;
  const { text, truncated, sentLength } = truncateContextText(
    sourceText,
    Math.min(maxChars, MAX_CONTEXT_ITEM_CHARS),
  );
  const { label: relevance } = scoreContextRelevance(userPrompt, {
    title: item.title,
    contentText: item.contentText,
    contentSummary: item.contentSummary,
    tags: item.tags,
  });

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    sourceUrl: item.sourceUrl,
    contentText: text,
    contentSummary: item.contentSummary,
    sourceConfidence: sourceConfidenceFromType(item.type),
    relevance,
    originalLength,
    sentLength,
    truncated,
    savedToLibrary: item.savedToLibrary ?? false,
  };
}

export function prepareExternalContextForRun(
  userPrompt: string,
  items: ExternalContextAttachment[],
): PrepareExternalContextResult {
  const capped = items.slice(0, MAX_ATTACHED_CONTEXT_ITEMS);
  let truncated = capped.length < items.length;
  let remaining = MAX_EXTERNAL_CONTEXT_CHARS;
  const prepared: PreparedContextItem[] = [];

  for (const item of capped) {
    const slotsLeft = capped.length - prepared.length || 1;
    const perItemBudget = Math.min(
      MAX_CONTEXT_ITEM_CHARS,
      Math.max(200, Math.floor(remaining / slotsLeft)),
    );
    const preparedItem = buildPreparedItem(item, userPrompt, perItemBudget);
    if (preparedItem.truncated) truncated = true;
    remaining -= preparedItem.sentLength;
    prepared.push(preparedItem);
    if (remaining <= 0) break;
  }

  if (prepared.length < capped.length) truncated = true;

  const totalCharsSent = prepared.reduce((sum, i) => sum + i.sentLength, 0);
  const truncationNote = truncated ? CONTEXT_TRUNCATION_NOTE : undefined;
  const block = formatExternalContextBlock(prepared, truncated);
  const routerHint = formatRouterContextHint(prepared);

  return {
    items: prepared,
    truncated,
    truncationNote,
    block,
    routerHint,
    trace: {
      itemCount: prepared.length,
      totalCharsSent,
      truncated,
      truncationNote,
      items: prepared,
    },
  };
}

export function formatExternalContextBlock(
  items: PreparedContextItem[],
  truncated = false,
): string {
  if (items.length === 0) return "";

  const sections = items.map((item, index) => {
    const rel = formatRelevanceLabel(item.relevance);
    const header = [`[Context ${index + 1} — ${rel}] ${item.title}`];
    header.push(`Type: ${contextTypeLabel(item.type)}`);
    header.push(`Source confidence: ${sourceConfidenceLabel(item.sourceConfidence)}`);
    if (item.sourceUrl) header.push(`Source URL: ${item.sourceUrl}`);
    if (item.contentSummary?.trim()) header.push(`Summary: ${item.contentSummary.trim()}`);
    if (item.truncated) {
      header.push(
        `Truncated: yes (original ${item.originalLength.toLocaleString()} chars, sent ${item.sentLength.toLocaleString()})`,
      );
    }
    return `${header.join("\n")}\n\n${item.contentText.trim()}`;
  });

  let block = `External Context Provided By User:\n${sections.join("\n\n---\n\n")}\n\n${EXTERNAL_CONTEXT_INSTRUCTION}`;
  if (truncated) {
    block += `\n\nNote: ${CONTEXT_TRUNCATION_NOTE}`;
  }
  return block;
}

const ROUTER_PREVIEW_CHARS = 240;

export function formatRouterContextHint(items: PreparedContextItem[]): string {
  if (items.length === 0) return "";

  const lines = items.map((item, index) => {
    const previewSource = item.contentSummary?.trim() || item.contentText;
    const preview =
      previewSource.length > ROUTER_PREVIEW_CHARS
        ? `${previewSource.slice(0, ROUTER_PREVIEW_CHARS)}…`
        : previewSource;
    return `- Context ${index + 1}: "${item.title}" (${contextTypeLabel(item.type)}, ${formatRelevanceLabel(item.relevance)}): ${preview}`;
  });

  return [
    `External context attached (${items.length} item${items.length === 1 ? "" : "s"}):`,
    ...lines,
    "Router note: use titles/previews for routing only; full context is injected for answer agents.",
  ].join("\n");
}

export function normalizeExternalContextPayload(
  payload?: ExternalContextPayload | null,
): ExternalContextPayload | undefined {
  if (!payload?.items?.length) return undefined;
  const items = payload.items
    .filter((item) => item.title?.trim() && item.contentText?.trim())
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title.trim(),
      sourceUrl: item.sourceUrl?.trim() || undefined,
      contentText: item.contentText.trim(),
      contentSummary: item.contentSummary?.trim() || undefined,
      tags: item.tags?.filter(Boolean),
      savedToLibrary: item.savedToLibrary,
    }));
  return items.length > 0 ? { items } : undefined;
}

export const FINAL_JUDGE_EXTERNAL_CONTEXT_NOTE =
  "If external user-provided context influenced your answer, mention it briefly (e.g. \"Based on the context you provided…\"). If context was not relevant, say so briefly. Do not treat pasted context as verified fact.";

export type { ContextRelevanceLabel, PreparedContextItem };
