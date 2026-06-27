/**
 * Aletheia security hive plane (B7) — event bus wiring, agent deployment, degradation.
 */

import { randomUUID } from "node:crypto";
import { agentBus, type BusEvent, type CircuitBreakerPayload } from "./agentEventBus.ts";
import type { ActionIntent, ActionLedgerEntry, ActionResult } from "../shared/aletheiaExecution.ts";
import {
  appendThreatSignal,
  applyAgentHealthChange,
  clearContainment,
  compareApprovedVsExecuted,
  createSecurityLedgerDeduper,
  detectHeuristicThreats,
  detectKeychainAnomaly,
  dismissSecurityContainmentSnapshot,
  initialSecurityHiveSnapshot,
  recordVerifierPassSnapshot,
  shouldCancelLoopsForThreat,
  type SecurityAgentId,
  type SecurityHiveSnapshot,
  type SecurityThreatSignal,
} from "../shared/aletheiaSecurityHive.ts";
import { runSecurityHiveAgent } from "./aletheiaSecurityAgentRunner.ts";

export interface AletheiaSecurityHiveHost {
  getSnapshot: () => SecurityHiveSnapshot | undefined;
  setSnapshot: (snapshot: SecurityHiveSnapshot | undefined) => void;
  push: () => void;
  getSessionId: () => string;
  onContainmentActivated?: (threat: SecurityThreatSignal) => void;
  onLockedMode?: () => void;
}

let busCleanups: Array<() => void> = [];
const keychainAccessTimestamps: number[] = [];
const recentShellTimestamps: number[] = [];
const ledgerDeduper = createSecurityLedgerDeduper();
let lastShellBurstThreatAt = 0;
let lastBusAnomalyThreatAt = 0;
let runningAgents = 0;
const MAX_CONCURRENT_SECURITY_AGENTS = 2;
const SHELL_BURST_DEDUPE_MS = 10_000;
const BUS_ANOMALY_DEDUPE_MS = 60_000;

function setSnapshot(host: AletheiaSecurityHiveHost, snapshot: SecurityHiveSnapshot): void {
  host.setSnapshot(snapshot);
  host.push();
}

function currentSnapshot(host: AletheiaSecurityHiveHost): SecurityHiveSnapshot {
  return host.getSnapshot() ?? initialSecurityHiveSnapshot();
}

function deploySecurityAgent(
  host: AletheiaSecurityHiveHost,
  agentId: SecurityAgentId,
  briefing: string,
): void {
  if (runningAgents >= MAX_CONCURRENT_SECURITY_AGENTS) return;
  runningAgents += 1;

  void runSecurityHiveAgent(agentId, briefing)
    .then((result) => {
      if (result.skipped) {
        if (agentId === "containment") {
          setSnapshot(host, clearContainment(currentSnapshot(host)));
        }
        return;
      }

      let snapshot = currentSnapshot(host);
      if (result.ok && result.report) {
        snapshot = applyAgentHealthChange(snapshot, agentId, "healthy", result.report);
        if (agentId === "containment" && snapshot.activeContainment) {
          snapshot = clearContainment(snapshot);
        }
      } else if (result.errorMessage) {
        // Transient LLM errors update the report but do not trip B7.2 degradation.
        const currentHealth =
          snapshot.agents.find((row) => row.agentId === agentId)?.health ?? "healthy";
        snapshot = applyAgentHealthChange(snapshot, agentId, currentHealth, result.errorMessage);
        if (agentId === "containment") {
          snapshot = clearContainment(snapshot);
        }
      }
      setSnapshot(host, snapshot);
    })
    .finally(() => {
      runningAgents = Math.max(0, runningAgents - 1);
    });
}

function resolveThreatAgent(threat: SecurityThreatSignal): SecurityAgentId {
  if (threat.severity === "high" || threat.severity === "critical") {
    return "containment";
  }
  if (threat.deployedAgent === "verifier" || threat.deployedAgent === "key_guardian") {
    return threat.deployedAgent;
  }
  return "watcher";
}

function handleThreat(host: AletheiaSecurityHiveHost, threat: SecurityThreatSignal): void {
  let snapshot = appendThreatSignal(currentSnapshot(host), threat);
  setSnapshot(host, snapshot);

  if (shouldCancelLoopsForThreat(threat)) {
    host.onContainmentActivated?.(threat);
  }

  deploySecurityAgent(host, resolveThreatAgent(threat), threat.briefing);
}

function ingestBusAnomalyThreats(
  host: AletheiaSecurityHiveHost,
  threats: SecurityThreatSignal[],
): void {
  const now = Date.now();
  if (now - lastBusAnomalyThreatAt < BUS_ANOMALY_DEDUPE_MS) return;
  if (threats.length === 0) return;
  lastBusAnomalyThreatAt = now;
  ingestHeuristicThreats(host, threats);
}

function ingestHeuristicThreats(
  host: AletheiaSecurityHiveHost,
  threats: SecurityThreatSignal[],
): void {
  for (const threat of threats) {
    handleThreat(host, threat);
  }
}

function trackShellActivity(host: AletheiaSecurityHiveHost): void {
  const now = Date.now();
  recentShellTimestamps.push(now);
  const windowMs = 10_000;
  while (recentShellTimestamps.length > 0 && now - recentShellTimestamps[0]! > windowMs) {
    recentShellTimestamps.shift();
  }

  if (recentShellTimestamps.length < 4) return;
  if (now - lastShellBurstThreatAt < SHELL_BURST_DEDUPE_MS) return;

  const threats = detectHeuristicThreats({ shellBurstCount: recentShellTimestamps.length });
  if (threats.length === 0) return;

  lastShellBurstThreatAt = now;
  ingestHeuristicThreats(host, threats);
}

