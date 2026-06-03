import type { ContextRelevanceLabel } from "./contextRelevance.js";
import type { SourceConfidenceKind } from "./contextConfidence.js";

export type ContextItemType = "pasted_text" | "url" | "screenshot" | "file" | "evidence";

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
  /** ISO timestamp when URL content was extracted. */
  importedAt?: string;
  /** How this item was captured (e.g. browser_lens). */
  capturedVia?: string;
  /** ISO timestamp when the user captured this context. */
  capturedAt?: string;
  /** Optional stored source confidence hint from capture source. */
  sourceConfidence?: SourceConfidenceKind;
  /** Lens capture kind when capturedVia is browser_lens. */
  lensCaptureType?: "page" | "selection" | "evidence" | "screenshot";
  /** Lens screenshot capture method (e.g. visible_tab_screenshot). */
  captureType?: "visible_tab_screenshot";
  /** Relative path under data/context/, e.g. screenshots/<id>.png */
  screenshotPath?: string;
  pageTitle?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  originalTextLength?: number;
  sentTextLength?: number;
  truncated?: boolean;
}

export interface ContextStoreFile {
  items: ContextItem[];
}

export interface CreateContextItemInput {
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  contentText: string;
  contentSummary?: string;
  tags?: string[];
  project?: string;
  relatedRunId?: string;
  importedAt?: string;
  capturedVia?: string;
  capturedAt?: string;
  sourceConfidence?: SourceConfidenceKind;
  lensCaptureType?: "page" | "selection" | "evidence" | "screenshot";
  captureType?: "visible_tab_screenshot";
  screenshotPath?: string;
  pageTitle?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  originalTextLength?: number;
  sentTextLength?: number;
  truncated?: boolean;
}

export interface UpdateContextItemInput {
  title?: string;
  sourceUrl?: string;
  contentText?: string;
  contentSummary?: string;
  tags?: string[];
  project?: string;
  relatedRunId?: string;
  savedToMemory?: boolean;
  includedInRunIds?: string[];
  importedAt?: string;
  capturedVia?: string;
  capturedAt?: string;
  sourceConfidence?: SourceConfidenceKind;
  lensCaptureType?: "page" | "selection" | "evidence" | "screenshot";
  captureType?: "visible_tab_screenshot";
  screenshotPath?: string;
  pageTitle?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  originalTextLength?: number;
  sentTextLength?: number;
  truncated?: boolean;
}

/** Payload attached to a run (ephemeral or from library). */
export interface ExternalContextAttachment {
  id: string;
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  contentText: string;
  contentSummary?: string;
  tags?: string[];
  /** True when item comes from Context Library; false for prompt-only attachment. */
  savedToLibrary?: boolean;
}

export interface ExternalContextPayload {
  items: ExternalContextAttachment[];
}

export interface ImportUrlResult {
  title: string;
  sourceUrl: string;
  contentText: string;
  contentSummary?: string;
  extractedAt: string;
}

export interface PreparedContextItem {
  id: string;
  type: ContextItemType;
  title: string;
  sourceUrl?: string;
  contentText: string;
  contentSummary?: string;
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
  items: PreparedContextItem[];
}

export interface PrepareExternalContextResult {
  items: PreparedContextItem[];
  truncated: boolean;
  truncationNote?: string;
  block: string;
  routerHint: string;
  trace: ExternalContextRunTrace;
}
