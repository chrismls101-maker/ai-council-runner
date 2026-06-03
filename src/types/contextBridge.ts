export type ContextItemType = "pasted_text" | "url" | "screenshot" | "file" | "evidence";

export type SourceConfidenceKind =
  | "user_pasted"
  | "imported_url"
  | "evidence"
  | "file"
  | "screenshot";

export type ContextRelevanceLabel = "relevant" | "possibly_relevant" | "not_relevant";

export type LensCaptureType = "page" | "selection" | "evidence" | "screenshot";

export interface ContextItem {
  id: string;
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  contentText: string;
  contentSummary?: string;
  tags: string[];
  project?: string;
  createdAt: string;
  updatedAt: string;
  relatedRunId?: string;
  savedToMemory: boolean;
  includedInRunIds?: string[];
  importedAt?: string;
  capturedVia?: string;
  capturedAt?: string;
  sourceConfidence?: SourceConfidenceKind;
  lensCaptureType?: LensCaptureType;
  captureType?: "visible_tab_screenshot";
  screenshotPath?: string;
  pageTitle?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  originalTextLength?: number;
  sentTextLength?: number;
  truncated?: boolean;
}

export interface AttachedContextItem {
  id: string;
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  contentText: string;
  contentSummary?: string;
  tags?: string[];
  /** Set when attached from Context Library. */
  savedId?: string;
  /** True for prompt-only attachments (not in library). */
  ephemeral?: boolean;
  /** Client-side hint that run will truncate this item. */
  willTruncate?: boolean;
}

export interface ExternalContextPayload {
  items: AttachedContextItem[];
}

export interface ExternalContextTraceItem {
  id: string;
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  sourceConfidence: SourceConfidenceKind;
  relevance: ContextRelevanceLabel;
  originalLength: number;
  sentLength: number;
  truncated: boolean;
  savedToLibrary: boolean;
}

export interface ExternalContextRunTrace {
  itemCount: number;
  totalCharsSent: number;
  truncated: boolean;
  truncationNote?: string;
  items: ExternalContextTraceItem[];
}

export interface CreateContextItemInput {
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  contentText: string;
  contentSummary?: string;
  tags?: string[];
  project?: string;
  importedAt?: string;
  capturedVia?: string;
  capturedAt?: string;
  sourceConfidence?: SourceConfidenceKind;
  lensCaptureType?: LensCaptureType;
  captureType?: "visible_tab_screenshot";
  screenshotPath?: string;
  pageTitle?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  originalTextLength?: number;
  sentTextLength?: number;
  truncated?: boolean;
}

export const LENS_CAPTURED_VIA = "browser_lens";

export function isLensContextItem(item: Pick<ContextItem, "capturedVia" | "tags">): boolean {
  if (item.capturedVia === LENS_CAPTURED_VIA) return true;
  return item.tags?.includes("lens") ?? false;
}

export function getLensCaptureTypeLabel(type: LensCaptureType): string {
  switch (type) {
    case "page":
      return "Page";
    case "selection":
      return "Selection";
    case "evidence":
      return "Evidence";
    case "screenshot":
      return "Screenshot";
  }
}

export function resolveLensCaptureType(
  item: Pick<ContextItem, "type" | "tags" | "lensCaptureType">,
): LensCaptureType | null {
  if (!item.lensCaptureType) {
    if (item.type === "screenshot") return "screenshot";
    if (item.type === "evidence") return "evidence";
    if (item.tags?.includes("selected-text") && !item.tags?.includes("page-context")) {
      return "selection";
    }
    if (item.tags?.includes("page-context") || item.type === "url") return "page";
    if (item.tags?.includes("selected-text")) return "selection";
    return null;
  }
  return item.lensCaptureType;
}

export const MAX_ATTACHED_CONTEXT_ITEMS = 5;
export const MAX_EXTERNAL_CONTEXT_CHARS = 10_000;
export const MAX_CONTEXT_ITEM_CHARS = 4_000;

export const CONTEXT_EPHEMERAL_REMINDER =
  "Attached context is temporary unless saved.";

export const CONTEXT_TRUNCATION_NOTE = "Context was truncated for this run.";

export const ASK_IIVO_DEFAULT_PROMPT =
  "Analyze the context I provided. Tell me the key takeaway, what it means for my decision, risks, and what I should do next.";

export const ASK_IIVO_SCREENSHOT_PROMPT =
  "Analyze this screenshot. Tell me what stands out visually, what matters, risks or issues, and what I should do next.";

export const ASK_IIVO_SCREENSHOT_FALLBACK =
  "Use the page title, URL, and available text context. Visual screenshot review may be limited.";

export const SCREENSHOT_VISION_DISABLED_NOTE =
  "Screenshot is attached as evidence. Image analysis is not configured.";

export const SCREENSHOT_VISION_ENABLED_NOTE =
  "Screenshot attached. Vision analysis is available when you send.";

const VISUAL_ANALYSIS_PATTERNS = [
  /\banalyze this screenshot\b/i,
  /\bwhat do you see\b/i,
  /\blook at this\b/i,
  /\breview this design\b/i,
  /\bwhat stands out visually\b/i,
  /\bscreenshot\b/i,
  /\bvisually\b/i,
  /\bwhat matters\b/i,
  /\bwhat stands out\b/i,
];

export function promptRequestsVisualAnalysis(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return VISUAL_ANALYSIS_PATTERNS.some((pattern) => pattern.test(text));
}

export function shouldUseVisionDirectAnswer(
  prompt: string,
  items: Pick<AttachedContextItem | ContextItem, "type">[],
): boolean {
  const hasScreenshot = items.some((item) => item.type === "screenshot");
  if (!hasScreenshot) return false;
  return promptRequestsVisualAnalysis(prompt);
}

