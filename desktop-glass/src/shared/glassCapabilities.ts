/**
 * Permission and server configuration status for IIVO Glass setup (shared).
 */

import type { SystemAudioStatus } from "./systemAudioTypes.ts";
import { systemAudioStatusMessage } from "./systemAudioTypes.ts";
import {
  PERMISSION_JUST_GRANTED_RESTART_HINT,
  isSourceEnumerationFailedMessage,
  shouldShowVirtualDeviceGuidance,
} from "./systemAudioProbe.ts";
import type { SttProviderStatus } from "./sttTypes.ts";
import {
  mapEnumerationErrorToScreenCaptureStatus,
  SCREEN_SOURCE_ENUMERATION_USER_MESSAGE,
  type ScreenCaptureProbeStatus,
  type WindowCaptureProbeStatus,
} from "./captureSourceEnumeration.ts";

export type { ScreenCaptureProbeStatus, WindowCaptureProbeStatus };
export type GlassCapabilityStatus =
  | "ready"
  | "not_requested"
  | "permission_required"
  | "permission_denied"
  | "configured"
  | "missing_config"
  | "unsupported"
  | "requires_virtual_device"
  | "error";

export type GlassCapabilitySeverity = "ok" | "warn" | "error" | "idle";

export type GlassCapabilityId =
  | "screenRecording"
  | "windowCapture"
  | "microphone"
  | "systemAudio"
  | "vision"
  | "stt"
  | "server";

export type GlassSetupActionType =
  | "open-screen-recording-settings"
  | "open-microphone-settings"
  | "open-privacy-settings"
  | "open-audio-midi-setup"
  | "show-virtual-audio-help"
  | "retry-capture"
  | "retry-system-audio"
  | "test-microphone"
  | "test-system-audio"
  | "run-setup-check"
  | "run-capture-diagnostics";

export interface GlassSetupAction {
  label: string;
  command: GlassSetupActionType;
}

export interface GlassCapabilityRow {
  id: GlassCapabilityId;
  status: GlassCapabilityStatus;
  label: string;
  detail?: string;
  actionLabel?: string;
  actionCommand?: GlassSetupActionType;
  actions?: GlassSetupAction[];
  severity: GlassCapabilitySeverity;
}

export type MicPermissionReport = "not_requested" | "granted" | "denied" | "error";

export interface GlassServerHealthForSetup {
  reachable: boolean;
  vision?: {
    enabled: boolean;
    configured: boolean;
    reason?: string;
  };
  stt?: {
    configured: boolean;
    enabled?: boolean;
    reason?: string;
  };
}

export interface GlassSetupCapabilitiesInput {
  platform?: NodeJS.Platform;
  screenCaptureProbe: ScreenCaptureProbeStatus;
  screenCaptureDetail?: string;
  windowCaptureProbe?: WindowCaptureProbeStatus;
  windowCaptureDetail?: string;
  captureStatus?: string;
  micPermission: MicPermissionReport;
  micListening?: boolean;
  systemAudioStatus: SystemAudioStatus;
  systemAudioDetail?: string;
  transcriptionMode?: string;
  serverHealth: GlassServerHealthForSetup | null;
  sttStatus: SttProviderStatus;
  sttEnabled: boolean;
  lastError?: string;
}

export const SCREEN_RECORDING_RESTART_HINT =
  "After granting Screen Recording, quit and reopen IIVO Glass if capture still fails.";

export const VIRTUAL_AUDIO_HELP_DETAIL =
  "Some macOS setups cannot provide system audio directly. Install a virtual audio device (e.g. BlackHole or Loopback), route system output through it, then choose that device when starting System Audio.";

function severityFromStatus(status: GlassCapabilityStatus): GlassCapabilitySeverity {
  switch (status) {
    case "ready":
    case "configured":
      return "ok";
    case "not_requested":
      return "idle";
    case "permission_required":
    case "missing_config":
    case "requires_virtual_device":
      return "warn";
    case "permission_denied":
    case "unsupported":
    case "error":
      return "error";
    default:
      return "idle";
  }
}

export function mapCaptureErrorToScreenCaptureStatus(
  message: string,
): ScreenCaptureProbeStatus {
  return mapEnumerationErrorToScreenCaptureStatus(message);
}

