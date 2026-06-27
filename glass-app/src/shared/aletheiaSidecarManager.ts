/**
 * Aletheia Sidecar / Runtime Manager (P0.3 Body).
 *
 * Supervises Aletheia-dependent local services with health checks, backoff restarts,
 * and degraded-mode narration. Pure logic — no Electron imports.
 */

export type SidecarServiceId = "omniparser" | "stt" | "observation";

export type SidecarServiceStatus =
  | "healthy"
  | "degraded"
  | "failed"
  | "starting"
  | "disabled"
  | "not_installed";

export interface SidecarServiceProbeInput {
  id: SidecarServiceId;
  status: SidecarServiceStatus;
  detail?: string;
  restartCount?: number;
  lastRestartAt?: number;
  healthIntervalMs?: number;
}

export interface SidecarServiceRow {
  id: SidecarServiceId;
  label: string;
  status: SidecarServiceStatus;
  critical: boolean;
  detail: string;
  whyNeeded: string;
  withoutIt: string;
  withIt: string;
  lastCheckAt: number;
  restartCount: number;
  lastRestartAt: number | null;
  healthIntervalMs: number;
}

export interface AletheiaSidecarManagerSnapshot {
  updatedAt: number;
  bootReady: boolean;
  degraded: boolean;
  degradedSummary: string | null;
  services: SidecarServiceRow[];
}

export interface SidecarDegradationEvent {
  serviceId: SidecarServiceId;
  label: string;
  narration: string;
}

const SERVICE_COPY: Record<
  SidecarServiceId,
  Pick<SidecarServiceRow, "label" | "whyNeeded" | "withoutIt" | "withIt" | "critical" | "healthIntervalMs">
> = {
  omniparser: {
    label: "OmniParser vision",
    critical: false,
    healthIntervalMs: 15_000,
    whyNeeded: "Adds Set-of-Marks UI detection when Accessibility and DOM are sparse.",
    withoutIt: "She still guides with AX, DOM, and vision — sparse native UIs may be harder.",
    withIt: "Computer-use can click vision marks when the accessibility tree is incomplete.",
  },
  stt: {
    label: "Live transcription",
    critical: true,
    healthIntervalMs: 10_000,
    whyNeeded: "Companion mode listens through streaming speech-to-text.",
    withoutIt: "She cannot hear live commands until transcription is online.",
    withIt: "Voice sessions and companion listening work in real time.",
  },
  observation: {
    label: "Screen observation",
    critical: false,
    healthIntervalMs: 20_000,
    whyNeeded: "Passive screen context and visual ask need display capture.",
    withoutIt: "She can still listen and advise from mic context only.",
    withIt: "Visual ask, screen-aware guidance, and observation signals are available.",
  },
};

const DEFAULT_HEALTH_INTERVAL_MS = 15_000;

export function computeSidecarRestartBackoffMs(
  restartCount: number,
  baseMs = 2_000,
  maxMs = 60_000,
): number {
  const attempt = Math.max(1, restartCount);
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1));
}

