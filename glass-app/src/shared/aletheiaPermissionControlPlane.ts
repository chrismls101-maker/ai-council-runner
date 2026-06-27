/**
 * Aletheia Permission & Authority Control Plane (P0.4 Binding).
 *
 * Live instrumentation over OS permissions + Layer 2 consent flags.
 * Pure logic — no Electron imports.
 */

import type { GlassConsentSnapshot } from "./glassConsentGates.ts";
import {
  canActivateListenCapture,
  canActivateMicRecording,
  canActivateScreenCapture,
  canActivateSystemAudioRecording,
} from "./glassConsentGates.ts";
import type { ActionKind } from "./aletheiaExecution.ts";
import type { GlassCapabilityRow } from "./glassCapabilities.ts";
import type { MicPermissionReport } from "./glassCapabilities.ts";
import type { SystemAudioStatus } from "./systemAudioTypes.ts";

export type PermissionDomainId =
  | "microphone"
  | "screenCapture"
  | "systemAudio"
  | "accessibility"
  | "automation"
  | "fileWrite"
  | "consentMic"
  | "consentScreen"
  | "consentRecording"
  | "consentTos";

export type PermissionOperationalStatus =
  | "ready"
  | "blocked"
  | "missing_consent"
  | "missing_os_permission"
  | "degraded"
  | "unknown";

export type AletheiaAuthorityTier = "full" | "voice_and_read" | "observe_only" | "restricted";

export interface PermissionDomainRow {
  id: PermissionDomainId;
  label: string;
  status: PermissionOperationalStatus;
  osGranted: boolean | null;
  consentGranted: boolean | null;
  whyNeeded: string;
  withoutIt: string;
  withIt: string;
}

export interface AletheiaPermissionControlPlaneSnapshot {
  updatedAt: number;
  authorityTier: AletheiaAuthorityTier;
  degraded: boolean;
  degradedSummary: string | null;
  domains: PermissionDomainRow[];
}

export interface PermissionPlaneInput {
  consent: GlassConsentSnapshot | null | undefined;
  micPermission: MicPermissionReport;
  micListening?: boolean;
  screenCaptureReady: boolean;
  systemAudioStatus: SystemAudioStatus;
  accessibilityGranted: boolean | null;
  setupCapabilities?: GlassCapabilityRow[];
}

export interface PermissionRevocationEvent {
  domain: PermissionDomainId;
  label: string;
  narration: string;
}

const DOMAIN_COPY: Record<
  PermissionDomainId,
  Pick<PermissionDomainRow, "label" | "whyNeeded" | "withoutIt" | "withIt">
> = {
  microphone: {
    label: "Microphone",
    whyNeeded: "Aletheia listens when you activate companion mode or use voice commands.",
    withoutIt: "She cannot hear you or run live transcription.",
    withIt: "Voice sessions, companion mode, and mic-based listen modes work.",
  },
  screenCapture: {
    label: "Screen capture",
    whyNeeded: "Visual ask and screen context need to see what is on your display.",
    withoutIt: "She cannot read your screen or answer visual questions.",
    withIt: "Visual ask, Lens, and screen-aware guidance are available.",
  },
  systemAudio: {
    label: "System audio",
    whyNeeded: "Meeting and loopback modes capture audio from other apps.",
    withoutIt: "She cannot hear meetings or system audio — mic-only modes still work.",
    withIt: "Listen mode and system-audio capture can run when you opt in.",
  },
  accessibility: {
    label: "Accessibility",
    whyNeeded: "Computer control and front-app awareness use macOS Accessibility APIs.",
    withoutIt: "She cannot reliably focus apps, read UI structure, or automate controls.",
    withIt: "Delegated presence and computer-use routing can target native apps.",
  },
  automation: {
    label: "Input automation",
    whyNeeded: "Typing into apps and confirmed write actions use automation permissions.",
    withoutIt: "She can advise but cannot type or confirm keystroke actions.",
    withIt: "Approved keystroke and computer-use actions can execute after confirmation.",
  },
  fileWrite: {
    label: "File write scope",
    whyNeeded: "Saving output files stays within your home folder and /tmp by policy.",
    withoutIt: "She cannot write files outside the safe scope.",
    withIt: "Confirmed file writes to allowed paths can execute.",
  },
  consentMic: {
    label: "Mic consent",
    whyNeeded: "You explicitly agreed Aletheia may use the microphone.",
    withoutIt: "Companion and mic capture stay blocked even if macOS allows access.",
    withIt: "Mic-based features can activate after OS permission is granted.",
  },
  consentScreen: {
    label: "Screen consent",
    whyNeeded: "You agreed Aletheia may capture screen content for visual features.",
    withoutIt: "Screen capture and visual ask stay blocked.",
    withIt: "Screen-aware features can run after OS screen permission is granted.",
  },
  consentRecording: {
    label: "Recording consent",
    whyNeeded: "You agreed Aletheia may record system/meeting audio when you choose those modes.",
    withoutIt: "System-audio listen modes stay blocked.",
    withIt: "Meeting and loopback capture can activate when configured.",
  },
  consentTos: {
    label: "Terms accepted",
    whyNeeded: "Terms acceptance is required before any recording capability activates.",
    withoutIt: "All recording paths remain blocked.",
    withIt: "Consent-gated recording features can proceed when OS permissions allow.",
  },
};

