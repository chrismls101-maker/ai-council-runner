/**
 * Visual ask diagnostics for panel/status (shared).
 */

import type { GlassScreenContextPhase } from "./glassScreenContext.ts";
import type { VisualFrameMode } from "./visualImageCrop.ts";
import type { VisualQualityPreset } from "./visualAskQuality.ts";

export type VisualAskServerResult =
  | "idle"
  | "success"
  | "413"
  | "vision_unavailable"
  | "capture_permission"
  | "network_error"
  | "cancelled"
  | "error";

export type VisualAskRetentionResult =
  | "not_saved"
  | "saved_to_session"
  | "uploaded_to_context";

export interface VisualAskDiagnostics {
  phase: GlassScreenContextPhase;
  displayLabel?: string;
  displayId?: number;
  qualityPreset?: VisualQualityPreset;
  visualFrameMode?: VisualFrameMode;
  cropBounds?: { x: number; y: number; width: number; height: number };
  originalDimensions?: { width: number; height: number };
  optimizedDimensions?: { width: number; height: number };
  optimizedSizeBytes?: number;
  compressionPreset?: VisualQualityPreset;
  retryUsed?: boolean;
  serverResult?: VisualAskServerResult;
  retentionResult?: VisualAskRetentionResult;
  userMessage?: string;
  lastPreflightIssue?: string;
  handoffUrl?: string;
}

export function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatVisualAskDiagnosticsDetail(diag: VisualAskDiagnostics | null | undefined): string | undefined {
  if (!diag) return undefined;
  const parts: string[] = [];
  if (diag.displayLabel) parts.push(`Display: ${diag.displayLabel}`);
  if (diag.qualityPreset) parts.push(`Preset: ${diag.qualityPreset}`);
  if (diag.visualFrameMode) parts.push(`Frame: ${diag.visualFrameMode.replace(/_/g, " ")}`);
  if (diag.optimizedDimensions && diag.optimizedSizeBytes != null) {
    parts.push(
      `Image: ${diag.optimizedDimensions.width}×${diag.optimizedDimensions.height} · ${formatBytesShort(diag.optimizedSizeBytes)}`,
    );
  }
  if (diag.retryUsed) parts.push("Retry: yes");
  if (diag.serverResult && diag.serverResult !== "idle") parts.push(`Result: ${diag.serverResult}`);
  if (diag.retentionResult) parts.push(`Retention: ${diag.retentionResult.replace(/_/g, " ")}`);
  if (diag.userMessage) parts.push(diag.userMessage);
  return parts.length ? parts.join(" · ") : undefined;
}

export function visualAskUserMessageForFrame(
  mode: VisualFrameMode,
  displayLabel?: string,
): string {
  if (displayLabel) {
    return `Looking at ${displayLabel}…`;
  }
  switch (mode) {
    case "active_window_crop":
      return "Using focused crop.";
    case "center_crop":
      return "Using center crop.";
    default:
      return "Using whole screen.";
  }
}
