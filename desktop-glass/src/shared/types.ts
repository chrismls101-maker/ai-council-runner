/**
 * Shared types for IIVO Glass. Kept dependency-free so they can be imported by
 * the Electron main process, the renderer, and the Node test runner alike.
 */

export type GlassStatus =
  | "idle"
  | "listening"
  | "capturing"
  | "sending"
  | "sent";

export type GlassMomentKind = "screenshot" | "transcript" | "note";

export type PanelTab = "summary" | "insights" | "context" | "hypotheses" | "actions";

/** Mirrors the server ContextItemType union (src/server/contextBridge/types.ts). */
export type ServerContextItemType =
  | "pasted_text"
  | "url"
  | "screenshot"
  | "file"
  | "evidence";

export type ServerSourceConfidence =
  | "user_pasted"
  | "imported_url"
  | "evidence"
  | "file"
  | "screenshot";

/** Subset of the server CreateContextItemInput that Glass produces. */
export interface ContextCreatePayload {
  type: ServerContextItemType;
  title: string;
  contentText: string;
  sourceUrl?: string;
  tags: string[];
  capturedVia: string;
  capturedAt: string;
  sourceConfidence: ServerSourceConfidence;
  lensCaptureType?: "page" | "selection" | "evidence" | "screenshot";
  pageTitle?: string;
}

export interface SavedMoment {
  id: string;
  createdAt: string;
  kind: GlassMomentKind;
  note: string;
  sourceTitle?: string;
  contextId?: string;
  sentToIivo: boolean;
}

export interface ExtractedNotes {
  summary: string;
  keyIdeas: string[];
  questions: string[];
  hypotheses: string[];
  actionItems: string[];
}