export function mapGetUserMediaErrorToMicPermission(err: unknown): MicPermissionReport {
  const name = err instanceof DOMException ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "NotAllowedError" || /not allowed|permission|denied/i.test(message)) {
    return "denied";
  }
  if (name === "NotFoundError") return "error";
  return "error";
}

export function mapPermissionsApiToMic(state: PermissionState | string): MicPermissionReport {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "not_requested";
}

export function buildScreenRecordingCapability(
  input: GlassSetupCapabilitiesInput,
): GlassCapabilityRow {
  const probe = input.screenCaptureProbe;
  const captureHint = input.captureStatus ?? "";
  if (probe === "ready" && !/permission|failed/i.test(captureHint)) {
    return {
      id: "screenRecording",
      status: "ready",
      label: "Ready",
      detail: "Screen capture is available for visual ask.",
      severity: "ok",
    };
  }
  if (probe === "permission_required" || /permission|screen recording/i.test(captureHint)) {
    return {
      id: "screenRecording",
      status: "permission_required",
      label: "Permission needed",
      detail: [input.screenCaptureDetail, SCREEN_RECORDING_RESTART_HINT].filter(Boolean).join(" "),
      actionLabel: "Open Screen Recording Settings",
      actionCommand: "open-screen-recording-settings",
      severity: "warn",
    };
  }
  if (probe === "source_enumeration_failed") {
    const raw = input.screenCaptureDetail ?? "";
    const detail = isSourceEnumerationFailedMessage(raw)
      ? [SCREEN_SOURCE_ENUMERATION_USER_MESSAGE, raw].filter(Boolean).join(" ")
      : raw || SCREEN_SOURCE_ENUMERATION_USER_MESSAGE;
    return {
      id: "screenRecording",
      status: "error",
      label: "Source enumeration failed",
      detail,
      actionLabel: "Run Capture Diagnostics",
      actionCommand: "run-capture-diagnostics",
      actions: [
        { label: "Run Capture Diagnostics", command: "run-capture-diagnostics" },
        { label: "Open Screen Recording Settings", command: "open-screen-recording-settings" },
        { label: "Retry Capture", command: "retry-capture" },
      ],
      severity: "error",
    };
  }
  if (probe === "error") {
    return {
      id: "screenRecording",
      status: "error",
      label: "Capture error",
      detail: input.screenCaptureDetail,
      actionLabel: "Retry Capture",
      actionCommand: "retry-capture",
      severity: "error",
    };
  }
  return {
    id: "screenRecording",
    status: "not_requested",
    label: "Not checked",
    detail: "Run Setup Check or capture the screen to verify permission.",
    actionLabel: "Run Setup Check",
    actionCommand: "run-setup-check",
    severity: "idle",
  };
}

export function buildWindowCaptureCapability(
  input: GlassSetupCapabilitiesInput,
): GlassCapabilityRow {
  const probe = input.windowCaptureProbe ?? "unknown";
  if (probe === "ready") {
    return {
      id: "windowCapture",
      status: "ready",
      label: "Ready",
      detail: "Window sources are available for capture.",
      severity: "ok",
    };
  }
  if (probe === "permission_required") {
    return {
      id: "windowCapture",
      status: "permission_required",
      label: "Permission needed",
      detail: input.windowCaptureDetail,
      actionLabel: "Open Screen Recording Settings",
      actionCommand: "open-screen-recording-settings",
      severity: "warn",
    };
  }
  if (probe === "source_enumeration_failed") {
    return {
      id: "windowCapture",
      status: "error",
      label: "Source enumeration failed",
      detail: input.windowCaptureDetail,
      actionLabel: "Run Capture Diagnostics",
      actionCommand: "run-capture-diagnostics",
      severity: "error",
    };
  }
  if (probe === "error") {
    return {
      id: "windowCapture",
      status: "error",
      label: "Enumeration failed",
      detail: input.windowCaptureDetail,
      severity: "warn",
    };
  }
  return {
    id: "windowCapture",
    status: "not_requested",
    label: "Not checked",
    detail: "Run Setup Check to verify window source enumeration.",
    actionLabel: "Run Setup Check",
    actionCommand: "run-setup-check",
    severity: "idle",
  };
}