function row(
  id: PermissionDomainId,
  status: PermissionOperationalStatus,
  osGranted: boolean | null,
  consentGranted: boolean | null,
): PermissionDomainRow {
  const copy = DOMAIN_COPY[id];
  return { id, status, osGranted, consentGranted, ...copy };
}

function micOsGranted(micPermission: MicPermissionReport, micListening?: boolean): boolean | null {
  if (micListening) return true;
  if (micPermission === "granted") return true;
  if (micPermission === "denied") return false;
  return null;
}

function systemAudioOsReady(status: SystemAudioStatus): boolean | null {
  if (status === "available") return true;
  if (status === "requires_permission" || status === "unsupported") return false;
  return null;
}

export function buildAletheiaPermissionControlPlane(
  input: PermissionPlaneInput,
  now = Date.now(),
): AletheiaPermissionControlPlaneSnapshot {
  const consent = input.consent ?? {};
  const micOs = micOsGranted(input.micPermission, input.micListening);
  const micConsent = consent.micAck === true;
  const tos = consent.tosAck === true;
  const screenConsent = consent.screenAck === true;
  const recordingConsent = consent.recordingAck === true;

  const micReady = canActivateMicRecording(consent) && micOs === true;
  const screenReady = canActivateScreenCapture(consent) && input.screenCaptureReady;
  const sysAudioReady =
    canActivateSystemAudioRecording(consent) && systemAudioOsReady(input.systemAudioStatus) === true;
  const accessibilityReady = input.accessibilityGranted === true;
  const automationReady = accessibilityReady;

  const domains: PermissionDomainRow[] = [
    row(
      "consentTos",
      tos ? "ready" : "missing_consent",
      null,
      tos,
    ),
    row(
      "consentMic",
      micConsent && tos ? "ready" : "missing_consent",
      null,
      micConsent,
    ),
    row(
      "microphone",
      micReady ? "ready" : micOs === false ? "missing_os_permission" : !micConsent || !tos ? "missing_consent" : "unknown",
      micOs,
      micConsent && tos,
    ),
    row(
      "consentScreen",
      screenConsent && tos ? "ready" : "missing_consent",
      null,
      screenConsent,
    ),
    row(
      "screenCapture",
      screenReady
        ? "ready"
        : !input.screenCaptureReady
          ? "missing_os_permission"
          : !screenConsent || !tos
            ? "missing_consent"
            : "unknown",
      input.screenCaptureReady,
      screenConsent && tos,
    ),
    row(
      "consentRecording",
      recordingConsent && tos ? "ready" : "missing_consent",
      null,
      recordingConsent,
    ),
    row(
      "systemAudio",
      sysAudioReady
        ? "ready"
        : systemAudioOsReady(input.systemAudioStatus) === false
          ? "missing_os_permission"
          : !recordingConsent || !tos
            ? "missing_consent"
            : "degraded",
      systemAudioOsReady(input.systemAudioStatus),
      recordingConsent && tos,
    ),
    row(
      "accessibility",
      accessibilityReady
        ? "ready"
        : input.accessibilityGranted === false
          ? "missing_os_permission"
          : "unknown",
      input.accessibilityGranted,
      null,
    ),
    row(
      "automation",
      automationReady
        ? "ready"
        : input.accessibilityGranted === false
          ? "blocked"
          : "unknown",
      input.accessibilityGranted,
      null,
    ),
    row("fileWrite", "ready", true, null),
  ];

  let authorityTier: AletheiaAuthorityTier = "restricted";
  if (micReady && screenReady && automationReady) {
    authorityTier = "full";
  } else if (micReady && screenReady) {
    authorityTier = "voice_and_read";
  } else if (micReady || input.screenCaptureReady) {
    authorityTier = "observe_only";
  }

  const blocked = domains.filter(
    (d) =>
      d.status === "blocked"
      || d.status === "missing_consent"
      || d.status === "missing_os_permission"
      || d.status === "degraded",
  );
  const degraded = blocked.length > 0;
  const degradedSummary = degraded
    ? blocked
        .slice(0, 3)
        .map((d) => `${d.label}: ${humanStatus(d.status)}`)
        .join(" · ")
    : null;

  return {
    updatedAt: now,
    authorityTier,
    degraded,
    degradedSummary,
    domains,
  };
}

