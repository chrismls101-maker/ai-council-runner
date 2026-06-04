/**
 * Visual ask preflight issue codes and user messages (shared).
 */

export type VisualAskPreflightCode =
  | "capture_permission"
  | "vision_disabled"
  | "server_offline"
  | "no_display"
  | "payload_too_large"
  | "server_config";

export interface VisualAskPreflightFailure {
  ok: false;
  code: VisualAskPreflightCode;
  message: string;
}

export type VisualAskPreflightResult = { ok: true } | VisualAskPreflightFailure;

export const VISUAL_PREFLIGHT_MESSAGES: Record<VisualAskPreflightCode, string> = {
  capture_permission: "Screen Recording permission needed.",
  vision_disabled: "Vision is not enabled on the IIVO server.",
  server_offline: "IIVO server unavailable.",
  no_display: "No active display found.",
  payload_too_large:
    "The screen image is still too large to analyze. Try lowering display scaling or use Capture/Open in IIVO.",
  server_config: "IIVO server configuration unavailable.",
};

export function preflightFailure(
  code: VisualAskPreflightCode,
  message?: string,
): VisualAskPreflightFailure {
  return { ok: false, code, message: message ?? VISUAL_PREFLIGHT_MESSAGES[code] };
}

/** Map preflight codes to panel server-result labels. */
export function preflightCodeToServerResult(
  code: VisualAskPreflightCode,
): import("./visualAskDiagnostics.ts").VisualAskServerResult {
  switch (code) {
    case "capture_permission":
      return "capture_permission";
    case "vision_disabled":
      return "vision_unavailable";
    case "server_offline":
    case "server_config":
      return "network_error";
    case "no_display":
      return "error";
    case "payload_too_large":
      return "413";
    default:
      return "error";
  }
}
