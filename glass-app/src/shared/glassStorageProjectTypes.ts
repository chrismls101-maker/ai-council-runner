/**
 * Glass Storage — saved project records (Design to Code and future kinds).
 */

import type { DesignStack, DesignToCodeAction } from "./designToCode.ts";

export type GlassProjectKind = "design-to-code";

export type GlassProjectStatus = "ready" | "warning" | "failed";

export type GlassProjectRecord = {
  id: string;
  kind: GlassProjectKind;
  title: string;
  createdAt: number;
  updatedAt: number;
  category: "Projects";
  source: "Design to Code";
  summary?: string;
  stack?: DesignStack;
  action?: DesignToCodeAction;
  detectedEditor?: string;
  detectedFileName?: string;
  designCaptureId: string;
  previewImagePath?: string;
  previewThumbPath?: string;
  rootPath?: string;
  primaryFilePath?: string;
  manifestPath?: string;
  tags?: string[];
  status: GlassProjectStatus;
  saveError?: string;
  /** Number of archived revisions on disk (updated on each save). */
  revisionCount?: number;
  /** Compact fidelity summary for Aletheia recall (not full artifact). */
  warningSummary?: string;
};

export type GlassProjectFileKind =
  | "primary"
  | "capture"
  | "thumb"
  | "manifest"
  | "notes"
  | "spec"
  | "revision"
  | "asset";

export type GlassProjectFileEntry = {
  name: string;
  relativePath: string;
  kind: GlassProjectFileKind;
  sizeBytes?: number;
};

export type GlassProjectRevisionEntry = {
  label: string;
  relativePath: string;
  savedAt: number;
};

export type GlassProjectDetail = {
  record: GlassProjectRecord;
  previewDataUrl: string | null;
  primaryFileName: string;
  primaryContent: string;
  notesMarkdown: string | null;
  manifest: DesignToCodeSessionManifest | null;
  files: GlassProjectFileEntry[];
  revisions: GlassProjectRevisionEntry[];
};

export function glassProjectStatusLabel(
  status: GlassProjectStatus,
  saveError?: string,
): string {
  if (status === "failed") {
    return saveError ? `Save incomplete — ${saveError}` : "Save incomplete";
  }
  if (status === "warning") return "Saved with fidelity notes";
  return "Saved";
}

export type DesignToCodeSessionManifest = {
  version: 1;
  designCaptureId: string;
  createdAt: number;
  updatedAt: number;
  action: DesignToCodeAction;
  stack: DesignStack;
  activeApp?: string;
  activeWindowTitle?: string;
  detectedEditor?: string;
  detectedFile?: {
    fileName: string;
    filePath: string | null;
    language: string;
  } | null;
  refinementHistory: Array<{ text: string; createdAt: number }>;
  latestWarnings?: string[];
  quality?: {
    readable: boolean;
    confidence: number;
    issues: string[];
    recommendation?: string;
  };
  screenSpec?: unknown;
  codebaseStylePack?: unknown;
};