function wireSecurityBus(host: AletheiaSecurityHiveHost): void {
  if (busCleanups.length > 0) return;

  busCleanups.push(
    agentBus.subscribe<CircuitBreakerPayload>(
      "bus.circuit.open",
      "aletheia-security-watcher-breaker",
      () => {
        ingestBusAnomalyThreats(
          host,
          detectHeuristicThreats({ circuitBreakerOpen: true }),
        );
      },
    ),
  );

  busCleanups.push(
    agentBus.subscribe(
      "bus.dlq.event",
      "aletheia-security-watcher-dlq",
      () => {
        ingestBusAnomalyThreats(host, detectHeuristicThreats({ busDlq: true }));
      },
    ),
  );

  busCleanups.push(
    agentBus.subscribe(
      "agent.coder.error",
      "aletheia-security-watcher-coder-error",
      () => {
        deploySecurityAgent(
          host,
          "watcher",
          "Coder agent reported an error on the event bus — assess whether behavior looks anomalous.",
        );
      },
    ),
  );
}

export function initAletheiaSecurityHivePlane(host: AletheiaSecurityHiveHost): () => void {
  if (!host.getSnapshot()) {
    host.setSnapshot(initialSecurityHiveSnapshot());
  }
  wireSecurityBus(host);
  return () => {
    for (const cleanup of busCleanups) cleanup();
    busCleanups = [];
    ledgerDeduper.clear();
    lastShellBurstThreatAt = 0;
    lastBusAnomalyThreatAt = 0;
  };
}

export function clearAletheiaSecurityHiveState(host: AletheiaSecurityHiveHost): void {
  host.setSnapshot(initialSecurityHiveSnapshot());
  keychainAccessTimestamps.length = 0;
  recentShellTimestamps.length = 0;
  ledgerDeduper.clear();
  lastShellBurstThreatAt = 0;
  lastBusAnomalyThreatAt = 0;
}

export function recordSecurityKeychainAccess(host: AletheiaSecurityHiveHost, keyId: string): void {
  const now = Date.now();
  keychainAccessTimestamps.push(now);
  while (keychainAccessTimestamps.length > 40) keychainAccessTimestamps.shift();

  const snapshot = currentSnapshot(host);
  if (!snapshot.keychainPerimeterActive) return;

  const anomaly = detectKeychainAnomaly(keychainAccessTimestamps, now);
  if (!anomaly) return;

  handleThreat(host, {
    ...anomaly,
    briefing: `${anomaly.briefing} Last key id: ${keyId}.`,
  });
}

export function onAletheiaActionLedgerEntryForSecurity(
  host: AletheiaSecurityHiveHost,
  entry: ActionLedgerEntry,
): void {
  if (!ledgerDeduper.remember(entry.id)) return;

  if (entry.kind === "shell" && entry.stage === "executing") {
    trackShellActivity(host);
  }

  if (entry.stage === "failed" && entry.narration) {
    ingestHeuristicThreats(
      host,
      detectHeuristicThreats({ ledgerNarration: entry.narration }),
    );
  }

  if (entry.stage === "intent" && entry.payloadJson) {
    try {
      const payload = JSON.parse(entry.payloadJson) as Record<string, unknown>;
      ingestHeuristicThreats(host, detectHeuristicThreats({ intentPayload: payload }));
    } catch {
      // ignore malformed payload
    }
  }
}

export function verifyAletheiaActionForSecurity(
  host: AletheiaSecurityHiveHost,
  intent: ActionIntent,
  result: ActionResult,
): void {
  const mismatch = compareApprovedVsExecuted(intent, result);
  if (mismatch) {
    handleThreat(host, mismatch);
    return;
  }

  // Heuristic pass — record locally without an LLM round-trip on every action.
  setSnapshot(host, recordVerifierPassSnapshot(currentSnapshot(host), intent, result));
}

export function markSecurityAgentOffline(
  host: AletheiaSecurityHiveHost,
  agentId: SecurityAgentId,
  reason: string,
): void {
  const snapshot = applyAgentHealthChange(currentSnapshot(host), agentId, "offline", reason);
  setSnapshot(host, snapshot);
  if (agentId === "containment") {
    host.onLockedMode?.();
  }
}

export function simulateSecurityAgentFailureForTest(
  host: AletheiaSecurityHiveHost,
  agentId: SecurityAgentId,
): SecurityHiveSnapshot {
  const snapshot = applyAgentHealthChange(
    currentSnapshot(host),
    agentId,
    "offline",
    `${agentId} simulated offline for degradation test.`,
  );
  setSnapshot(host, snapshot);
  if (agentId === "containment") {
    host.onLockedMode?.();
  }
  return snapshot;
}

export function dismissSecurityContainment(host: AletheiaSecurityHiveHost): SecurityHiveSnapshot {
  const snapshot = dismissSecurityContainmentSnapshot(currentSnapshot(host));
  setSnapshot(host, snapshot);
  return snapshot;
}

export function publishSecurityThreatEvent(
  host: AletheiaSecurityHiveHost,
  threat: Omit<SecurityThreatSignal, "id" | "detectedAt">,
): void {
  handleThreat(host, {
    ...threat,
    id: randomUUID(),
    detectedAt: Date.now(),
  });
}

/** Test hook — observe bus events without full plane init. */
export function securityBusEventBrief(event: BusEvent): string | null {
  if (event.type === "bus.circuit.open") return "Circuit breaker opened on agent bus.";
  if (event.type === "bus.dlq.event") return "Dead-letter delivery on agent bus.";
  return null;
}
