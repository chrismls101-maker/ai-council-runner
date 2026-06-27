/**
 * Aletheia security hive (B7) — living immune system + graceful degradation.
 *
 * B7.1 — Watcher, Verifier, Containment, Key Guardian agents on the event bus.
 * B7.2 — Regeneration cascade when agents fail; reduced-mode narration.
 */

import type { ActionIntent, ActionResult } from "./aletheiaExecution.ts";

export type SecurityAgentId = "watcher" | "verifier" | "containment" | "key_guardian";

export type SecurityAgentHealth = "healthy" | "degraded" | "offline";

/** Operational posture after agent health + threat signals. */
export type SecurityOperationalMode = "full" | "reduced" | "hold" | "locked";

export type ThreatCategory =
  | "prompt_injection"
  | "scope_violation"
  | "shell_burst"
  | "keychain_anomaly"
  | "verification_mismatch"
  | "circuit_breaker"
  | "bus_anomaly";

export interface SecurityThreatSignal {
  id: string;
  category: ThreatCategory;
  severity: "low" | "medium" | "high" | "critical";
  briefing: string;
  source: SecurityAgentId | "heuristic";
  detectedAt: number;
  /** Agent spawned to respond, if any. */
  deployedAgent?: SecurityAgentId;
}

export interface SecurityAgentStatus {
  agentId: SecurityAgentId;
  health: SecurityAgentHealth;
  role: string;
  lastReportAt?: number;
  lastReport?: string;
}

export interface SecurityHiveSnapshot {
  updatedAt: number;
  mode: SecurityOperationalMode;
  modeNarration: string;
  agents: SecurityAgentStatus[];
  recentThreats: SecurityThreatSignal[];
  activeContainment: boolean;
  newActionsBlocked: boolean;
  keychainPerimeterActive: boolean;
}

const AGENT_ROLES: Record<SecurityAgentId, string> = {
  watcher: "Continuous observer — signals anomalies, never acts directly.",
  verifier: "Post-action checker — compares approved intent vs what ran.",
  containment: "Threat response — revokes authority and stops loops.",
  key_guardian: "Keychain perimeter — watches safeStorage access patterns.",
};

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /\bignore (all )?(previous|prior|above) instructions\b/i,
  /\bdisregard (your|the) (system|safety) (prompt|rules)\b/i,
  /\byou are now (in )?(developer|admin|root) mode\b/i,
  /\breveal (your|the) (api|secret|system) key\b/i,
  /\bprint (the )?(env|environment|keychain)\b/i,
];

export function initialSecurityAgentStatuses(): SecurityAgentStatus[] {
  return (Object.keys(AGENT_ROLES) as SecurityAgentId[]).map((agentId) => ({
    agentId,
    health: "healthy",
    role: AGENT_ROLES[agentId],
  }));
}

export function initialSecurityHiveSnapshot(): SecurityHiveSnapshot {
  return buildSecurityHiveSnapshot({
    agents: initialSecurityAgentStatuses(),
    recentThreats: [],
    activeContainment: false,
  });
}

export function computeOperationalMode(input: {
  agents: readonly SecurityAgentStatus[];
  activeContainment: boolean;
}): SecurityOperationalMode {
  const health = (id: SecurityAgentId) =>
    input.agents.find((row) => row.agentId === id)?.health ?? "offline";

  const containment = health("containment");
  const verifier = health("verifier");
  const watcher = health("watcher");
  const keyGuardian = health("key_guardian");

  // B7.2 — Containment failure → locked (all session authority revoked).
  if (containment === "offline") return "locked";

  if (input.activeContainment || containment === "degraded") return "hold";

  // B7.2 — Verifier failure → hold new actions.
  if (verifier === "offline" || verifier === "degraded") return "hold";

  // B7.2 — Watcher failure → reduced; Key Guardian holds perimeter alone.
  if (watcher === "offline" || watcher === "degraded") {
    if (keyGuardian === "healthy" || keyGuardian === "degraded") return "reduced";
    return "hold";
  }

  return "full";
}

