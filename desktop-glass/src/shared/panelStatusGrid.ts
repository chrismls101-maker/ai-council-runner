/**
 * Panel status grid cards (Server, STT, Capture, Audio, Permissions, Session).
 */

import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import { systemAudioStatusMessage } from "./systemAudioTypes.ts";
import type { SttProviderStatus } from "./sttTypes.ts";
import type { WindowContextStatus } from "./windowContextTypes.ts";
import type { GlassScreenContextStatus } from "./glassScreenContext.ts";

export type PanelStatusLevel = "ok" | "warn" | "error" | "idle";

export interface PanelStatusCard {
  key: string;
  label: string;
  level: PanelStatusLevel;
  status: string;
  detail?: string;
}

export interface PanelStatusGridInput {
  sessionStatus?: "active" | "paused" | "ended" | "idle" | null;
  lastError?: string;
  sttStatus: SttProviderStatus;
  sttEndpoint: "server" | "direct" | "none";
  captureStatus?: string;
  capturing?: boolean;
  systemAudioStatus: SystemAudioStatus;
  windowContextStatus: WindowContextStatus;
  listening?: boolean;
  screenContext?: GlassScreenContextStatus;
}

export function buildPanelStatusCards(input: PanelStatusGridInput): PanelStatusCard[] {
  return [
    buildServerCard(input),
    buildSttCard(input),
    buildCaptureCard(input),
    buildAudioCard(input),
    buildPermissionsCard(input),
    buildSessionCard(input),
    buildScreenContextCard(input),
  ];
}

function buildScreenContextCard(input: PanelStatusGridInput): PanelStatusCard {
  const sc = input.screenContext;
  if (!sc || sc.kind === "none") {
    return { key: "screen_context", label: "Screen", level: "idle", status: "Screen context: none" };
  }
  const level: PanelStatusLevel =
    sc.kind === "ready"
      ? "ok"
      : sc.kind === "captured"
        ? "ok"
        : sc.kind === "vision_not_configured"
          ? "warn"
          : sc.kind === "unavailable"
            ? "warn"
            : "idle";
  return {
    key: "screen_context",
    label: "Screen",
    level,
    status: sc.label.replace(/^Screen context:\s*/i, ""),
    detail: sc.detail,
  };
}

function buildServerCard(input: PanelStatusGridInput): PanelStatusCard {
  const err = input.lastError ?? "";
  if (/fetch|network|econnrefused|unavailable|failed to reach|cannot connect/i.test(err)) {
    return {
      key: "server",
      label: "Server",
      level: "error",
      status: "Offline",
      detail: err,
    };
  }
  if (input.sttEndpoint === "server" && input.sttStatus === "server_unavailable") {
    return {
      key: "server",
      label: "Server",
      level: "warn",
      status: "Unavailable",
      detail: "Start IIVO server or use direct STT.",
    };
  }
  return { key: "server", label: "Server", level: "ok", status: "Online" };
}

function buildSttCard(input: PanelStatusGridInput): PanelStatusCard {
  switch (input.sttStatus) {
    case "configured":
      return { key: "stt", label: "STT", level: "ok", status: "OpenAI ready" };
    case "missing_key":
      return { key: "stt", label: "STT", level: "warn", status: "Missing key" };
    case "disabled":
      return { key: "stt", label: "STT", level: "idle", status: "Disabled" };
    case "server_unavailable":
      return { key: "stt", label: "STT", level: "warn", status: "Server unavailable" };
    case "error":
      return { key: "stt", label: "STT", level: "error", status: "Error" };
    default:
      return { key: "stt", label: "STT", level: "idle", status: input.sttStatus };
  }
}

function buildCaptureCard(input: PanelStatusGridInput): PanelStatusCard {
  if (input.capturing) {
    return { key: "capture", label: "Capture", level: "warn", status: "Capturing" };
  }
  const capture = input.captureStatus ?? "idle";
  if (capture === "failed") {
    return { key: "capture", label: "Capture", level: "error", status: "Error" };
  }
  if (/permission|screen recording/i.test(capture)) {
    return {
      key: "capture",
      label: "Capture",
      level: "warn",
      status: "Permission needed",
    };
  }
  if (capture.startsWith("Capturing") || capture.startsWith("Captured")) {
    return { key: "capture", label: "Capture", level: "ok", status: capture };
  }
  return { key: "capture", label: "Capture", level: "ok", status: "Ready" };
}

function buildAudioCard(input: PanelStatusGridInput): PanelStatusCard {
  switch (input.systemAudioStatus) {
    case "available":
      return {
        key: "audio",
        label: "Audio",
        level: input.listening ? "ok" : "ok",
        status: input.listening ? "Listening" : "Mic ready",
      };
    case "requires_permission":
      return {
        key: "audio",
        label: "Audio",
        level: "warn",
        status: "Permission needed",
        detail: systemAudioStatusMessage("requires_permission"),
      };
    case "requires_virtual_device":
      return {
        key: "audio",
        label: "Audio",
        level: "warn",
        status: "Virtual device needed",
        detail: systemAudioStatusMessage("requires_virtual_device"),
      };
    case "unsupported":
      return {
        key: "audio",
        label: "Audio",
        level: "idle",
        status: "System audio unavailable",
      };
    case "error":
      return { key: "audio", label: "Audio", level: "error", status: "Error" };
    default:
      return { key: "audio", label: "Audio", level: "idle", status: String(input.systemAudioStatus) };
  }
}

function buildPermissionsCard(input: PanelStatusGridInput): PanelStatusCard {
  const needed: string[] = [];
  if (input.windowContextStatus === "permission_required") {
    needed.push("Accessibility");
  }
  if (input.systemAudioStatus === "requires_permission") {
    needed.push("Screen Recording");
  }
  if (input.captureStatus === "failed" && /permission|screen recording/i.test(input.lastError ?? "")) {
    needed.push("Screen Recording");
  }
  if (needed.length === 0) {
    return { key: "permissions", label: "Permissions", level: "ok", status: "OK" };
  }
  return {
    key: "permissions",
    label: "Permissions",
    level: "warn",
    status: `${needed.join(", ")} needed`,
  };
}

function buildSessionCard(input: PanelStatusGridInput): PanelStatusCard {
  if (input.sessionStatus === "active") {
    return { key: "session", label: "Session", level: "ok", status: "Active" };
  }
  if (input.sessionStatus === "paused") {
    return { key: "session", label: "Session", level: "warn", status: "Paused" };
  }
  if (input.sessionStatus === "ended") {
    return { key: "session", label: "Session", level: "idle", status: "Ended" };
  }
  return { key: "session", label: "Session", level: "idle", status: "Idle" };
}
