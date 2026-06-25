/**
 * Glass Dashboard — fullscreen overlay workspace + agent bus relay.
 */

import type { WebContents } from "electron";
import { agentBus, type BusEvent } from "./agentEventBus.ts";
import { IPC, type GlassDashboardAgentEvent } from "../shared/ipc.ts";

const FORWARD_EVENT_TYPES = new Set([
  "session.enriched",
  "delivery.complete",
  "orchestrator.task.created",
  "agent.research.started",
  "agent.research.complete",
  "agent.writing.started",
  "agent.writing.complete",
  "agent.coder.started",
  "agent.coder.complete",
]);

let busObserverCleanup: (() => void) | null = null;
let isDashboardActive: () => boolean = () => false;
let resolveOverlayWebContents: () => WebContents | undefined = () => undefined;

export function configureGlassDashboardRuntime(opts: {
  isActive: () => boolean;
  overlayWebContents: () => WebContents | undefined;
}): void {
  isDashboardActive = opts.isActive;
  resolveOverlayWebContents = opts.overlayWebContents;
}

function serializeDashboardEvent(event: BusEvent): GlassDashboardAgentEvent {
  return {
    eventId: event.eventId,
    type: event.type,
    sourceAgentId: event.sourceAgentId,
    payload: event.payload,
    timestamp: event.timestamp,
    runId: event.runId,
    correlationId: event.correlationId,
  };
}

function forwardAgentEventToDashboard(event: BusEvent): void {
  if (!FORWARD_EVENT_TYPES.has(event.type)) return;
  if (!isDashboardActive()) return;
  const contents = resolveOverlayWebContents();
  if (!contents || contents.isDestroyed()) return;
  contents.send(IPC.dashboardAgentEvent, serializeDashboardEvent(event));
}

export function initGlassDashboard(): void {
  if (!busObserverCleanup) {
    busObserverCleanup = agentBus.observe(forwardAgentEventToDashboard, "dashboard-relay");
  }
}

export function teardownGlassDashboard(): void {
  busObserverCleanup?.();
  busObserverCleanup = null;
}