export function modeNarrationFor(mode: SecurityOperationalMode, detail?: string): string {
  const suffix = detail?.trim() ? ` ${detail.trim()}` : "";
  switch (mode) {
    case "full":
      return detail?.trim()
        ? detail.trim()
        : "Security hive is fully operational — all agents are watching.";
    case "reduced":
      return `I'm operating in reduced mode because the Watcher is unavailable. Key Guardian is holding the keychain perimeter alone.${suffix}`;
    case "hold":
      return `I'm operating in hold mode because ${detail?.trim() || "a security agent needs attention"}. New actions are paused until I restore verification.${suffix}`;
    case "locked":
      return `Session authority is revoked — Containment failed. Stop-all is active; only key protection and expiry timers remain.${suffix}`;
    default:
      return "Security posture unknown.";
  }
}

export function newActionsBlockedInMode(mode: SecurityOperationalMode): boolean {
  return mode === "hold" || mode === "locked";
}

export function keychainPerimeterActiveInMode(
  mode: SecurityOperationalMode,
  agents: readonly SecurityAgentStatus[],
): boolean {
  const keyGuardian = agents.find((row) => row.agentId === "key_guardian");
  if (mode === "locked") return keyGuardian?.health !== "offline";
  if (mode === "reduced") return keyGuardian?.health === "healthy" || keyGuardian?.health === "degraded";
  return true;
}

export function buildSecurityHiveSnapshot(input: {
  agents: SecurityAgentStatus[];
  recentThreats: SecurityThreatSignal[];
  activeContainment: boolean;
  modeDetail?: string;
}): SecurityHiveSnapshot {
  const mode = computeOperationalMode({
    agents: input.agents,
    activeContainment: input.activeContainment,
  });
  return {
    updatedAt: Date.now(),
    mode,
    modeNarration: modeNarrationFor(mode, input.modeDetail),
    agents: input.agents,
    recentThreats: input.recentThreats.slice(0, 12),
    activeContainment: input.activeContainment,
    newActionsBlocked: newActionsBlockedInMode(mode),
    keychainPerimeterActive: keychainPerimeterActiveInMode(mode, input.agents),
  };
}

export function applyAgentHealthChange(
  snapshot: SecurityHiveSnapshot,
  agentId: SecurityAgentId,
  health: SecurityAgentHealth,
  report?: string,
): SecurityHiveSnapshot {
  const agents = snapshot.agents.map((row) =>
    row.agentId === agentId
      ? {
          ...row,
          health,
          lastReportAt: report ? Date.now() : row.lastReportAt,
          lastReport: report ?? row.lastReport,
        }
      : row,
  );
  const modeDetail =
    health === "offline"
      ? `${agentLabel(agentId)} went offline.`
      : health === "degraded"
        ? `${agentLabel(agentId)} is degraded.`
        : undefined;
  return buildSecurityHiveSnapshot({
    agents,
    recentThreats: snapshot.recentThreats,
    activeContainment: snapshot.activeContainment,
    modeDetail,
  });
}

export function appendThreatSignal(
  snapshot: SecurityHiveSnapshot,
  threat: SecurityThreatSignal,
): SecurityHiveSnapshot {
  const recentThreats = [threat, ...snapshot.recentThreats.filter((row) => row.id !== threat.id)].slice(
    0,
    12,
  );
  const activeContainment =
    snapshot.activeContainment || shouldActivateContainment(threat);
  return buildSecurityHiveSnapshot({
    agents: snapshot.agents,
    recentThreats,
    activeContainment,
    modeDetail: threat.briefing,
  });
}

/** Whether a threat should block new actions via containment hold. */
export function shouldActivateContainment(threat: SecurityThreatSignal): boolean {
  if (threat.severity === "critical") return true;
  if (threat.severity === "high" && threat.category === "prompt_injection") return true;
  return false;
}