export function buildMicrophoneCapability(input: GlassSetupCapabilitiesInput): GlassCapabilityRow {
  const { micPermission, micListening, sttEnabled, sttStatus } = input;
  if (micListening) {
    return {
      id: "microphone",
      status: "ready",
      label: "Listening",
      detail: "Microphone is active.",
      severity: "ok",
    };
  }
  if (micPermission === "granted") {
    return {
      id: "microphone",
      status: "ready",
      label: "Mic ready",
      detail: sttEnabled ? "Microphone permission granted." : "Grant STT on the server to transcribe audio.",
      actionLabel: "Test Mic",
      actionCommand: "test-microphone",
      severity: "ok",
    };
  }
  if (micPermission === "denied") {
    return {
      id: "microphone",
      status: "permission_denied",
      label: "Permission denied",
      detail: "Microphone access was denied. Enable IIVO Glass in Microphone settings, then retry.",
      actionLabel: "Open Microphone Settings",
      actionCommand: "open-microphone-settings",
      severity: "error",
    };
  }
  if (!sttEnabled && sttStatus === "missing_key") {
    return {
      id: "microphone",
      status: "missing_config",
      label: "STT not configured",
      detail: "Configure OpenAI STT on the IIVO server before using microphone transcription.",
      severity: "warn",
    };
  }
  return {
    id: "microphone",
    status: "not_requested",
    label: "Not requested",
    detail: "Microphone permission is requested only when you start listening or tap Test Mic.",
    actionLabel: "Test Mic",
    actionCommand: "test-microphone",
    severity: "idle",
  };
}

const SYSTEM_AUDIO_RETRY_ACTIONS: GlassSetupAction[] = [
  { label: "Retry System Audio", command: "retry-system-audio" },
  { label: "Open Privacy & Security", command: "open-privacy-settings" },
  { label: "Open Audio MIDI Setup", command: "open-audio-midi-setup" },
  { label: "Virtual audio setup", command: "show-virtual-audio-help" },
];

function systemAudioActions(
  primary: GlassSetupAction,
  includeVirtual = false,
): GlassSetupAction[] {
  const extras = SYSTEM_AUDIO_RETRY_ACTIONS.filter(
    (a) => includeVirtual || a.command !== "show-virtual-audio-help",
  );
  return [primary, ...extras.filter((a) => a.command !== primary.command)];
}

export function buildSystemAudioCapability(input: GlassSetupCapabilitiesInput): GlassCapabilityRow {
  const status = input.systemAudioStatus;
  const screenReady = input.screenCaptureProbe === "ready";
  if (status === "available") {
    return {
      id: "systemAudio",
      status: "ready",
      label: "System audio ready",
      detail: input.systemAudioDetail ?? "Native loopback capture is available.",
      severity: "ok",
    };
  }
  if (status === "not_tested") {
    return {
      id: "systemAudio",
      status: "not_requested",
      label: "Not verified",
      detail:
        input.systemAudioDetail ??
        "Screen sources enumerated. Tap Retry System Audio to verify loopback.",
      actionLabel: "Retry System Audio",
      actionCommand: "retry-system-audio",
      actions: systemAudioActions({ label: "Retry System Audio", command: "retry-system-audio" }),
      severity: "idle",
    };
  }
  if (status === "requires_permission") {
    const detail = [input.systemAudioDetail, PERMISSION_JUST_GRANTED_RESTART_HINT]
      .filter(Boolean)
      .join(" ");
    return {
      id: "systemAudio",
      status: "permission_required",
      label: "Permission needed",
      detail: detail || systemAudioStatusMessage("requires_permission"),
      actionLabel: "Open Privacy & Security",
      actionCommand: "open-privacy-settings",
      actions: systemAudioActions(
        { label: "Open Privacy & Security", command: "open-privacy-settings" },
      ),
      severity: "warn",
    };
  }
  if (status === "source_enumeration_failed") {
    const raw = input.systemAudioDetail ?? systemAudioStatusMessage("source_enumeration_failed");
    const detail = screenReady
      ? raw
      : isSourceEnumerationFailedMessage(raw)
        ? [SCREEN_SOURCE_ENUMERATION_USER_MESSAGE, raw].filter(Boolean).join(" ")
        : raw;
    return {
      id: "systemAudio",
      status: "error",
      label: "Source enumeration failed",
      detail,
      actionLabel: "Retry System Audio",
      actionCommand: "retry-system-audio",
      actions: systemAudioActions({ label: "Retry System Audio", command: "retry-system-audio" }),
      severity: screenReady ? "warn" : "error",
    };
  }
  if (status === "requires_virtual_device") {
    const detail = shouldShowVirtualDeviceGuidance(status, screenReady)
      ? [input.systemAudioDetail, VIRTUAL_AUDIO_HELP_DETAIL].filter(Boolean).join(" ")
      : (input.systemAudioDetail ?? VIRTUAL_AUDIO_HELP_DETAIL);
    return {
      id: "systemAudio",
      status: "requires_virtual_device",
      label: "Virtual device may be required",
      detail,
      actionLabel: "Virtual audio setup",
      actionCommand: "show-virtual-audio-help",
      actions: systemAudioActions(
        { label: "Virtual audio setup", command: "show-virtual-audio-help" },
        true,
      ),
      severity: "warn",
    };
  }
  if (status === "unsupported") {
    return {
      id: "systemAudio",
      status: "unsupported",
      label: "Unsupported",
      detail: systemAudioStatusMessage("unsupported", input.systemAudioDetail),
      severity: "error",
    };
  }
  if (status === "error") {
    return {
      id: "systemAudio",
      status: "error",
      label: "Failed",
      detail: input.systemAudioDetail ?? systemAudioStatusMessage("error"),
      actionLabel: "Retry System Audio",
      actionCommand: "retry-system-audio",
      actions: systemAudioActions({ label: "Retry System Audio", command: "retry-system-audio" }),
      severity: "error",
    };
  }
  return {
    id: "systemAudio",
    status: "not_requested",
    label: "Not tested",
    detail: "Choose System Audio and tap Test System Audio when you want to verify loopback.",
    actionLabel: "Test System Audio",
    actionCommand: "test-system-audio",
    actions: systemAudioActions({ label: "Test System Audio", command: "test-system-audio" }),
    severity: "idle",
  };
}

