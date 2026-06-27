/**
 * Aletheia Observation Signals (B1.1 — Sensing Layer).
 *
 * Pure logic for passive vs active observation instrumentation.
 * No Electron imports.
 */

import type {
  AletheiaPermissionControlPlaneSnapshot,
  PermissionDomainId,
  PermissionOperationalStatus,
} from "./aletheiaPermissionControlPlane.ts";

export type ObservationMode =
  | "idle"
  | "passive"
  | "companion_active"
  | "companion_privacy";

export type ObservationSignalId = "microphone" | "screen" | "clipboard";

export type ObservationSignalStatus =
  | "off"
  | "idle"
  | "active"
  | "blocked"
  | "degraded";

export interface ObservationSignalRow {
  id: ObservationSignalId;
  label: string;
  status: ObservationSignalStatus;
  detail: string;
  permissionDomainId?: PermissionDomainId;
  permissionStatus?: PermissionOperationalStatus;
  permissionLabel?: string;
}

export interface AletheiaObservationSnapshot {
  updatedAt: number;
  mode: ObservationMode;
  modeLabel: string;
  modeDetail: string;
  /** Distinguishes passive sensing from active companion engagement. */
  engagementNote: string;
  signals: ObservationSignalRow[];
  sessionId: string | null;
  /** Rows persisted for the current session (when sessionId is set). */
  sessionSnapshotCount: number;
}

export interface ObservationPlaneInput {
  now?: number;
  companionModeActive: boolean;
  companionPrivacyActive: boolean;
  micListening: boolean;
  micCapturing: boolean;
  companionMicActive: boolean;
  screenCaptureReady: boolean;
  screenDigestFresh: boolean;
  screenDigestAgeMs: number | null;
  clipboardMonitored: boolean;
  clipboardHasContent: boolean;
  clipboardTruncated?: boolean;
  permissionPlane?: AletheiaPermissionControlPlaneSnapshot | null;
  sessionId: string | null;
  sessionSnapshotCount?: number;
}

const MODE_COPY: Record<
  ObservationMode,
  Pick<AletheiaObservationSnapshot, "modeLabel" | "modeDetail" | "engagementNote">
> = {
  idle: {
    modeLabel: "Idle",
    modeDetail: "No observation signals are active.",
    engagementNote: "Aletheia is not sensing your environment.",
  },
  passive: {
    modeLabel: "Passive observation",
    modeDetail: "Glass senses quietly — Aletheia is not speaking.",
    engagementNote:
      "Passive sensing runs in the background. Activate companion mode when you want Aletheia to listen and respond.",
  },
  companion_active: {
    modeLabel: "Companion active",
    modeDetail: "Aletheia is engaged — voice and context synthesis are live.",
    engagementNote:
      "This is active companion mode, not passive observation. Aletheia may speak and act on your behalf.",
  },
  companion_privacy: {
    modeLabel: "Privacy pause",
    modeDetail: "Companion voice is paused — passive sensing may still run.",
    engagementNote:
      "Aletheia will stay silent until privacy ends. Screen and clipboard loops may continue passively.",
  },
};

function domainRow(
  plane: AletheiaPermissionControlPlaneSnapshot | null | undefined,
  id: PermissionDomainId,
) {
  return plane?.domains.find((row) => row.id === id);
}

function permissionBlocked(status: PermissionOperationalStatus | undefined): boolean {
  return (
    status === "blocked"
    || status === "missing_consent"
    || status === "missing_os_permission"
  );
}