/** Whether a threat should immediately stop in-flight loops (critical only). */
export function shouldCancelLoopsForThreat(threat: SecurityThreatSignal): boolean {
  return threat.severity === "critical";
}

export function dismissSecurityContainmentSnapshot(snapshot: SecurityHiveSnapshot): SecurityHiveSnapshot {
  return buildSecurityHiveSnapshot({
    agents: snapshot.agents,
    recentThreats: snapshot.recentThreats,
    activeContainment: false,
    modeDetail: "You cleared the security hold — normal posture restored.",
  });
}

export function clearContainment(snapshot: SecurityHiveSnapshot): SecurityHiveSnapshot {
  return buildSecurityHiveSnapshot({
    agents: snapshot.agents,
    recentThreats: snapshot.recentThreats,
    activeContainment: false,
  });
}

export function agentLabel(agentId: SecurityAgentId): string {
  switch (agentId) {
    case "watcher":
      return "Watcher";
    case "verifier":
      return "Verifier";
    case "containment":
      return "Containment";
    case "key_guardian":
      return "Key Guardian";
    default:
      return agentId;
  }
}

export function threatCategoryLabel(category: ThreatCategory): string {
  switch (category) {
    case "prompt_injection":
      return "Prompt injection";
    case "scope_violation":
      return "Scope violation";
    case "shell_burst":
      return "Shell burst";
    case "keychain_anomaly":
      return "Keychain anomaly";
    case "verification_mismatch":
      return "Verification mismatch";
    case "circuit_breaker":
      return "Circuit breaker";
    case "bus_anomaly":
      return "Bus anomaly";
    default:
      return category;
  }
}

function extractInspectableText(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["text", "command", "content", "path", "summary"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) parts.push(value);
  }
  return parts.join("\n");
}