export function contextTypeLabel(type: ContextItemType): string {
  switch (type) {
    case "pasted_text":
      return "Pasted text";
    case "url":
      return "URL";
    case "screenshot":
      return "Screenshot";
    case "file":
      return "File";
    case "evidence":
      return "Evidence";
    default:
      return type;
  }
}

export function sourceConfidenceFromType(type: ContextItemType): SourceConfidenceKind {
  switch (type) {
    case "pasted_text":
      return "user_pasted";
    case "url":
      return "imported_url";
    case "evidence":
      return "evidence";
    case "file":
      return "file";
    case "screenshot":
      return "screenshot";
    default:
      return "user_pasted";
  }
}

export function sourceConfidenceLabel(kind: SourceConfidenceKind): string {
  switch (kind) {
    case "user_pasted":
      return "User-pasted context";
    case "imported_url":
      return "Imported URL";
    case "evidence":
      return "Saved evidence";
    case "file":
      return "File upload";
    case "screenshot":
      return "Screenshot";
  }
}

export function sourceConfidenceDetail(kind: SourceConfidenceKind): string {
  switch (kind) {
    case "user_pasted":
      return "User-provided, not independently verified";
    case "imported_url":
      return "Source-backed; extraction may be incomplete";
    case "evidence":
      return "Saved user evidence; not automatically verified";
    case "file":
      return "File content; coming soon";
    case "screenshot":
      return "Screenshot captured from browser; stored as evidence with optional vision analysis";
  }
}

export function formatRelevanceLabel(label: ContextRelevanceLabel): string {
  switch (label) {
    case "relevant":
      return "Relevant";
    case "possibly_relevant":
      return "Possibly relevant";
    case "not_relevant":
      return "Not relevant";
  }
}

export function attachedFromSavedItem(item: ContextItem): AttachedContextItem {
  return {
    id: item.id,
    savedId: item.id,
    ephemeral: false,
    type: item.type,
    title: item.title,
    sourceUrl: item.sourceUrl,
    contentText: item.contentText,
    contentSummary: item.contentSummary,
    tags: item.tags,
  };
}

export function ephemeralAttached(input: {
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  contentText: string;
  contentSummary?: string;
  tags?: string[];
}): AttachedContextItem {
  return {
    id: `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ephemeral: true,
    type: input.type,
    title: input.title,
    sourceUrl: input.sourceUrl,
    contentText: input.contentText,
    contentSummary: input.contentSummary,
    tags: input.tags,
  };
}

export function buildAskIivoPrompt(sourceUrl?: string): string {
  if (sourceUrl?.trim()) {
    return `${ASK_IIVO_DEFAULT_PROMPT}\n\nSource: ${sourceUrl.trim()}`;
  }
  return ASK_IIVO_DEFAULT_PROMPT;
}

export function buildAskIivoScreenshotPrompt(
  item: Pick<ContextItem, "sourceUrl" | "title" | "pageTitle">,
  options?: { visionConfigured?: boolean },
): string {
  const lines = [ASK_IIVO_SCREENSHOT_PROMPT];
  if (options?.visionConfigured) {
    lines.push("", SCREENSHOT_VISION_ENABLED_NOTE);
  } else {
    lines.push("", SCREENSHOT_VISION_DISABLED_NOTE, ASK_IIVO_SCREENSHOT_FALLBACK);
  }
  const pageTitle = item.pageTitle?.trim() || item.title?.trim();
  if (pageTitle) lines.push("", `Page title: ${pageTitle}`);
  if (item.sourceUrl?.trim()) lines.push(`Source: ${item.sourceUrl.trim()}`);
  return lines.join("\n");
}

export interface ImageVisionConfig {
  enabled: boolean;
  provider: string;
  model: string | null;
  configured: boolean;
  reason?: string;
}

export function isScreenshotContextItem(
  item: Pick<ContextItem, "type" | "lensCaptureType">,
): boolean {
  return item.type === "screenshot" || item.lensCaptureType === "screenshot";
}

export function contextScreenshotUrl(id: string): string {
  return `/api/context/${encodeURIComponent(id)}/screenshot`;
}

/** Reconstruct chat attachment chips from run trace (for messages sent before screenshot-in-chat shipped). */
export function attachedContextFromExecutionTrace(
  trace: { externalContext?: ExternalContextRunTrace } | null | undefined,
): AttachedContextItem[] {
  const items = trace?.externalContext?.items;
  if (!items?.length) return [];
  return items.map((item) => ({
    id: item.id,
    savedId: item.savedToLibrary ? item.id : item.id,
    ephemeral: !item.savedToLibrary,
    type: item.type,
    title: item.title,
    sourceUrl: item.sourceUrl,
    contentText: item.title,
  }));
}

export function resolveSubmittedAttachedContext(input: {
  submittedContext?: AttachedContextItem[];
  executionTrace?: { externalContext?: ExternalContextRunTrace } | null;
}): AttachedContextItem[] {
  if (input.submittedContext?.length) return input.submittedContext;
  return attachedContextFromExecutionTrace(input.executionTrace);
}

export type ContextLibraryFilter =
  | "all"
  | "pasted_text"
  | "url"
  | "screenshot"
  | "evidence"
  | "saved_to_memory";

export function contextLibraryFilterLabel(filter: ContextLibraryFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "pasted_text":
      return "Pasted";
    case "url":
      return "URLs";
    case "screenshot":
      return "Screenshots";
    case "evidence":
      return "Evidence";
    case "saved_to_memory":
      return "Saved to Memory";
  }
}