function formatAgeMs(ageMs: number | null): string {
  if (ageMs == null) return "";
  if (ageMs < 5_000) return "just now";
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function buildMicrophoneSignal(input: ObservationPlaneInput): ObservationSignalRow {
  const micDomain = domainRow(input.permissionPlane, "microphone");
  const permissionStatus = micDomain?.status;
  const permissionLabel = micDomain?.label ?? "Microphone";

  if (permissionBlocked(permissionStatus)) {
    return {
      id: "microphone",
      label: "Microphone",
      status: "blocked",
      detail: micDomain?.withoutIt ?? "Microphone access is blocked.",
      permissionDomainId: "microphone",
      permissionStatus,
      permissionLabel,
    };
  }

  if (permissionStatus === "degraded" || permissionStatus === "unknown") {
    return {
      id: "microphone",
      label: "Microphone",
      status: "degraded",
      detail: micDomain?.withoutIt ?? "Microphone status is uncertain.",
      permissionDomainId: "microphone",
      permissionStatus,
      permissionLabel,
    };
  }

  if (input.companionMicActive || input.micListening || input.micCapturing) {
    const via = input.companionMicActive
      ? "Companion voice session"
      : input.micCapturing
        ? "Capture in progress"
        : "Listen mode";
    return {
      id: "microphone",
      label: "Microphone",
      status: "active",
      detail: `${via} — audio is being captured.`,
      permissionDomainId: "microphone",
      permissionStatus,
      permissionLabel,
    };
  }

  return {
    id: "microphone",
    label: "Microphone",
    status: "idle",
    detail: "Ready — not capturing until you activate listen or companion mode.",
    permissionDomainId: "microphone",
    permissionStatus,
    permissionLabel,
  };
}

function buildScreenSignal(input: ObservationPlaneInput): ObservationSignalRow {
  const screenDomain = domainRow(input.permissionPlane, "screenCapture");
  const permissionStatus = screenDomain?.status;
  const permissionLabel = screenDomain?.label ?? "Screen capture";

  if (!input.screenCaptureReady || permissionBlocked(permissionStatus)) {
    return {
      id: "screen",
      label: "Screen",
      status: "blocked",
      detail: screenDomain?.withoutIt ?? "Screen capture is not available.",
      permissionDomainId: "screenCapture",
      permissionStatus,
      permissionLabel,
    };
  }

  if (input.screenDigestFresh) {
    const age = formatAgeMs(input.screenDigestAgeMs);
    return {
      id: "screen",
      label: "Screen",
      status: "active",
      detail: age
        ? `Passive digest fresh — last read ${age}.`
        : "Passive digest fresh — screen context available.",
      permissionDomainId: "screenCapture",
      permissionStatus,
      permissionLabel,
    };
  }

  return {
    id: "screen",
    label: "Screen",
    status: "idle",
    detail: "Digest loop armed — waiting for the next passive screen read.",
    permissionDomainId: "screenCapture",
    permissionStatus,
    permissionLabel,
  };
}

function buildClipboardSignal(input: ObservationPlaneInput): ObservationSignalRow {
  if (!input.clipboardMonitored) {
    return {
      id: "clipboard",
      label: "Clipboard",
      status: "off",
      detail: "Clipboard monitoring is not running.",
    };
  }

  if (input.clipboardHasContent) {
    return {
      id: "clipboard",
      label: "Clipboard",
      status: "active",
      detail: input.clipboardTruncated
        ? "Large clipboard capture truncated — first 500 chars available for context."
        : "Clipboard text available for context — monitored passively.",
    };
  }

  return {
    id: "clipboard",
    label: "Clipboard",
    status: "idle",
    detail: "Monitored passively — no recent clipboard text.",
  };
}

function resolveMode(
  input: ObservationPlaneInput,
  signals: ObservationSignalRow[],
): ObservationMode {
  if (input.companionPrivacyActive) return "companion_privacy";
  if (input.companionModeActive) return "companion_active";

  const passiveActive = signals.some(
    (row) =>
      row.status === "active"
      && (row.id === "screen" || row.id === "clipboard" || row.id === "microphone"),
  );
  const screenArmed = signals.some(
    (row) =>
      row.id === "screen"
      && (row.status === "idle" || row.status === "active"),
  );

  if (passiveActive || screenArmed) return "passive";
  return "idle";
}

export function buildAletheiaObservationSnapshot(
  input: ObservationPlaneInput,
): AletheiaObservationSnapshot {
  const now = input.now ?? Date.now();
  const signals = [
    buildMicrophoneSignal(input),
    buildScreenSignal(input),
    buildClipboardSignal(input),
  ];
  const mode = resolveMode(input, signals);
  const copy = MODE_COPY[mode];

  return {
    updatedAt: now,
    mode,
    modeLabel: copy.modeLabel,
    modeDetail: copy.modeDetail,
    engagementNote: copy.engagementNote,
    signals,
    sessionId: input.sessionId,
    sessionSnapshotCount: input.sessionSnapshotCount ?? 0,
  };
}

export function observationSignalStatusLabel(status: ObservationSignalStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "idle":
      return "Idle";
    case "blocked":
      return "Blocked";
    case "degraded":
      return "Degraded";
    case "off":
      return "Off";
    default:
      return "Unknown";
  }
}

export function observationSnapshotsEqual(
  a: AletheiaObservationSnapshot | null | undefined,
  b: AletheiaObservationSnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.mode !== b.mode) return false;
  if (a.signals.length !== b.signals.length) return false;
  for (let i = 0; i < a.signals.length; i += 1) {
    if (a.signals[i].id !== b.signals[i].id) return false;
    if (a.signals[i].status !== b.signals[i].status) return false;
  }
  return true;
}

export function observationSnapshotPersistKey(snapshot: AletheiaObservationSnapshot): string {
  return `${snapshot.mode}:${snapshot.signals.map((row) => `${row.id}=${row.status}`).join(",")}`;
}