export function detectPromptInjection(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function detectHeuristicThreats(input: {
  intentPayload?: Record<string, unknown>;
  ledgerNarration?: string;
  shellBurstCount?: number;
  circuitBreakerOpen?: boolean;
  busDlq?: boolean;
}): SecurityThreatSignal[] {
  const threats: SecurityThreatSignal[] = [];
  const now = Date.now();

  if (input.intentPayload) {
    const text = extractInspectableText(input.intentPayload);
    if (detectPromptInjection(text)) {
      threats.push({
        id: `threat-prompt-${now}`,
        category: "prompt_injection",
        severity: "high",
        briefing: "Observed content resembles a prompt-injection attempt in an action payload.",
        source: "heuristic",
        detectedAt: now,
        deployedAgent: "containment",
      });
    }
  }

  if (input.ledgerNarration && /outside (the )?(declared )?(action )?scope|outside allowed/i.test(input.ledgerNarration)) {
    threats.push({
      id: `threat-scope-${now}`,
      category: "scope_violation",
      severity: "medium",
      briefing: "An action was blocked for operating outside its declared scope.",
      source: "heuristic",
      detectedAt: now,
      deployedAgent: "watcher",
    });
  }

  if ((input.shellBurstCount ?? 0) >= 4) {
    threats.push({
      id: `threat-shell-${now}`,
      category: "shell_burst",
      severity: "medium",
      briefing: "Unusual shell activity burst detected — multiple commands in a short window.",
      source: "heuristic",
      detectedAt: now,
      deployedAgent: "watcher",
    });
  }

  if (input.circuitBreakerOpen) {
    threats.push({
      id: `threat-breaker-${now}`,
      category: "circuit_breaker",
      severity: "medium",
      briefing: "Agent bus circuit breaker opened — subscriber failures tripped isolation.",
      source: "heuristic",
      detectedAt: now,
      deployedAgent: "watcher",
    });
  }

  if (input.busDlq) {
    threats.push({
      id: `threat-dlq-${now}`,
      category: "bus_anomaly",
      severity: "medium",
      briefing: "Agent event bus dead-letter queue received a failed delivery.",
      source: "heuristic",
      detectedAt: now,
      deployedAgent: "watcher",
    });
  }

  return threats;
}

export function compareApprovedVsExecuted(
  intent: ActionIntent,
  result: ActionResult,
): SecurityThreatSignal | null {
  if (!result.ok) return null;
  const now = Date.now();

  if (intent.kind === "file-write") {
    const approvedPath = String(intent.payload.path ?? "").trim();
    const output = result.output ?? "";
    if (approvedPath && output && !output.includes(approvedPath.split("/").pop() ?? approvedPath)) {
      // Lightweight mismatch hint — executor narrates path on success.
      if (!/wrote|saved|updated|applied/i.test(output)) {
        return {
          id: `threat-verify-file-${intent.id}`,
          category: "verification_mismatch",
          severity: "medium",
          briefing: `Verifier could not confirm the file write matched the approved path (${approvedPath}).`,
          source: "heuristic",
          detectedAt: now,
          deployedAgent: "verifier",
        };
      }
    }
  }

  if (intent.kind === "shell") {
    const approved = String(intent.payload.command ?? "").trim();
    const output = result.output ?? "";
    if (approved && output.length > 12_000) {
      return {
        id: `threat-verify-shell-${intent.id}`,
        category: "verification_mismatch",
        severity: "low",
        briefing: "Shell output exceeded expected bounds after an approved command.",
        source: "heuristic",
        detectedAt: now,
        deployedAgent: "verifier",
      };
    }
  }

  return null;
}

export function detectKeychainAnomaly(accessTimestamps: readonly number[], now = Date.now()): SecurityThreatSignal | null {
  const windowMs = 30_000;
  const recent = accessTimestamps.filter((ts) => now - ts <= windowMs);
  if (recent.length < 6) return null;
  return {
    id: `threat-keychain-${now}`,
    category: "keychain_anomaly",
    severity: recent.length >= 10 ? "high" : "medium",
    briefing: `Key Guardian saw ${recent.length} keychain reads in ${Math.round(windowMs / 1000)}s — possible exfiltration attempt.`,
    source: "heuristic",
    detectedAt: now,
    deployedAgent: "key_guardian",
  };
}

export function securityHiveSnapshotsEqual(
  a: SecurityHiveSnapshot | undefined,
  b: SecurityHiveSnapshot | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.mode !== b.mode || a.activeContainment !== b.activeContainment) return false;
  if (a.recentThreats.length !== b.recentThreats.length) return false;
  return a.recentThreats.every((row, index) => row.id === b.recentThreats[index]?.id);
}

export function canExecuteNewAction(snapshot: SecurityHiveSnapshot | undefined): { ok: true } | { ok: false; reason: string } {
  if (!snapshot) return { ok: true };
  if (!snapshot.newActionsBlocked) return { ok: true };
  return {
    ok: false,
    reason: snapshot.modeNarration,
  };
}

/** Tracks ledger row ids so the security plane does not re-process the same entry. */
export function createSecurityLedgerDeduper(maxSize = 200): {
  remember: (entryId: string) => boolean;
  clear: () => void;
} {
  const processedLedgerEntryIds = new Set<string>();
  return {
    remember(entryId: string): boolean {
      if (processedLedgerEntryIds.has(entryId)) return false;
      processedLedgerEntryIds.add(entryId);
      if (processedLedgerEntryIds.size > maxSize) {
        const oldest = processedLedgerEntryIds.values().next().value;
        if (oldest) processedLedgerEntryIds.delete(oldest);
      }
      return true;
    },
    clear() {
      processedLedgerEntryIds.clear();
    },
  };
}

export function recordVerifierPassSnapshot(
  snapshot: SecurityHiveSnapshot,
  intent: ActionIntent,
  result: ActionResult,
): SecurityHiveSnapshot {
  return applyAgentHealthChange(
    snapshot,
    "verifier",
    "healthy",
    result.ok
      ? `Verified ${intent.kind} "${intent.summary}" matched approved intent.`
      : `Recorded failed ${intent.kind} — no execution mismatch detected.`,
  );
}