export function buildVisionCapability(
  health: GlassServerHealthForSetup | null,
): GlassCapabilityRow {
  if (!health?.reachable) {
    return {
      id: "vision",
      status: "error",
      label: "Unknown",
      detail: "Start the IIVO server to check vision status.",
      severity: "error",
    };
  }
  const vision = health.vision;
  if (!vision?.enabled) {
    return {
      id: "vision",
      status: "missing_config",
      label: "Disabled",
      detail: vision?.reason ?? "Vision is not enabled on the IIVO server (IMAGE_VISION_ENABLED).",
      severity: "warn",
    };
  }
  if (!vision.configured) {
    return {
      id: "vision",
      status: "missing_config",
      label: "Missing config",
      detail: vision.reason ?? "Set IMAGE_VISION_ENABLED and OpenAI API key on the server.",
      severity: "warn",
    };
  }
  return {
    id: "vision",
    status: "configured",
    label: "Ready",
    detail: "Server vision is enabled and configured.",
    severity: "ok",
  };
}

export function buildSttCapability(
  health: GlassServerHealthForSetup | null,
  sttStatus: SttProviderStatus,
  sttEnabled: boolean,
): GlassCapabilityRow {
  if (!health?.reachable) {
    return {
      id: "stt",
      status: "error",
      label: "Unknown",
      detail: "Start the IIVO server to check STT status.",
      severity: "error",
    };
  }
  if (!sttEnabled) {
    return {
      id: "stt",
      status: "missing_config",
      label: "Disabled",
      detail: "STT is disabled in Glass settings.",
      severity: "warn",
    };
  }
  const serverStt = health.stt;
  if (serverStt && !serverStt.configured) {
    return {
      id: "stt",
      status: "missing_config",
      label: "Missing key",
      detail: serverStt.reason ?? "OpenAI API key is not configured on the IIVO server.",
      severity: "warn",
    };
  }
  if (sttStatus === "server_unavailable") {
    return {
      id: "stt",
      status: "error",
      label: "Server unavailable",
      detail: "IIVO transcription endpoint is not reachable.",
      severity: "error",
    };
  }
  if (sttStatus === "missing_key") {
    return {
      id: "stt",
      status: "missing_config",
      label: "Missing key",
      detail: "Configure OpenAI for Glass direct STT or use the IIVO server endpoint.",
      severity: "warn",
    };
  }
  if (sttStatus === "configured") {
    return {
      id: "stt",
      status: "configured",
      label: "Ready",
      detail: "STT is configured (server-side key present; value never shown in Glass).",
      severity: "ok",
    };
  }
  return {
    id: "stt",
    status: sttStatus === "disabled" ? "missing_config" : "error",
    label: sttStatus === "disabled" ? "Disabled" : "Error",
    detail: health.stt?.reason,
    severity: sttStatus === "disabled" ? "warn" : "error",
  };
}