export function shouldAttemptSidecarRestart(input: {
  status: SidecarServiceStatus;
  restartCount: number;
  lastRestartAt: number | null;
  now?: number;
  maxRestarts?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const maxRestarts = input.maxRestarts ?? 5;
  if (input.restartCount >= maxRestarts) return false;
  if (input.status === "disabled" || input.status === "not_installed") return false;
  if (input.status !== "failed" && input.status !== "degraded") return false;
  if (input.lastRestartAt == null) return true;
  const backoff = computeSidecarRestartBackoffMs(input.restartCount + 1);
  return now - input.lastRestartAt >= backoff;
}

export function buildAletheiaSidecarManagerSnapshot(
  probes: SidecarServiceProbeInput[],
  now = Date.now(),
): AletheiaSidecarManagerSnapshot {
  const services: SidecarServiceRow[] = probes.map((probe) => {
    const copy = SERVICE_COPY[probe.id];
    return {
      id: probe.id,
      label: copy.label,
      status: probe.status,
      critical: copy.critical,
      detail: probe.detail?.trim() || statusDetail(probe.status),
      whyNeeded: copy.whyNeeded,
      withoutIt: copy.withoutIt,
      withIt: copy.withIt,
      lastCheckAt: now,
      restartCount: probe.restartCount ?? 0,
      lastRestartAt: probe.lastRestartAt ?? null,
      healthIntervalMs: probe.healthIntervalMs ?? copy.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS,
    };
  });

  const criticalFailed = services.some((s) => s.critical && (s.status === "failed" || s.status === "not_installed"));
  const anyDegraded = services.some((s) => s.status === "degraded" || s.status === "failed" || s.status === "starting");
  const bootReady = !criticalFailed;

  let degradedSummary: string | null = null;
  if (criticalFailed) {
    const failed = services.filter((s) => s.critical && (s.status === "failed" || s.status === "not_installed"));
    degradedSummary = `${failed.map((s) => s.label).join(" and ")} offline — companion cannot start until recovered.`;
  } else if (anyDegraded) {
    const names = services
      .filter((s) => s.status !== "healthy" && s.status !== "disabled")
      .map((s) => s.label.toLowerCase());
    degradedSummary = names.length
      ? `Some services are limited (${names.join(", ")}). Aletheia will narrate what still works.`
      : null;
  }

  return {
    updatedAt: now,
    bootReady,
    degraded: !bootReady || anyDegraded,
    degradedSummary,
    services,
  };
}

function statusDetail(status: SidecarServiceStatus): string {
  switch (status) {
    case "healthy":
      return "Online";
    case "degraded":
      return "Degraded";
    case "failed":
      return "Offline";
    case "starting":
      return "Starting…";
    case "disabled":
      return "Disabled";
    case "not_installed":
      return "Not installed";
    default:
      return "Unknown";
  }
}

export function detectSidecarDegradation(
  previous: AletheiaSidecarManagerSnapshot | undefined,
  current: AletheiaSidecarManagerSnapshot,
): SidecarDegradationEvent[] {
  if (!previous) return [];
  const events: SidecarDegradationEvent[] = [];
  for (const row of current.services) {
    const prev = previous.services.find((s) => s.id === row.id);
    if (!prev) continue;
    const wasOk = prev.status === "healthy" || prev.status === "disabled";
    const nowBad = row.status === "failed" || row.status === "degraded";
    if (!wasOk || !nowBad) continue;
    events.push({
      serviceId: row.id,
      label: row.label,
      narration: sidecarDegradationNarration(row),
    });
  }
  return events;
}

export function sidecarDegradationNarration(row: SidecarServiceRow): string {
  if (row.status === "failed") {
    return `${row.label} went offline. ${row.withoutIt}`;
  }
  return `${row.label} is degraded. ${row.withoutIt}`;
}

export function sidecarManagerBlocksCompanion(
  snapshot: AletheiaSidecarManagerSnapshot | undefined,
): string | null {
  if (!snapshot) {
    return "Local services are still starting — wait a moment and try again.";
  }
  if (snapshot.bootReady) return null;
  const blocked = snapshot.services.find(
    (s) => s.critical && (s.status === "failed" || s.status === "not_installed"),
  );
  if (!blocked) return snapshot.degradedSummary;
  return `${blocked.label} is required for companion mode. ${blocked.withoutIt}`;
}

export function sidecarHealthIntervalForService(
  snapshot: AletheiaSidecarManagerSnapshot | undefined,
  id: SidecarServiceId,
): number {
  const row = snapshot?.services.find((s) => s.id === id);
  return row?.healthIntervalMs ?? SERVICE_COPY[id].healthIntervalMs;
}

/** Returns true when monitor tick does not need to push IPC. */
export function sidecarSnapshotsEqual(
  previous: AletheiaSidecarManagerSnapshot | undefined,
  current: AletheiaSidecarManagerSnapshot,
): boolean {
  if (!previous) return false;
  if (
    previous.bootReady !== current.bootReady
    || previous.degraded !== current.degraded
    || previous.degradedSummary !== current.degradedSummary
  ) {
    return false;
  }
  if (previous.services.length !== current.services.length) return false;
  return previous.services.every((row, index) => {
    const next = current.services[index];
    if (!next || row.id !== next.id) return false;
    return (
      row.status === next.status
      && row.detail === next.detail
      && row.restartCount === next.restartCount
      && row.lastRestartAt === next.lastRestartAt
    );
  });
}