function humanStatus(status: PermissionOperationalStatus): string {
  switch (status) {
    case "ready":
      return "ready";
    case "missing_consent":
      return "consent required";
    case "missing_os_permission":
      return "OS permission required";
    case "blocked":
      return "blocked";
    case "degraded":
      return "degraded";
    default:
      return "unknown";
  }
}

export function detectPermissionRevocations(
  previous: AletheiaPermissionControlPlaneSnapshot | undefined,
  current: AletheiaPermissionControlPlaneSnapshot,
): PermissionRevocationEvent[] {
  if (!previous) return [];
  const events: PermissionRevocationEvent[] = [];
  for (const now of current.domains) {
    const was = previous.domains.find((d) => d.id === now.id);
    if (!was) continue;
    const osRevoked = was.osGranted === true && now.osGranted === false;
    const consentRevoked = was.consentGranted === true && now.consentGranted === false;
    const readyLost = was.status === "ready" && now.status !== "ready";
    if (!osRevoked && !consentRevoked && !readyLost) continue;
    const reason = consentRevoked
      ? "consent was withdrawn"
      : osRevoked
        ? "macOS permission was revoked"
        : "capability is no longer available";
    events.push({
      domain: now.id,
      label: now.label,
      narration: `Aletheia lost ${now.label.toLowerCase()} — ${reason}. ${now.withoutIt}`,
    });
  }
  return events;
}

export function requiredDomainsForAction(kind: ActionKind): PermissionDomainId[] {
  switch (kind) {
    case "file-write":
    case "file-apply":
      return ["fileWrite", "consentTos"];
    case "keystroke":
      return ["automation", "accessibility", "consentTos"];
    case "shell":
      return ["consentTos"];
    default:
      return ["consentTos"];
  }
}

export function canExecuteActionOnPermissionPlane(
  kind: ActionKind,
  plane: AletheiaPermissionControlPlaneSnapshot | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!plane) return { ok: true };
  const required = requiredDomainsForAction(kind);
  for (const id of required) {
    const domain = plane.domains.find((d) => d.id === id);
    if (!domain) continue;
    if (domain.status !== "ready") {
      return {
        ok: false,
        reason: `Blocked — ${domain.label} is not ready (${humanStatus(domain.status)}). ${domain.withoutIt}`,
      };
    }
  }
  return { ok: true };
}

export function permissionPlaneBlocksCompanion(
  plane: AletheiaPermissionControlPlaneSnapshot | undefined,
): string | null {
  if (!plane) {
    return "Permission status still loading — wait a moment and try again.";
  }
  const mic = plane.domains.find((d) => d.id === "microphone");
  if (mic?.status === "ready") return null;
  return mic?.withoutIt ?? "Microphone is not available for companion mode.";
}

/** Returns true when permission plane unchanged — skip redundant IPC push. */
export function permissionSnapshotsEqual(
  previous: AletheiaPermissionControlPlaneSnapshot | undefined,
  current: AletheiaPermissionControlPlaneSnapshot,
): boolean {
  if (!previous) return false;
  if (
    previous.authorityTier !== current.authorityTier
    || previous.degraded !== current.degraded
    || previous.degradedSummary !== current.degradedSummary
  ) {
    return false;
  }
  if (previous.domains.length !== current.domains.length) return false;
  return previous.domains.every((row, index) => {
    const next = current.domains[index];
    if (!next || row.id !== next.id) return false;
    return row.status === next.status && row.osGranted === next.osGranted && row.consentGranted === next.consentGranted;
  });
}

export function permissionPlaneBlocksListenMode(
  plane: AletheiaPermissionControlPlaneSnapshot | undefined,
  mode: string | undefined,
): string | null {
  if (!plane) return null;
  if (mode === "system_audio") {
    const row = plane.domains.find((d) => d.id === "systemAudio");
    if (row?.status === "ready") return null;
    return row?.withoutIt ?? "System audio capture is not available.";
  }
  return permissionPlaneBlocksCompanion(plane);
}

/** Re-export consent helpers for callers that need mode-specific checks. */
export {
  canActivateListenCapture,
  canActivateMicRecording,
  canActivateScreenCapture,
  canActivateSystemAudioRecording,
};