export function buildServerCapability(
  health: GlassServerHealthForSetup | null,
  lastError?: string,
): GlassCapabilityRow {
  const offline = /fetch|network|econnrefused|unavailable|failed to reach|cannot connect/i.test(
    lastError ?? "",
  );
  if (!health?.reachable || offline) {
    return {
      id: "server",
      status: "error",
      label: "Offline",
      detail: lastError ?? "IIVO server unavailable. Run npm run dev from the project root.",
      severity: "error",
    };
  }
  return {
    id: "server",
    status: "ready",
    label: "Online",
    detail: "IIVO API is reachable.",
    severity: "ok",
  };
}

export function buildGlassSetupCapabilities(
  input: GlassSetupCapabilitiesInput,
): GlassCapabilityRow[] {
  return [
    buildScreenRecordingCapability(input),
    buildWindowCaptureCapability(input),
    buildMicrophoneCapability(input),
    buildSystemAudioCapability(input),
    buildVisionCapability(input.serverHealth),
    buildSttCapability(input.serverHealth, input.sttStatus, input.sttEnabled),
    buildServerCapability(input.serverHealth, input.lastError),
  ];
}

/** Map setup rows into panel status grid hints for capture/audio/permissions. */
export function captureStatusFromSetup(rows: GlassCapabilityRow[]): string {
  const row = rows.find((r) => r.id === "screenRecording");
  if (!row) return "idle";
  if (row.status === "ready") return "Ready";
  if (row.status === "permission_required") return "permission_needed";
  if (row.status === "permission_denied") return "permission_denied";
  if (row.status === "error") return "failed";
  return row.label;
}

export function permissionsSummaryFromSetup(rows: GlassCapabilityRow[]): {
  level: GlassCapabilitySeverity;
  status: string;
} {
  const needed: string[] = [];
  const screen = rows.find((r) => r.id === "screenRecording");
  const mic = rows.find((r) => r.id === "microphone");
  const sys = rows.find((r) => r.id === "systemAudio");
  if (screen?.status === "permission_required") needed.push("Screen Recording");
  if (mic?.status === "permission_denied" || mic?.status === "permission_required") {
    needed.push("Microphone");
  }
  if (sys?.status === "requires_virtual_device") needed.push("Virtual audio");
  if (sys?.status === "error" && sys.label === "Source enumeration failed" && screen?.status !== "ready") {
    needed.push("System audio");
  }
  const win = rows.find((r) => r.id === "windowCapture");
  if (win?.label === "Source enumeration failed" && screen?.status !== "ready") {
    needed.push("Window capture");
  }
  if (sys?.status === "permission_required" && !needed.includes("Screen Recording")) {
    needed.push("Screen Recording");
  }
  if (needed.length === 0) {
    return { level: "ok", status: "OK" };
  }
  return { level: "warn", status: `${needed.join(", ")} needed` };
}

export function formatSetupCheckSummary(rows: GlassCapabilityRow[]): string {
  const issues = rows.filter((r) => {
    if (r.severity !== "warn" && r.severity !== "error") return false;
    if (r.id === "systemAudio" && r.label === "Not verified") return false;
    return true;
  });
  const screen = rows.find((r) => r.id === "screenRecording");
  const sys = rows.find((r) => r.id === "systemAudio");
  if (
    screen?.status === "ready" &&
    sys &&
    (sys.label === "Source enumeration failed" || sys.status === "requires_virtual_device")
  ) {
    const parts = [`screenRecording (${screen.label})`, `systemAudio (${sys.label})`];
    const other = issues.filter((r) => r.id !== "screenRecording" && r.id !== "systemAudio");
    for (const row of other) {
      parts.push(`${row.id} (${row.label})`);
    }
    return `Setup check: ${parts.join(", ")}. Capture can still work when only system audio fails.`;
  }
  if (issues.length === 0) {
    return "Setup check complete — all capabilities look ready.";
  }
  return `Setup check: ${issues.map((r) => `${r.id} (${r.label})`).join(", ")}`;
}
