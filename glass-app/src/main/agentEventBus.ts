/**
 * Glass Agent Event Bus — horizontal agent-to-agent communication.
 *
 * This is SEPARATE from the Glass State Bus (push() → renderer).
 * The State Bus is vertical: main process → renderer windows.
 * This Event Bus is horizontal: agent ↔ agent within the main process.
 *
 * Architecture: see glass-app/docs/architecture/GLASS_ARCHITECTURE.md
 */

import { Subject, filter, share } from "rxjs";
import { randomUUID } from "crypto";
import type { GlassAgentId } from "../shared/ipc.ts";

// ── Typed Event Envelope ─────────────────────────────────────────────────────

export interface BusEvent<T = unknown> {
  eventId: string;
  runId: string;
  sessionId: string;
  correlationId: string;
  type: BusEventType;
  sourceAgentId: string;
  payload: T;
  timestamp: string;
  sequence: number;
}

// ── Event Type Registry ──────────────────────────────────────────────────────

export type BusEventType =
  | "orchestrator.task.created"
  | "orchestrator.task.cancelled"
  | "knowledge.perplexity.ready"
  | "knowledge.screen.ready"
  | "knowledge.audio.ready"
  | "agent.research.started"
  | "agent.research.complete"
  | "agent.research.error"
  | "agent.coder.started"
  | "agent.coder.complete"
  | "agent.coder.error"
  | "agent.writing.started"
  | "agent.writing.complete"
  | "agent.writing.error"
  | "agent.code.started"
  | "agent.code.complete"
  | "agent.code.error"
  | "context.intent.coding"
  | "context.intent.research"
  | "context.intent.writing"
  | "context.intent.meeting"
  | "session.enriched"
  | "delivery.complete"
  | "bus.dlq.event"
  | "bus.circuit.open"
  | "bus.circuit.closed";

export type AgentLifecyclePhase = "started" | "complete" | "error";

export function agentLifecycleEventType(
  agentId: GlassAgentId,
  phase: AgentLifecyclePhase,
): BusEventType {
  return `agent.${agentId}.${phase}` as BusEventType;
}

// ── Payload Types ────────────────────────────────────────────────────────────

export interface TaskCreatedPayload {
  prompt: string;
  targetAgentId: string;
  screenContext?: Record<string, unknown>;
  draftAfter?: boolean;
  draftPrompt?: string;
}

export interface KnowledgeReadyPayload {
  query: string;
  results: string;
  citations?: string[];
}

export interface AgentStartedPayload {
  agentId: string;
  prompt?: string;
}

export interface AgentCompletePayload {
  agentId: string;
  outputPath?: string;
  summary?: string;
  /** When true, Writing agent should run after research or council completes. */
  draftAfter?: boolean;
  draftPrompt?: string;
  /** Research text excerpt for downstream coder bootstrap. */
  researchExcerpt?: string;
  /** Final agent output text for memory persistence. */
  outputExcerpt?: string;
}

/** Tier 4 delivery — council judge answer + optional Writer chain gate. */
export interface DeliveryCompletePayload extends AgentCompletePayload {
  /** Final Judge output when agentId === "council". */
  judgeAnswer?: string;
}

export interface AgentErrorPayload {
  agentId: string;
  error: string;
  /** If true, the error engine may trigger Research to find a fix. */
  recoverable: boolean;
}

export interface CircuitBreakerPayload {
  agentId: string;
  error?: string;
}

export interface IntentPayload {
  confidence: number;
  app?: string;
  windowTitle?: string;
  focusedText?: string;
  audioTranscript?: string;
}

// ── Circuit Breaker ────────────────────────────────────────────────────────────

const CIRCUIT_OPEN_ERROR = "Circuit breaker open — agent temporarily disabled";

type CircuitBreakerHooks = {
  onOpen?: () => void;
  onClose?: () => void;
};

class CircuitBreaker {
  private failureCount = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private readonly threshold: number;
  private readonly resetMs: number;
  private resetTimer?: ReturnType<typeof setTimeout>;
  private readonly hooks: CircuitBreakerHooks;
  private openNotified = false;

  constructor(threshold = 3, resetMs = 30_000, hooks: CircuitBreakerHooks = {}) {
    this.threshold = threshold;
    this.resetMs = resetMs;
    this.hooks = hooks;
  }

  get isOpen(): boolean {
    return this.state === "open";
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      throw new Error(CIRCUIT_OPEN_ERROR);
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    const wasRecovering = this.state === "half-open";
    this.failureCount = 0;
    this.state = "closed";
    this.openNotified = false;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
    if (wasRecovering) {
      this.hooks.onClose?.();
    }
  }

  private onFailure(): void {
    if (this.state === "half-open") {
      this.trip();
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.threshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = "open";
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      this.state = "half-open";
      this.failureCount = 0;
    }, this.resetMs);

    if (!this.openNotified) {
      this.openNotified = true;
      this.hooks.onOpen?.();
    }
  }
}

export function isCircuitBreakerRejection(error: unknown): boolean {
  return error instanceof Error && error.message === CIRCUIT_OPEN_ERROR;
}

// ── Dead Letter Queue ──────────────────────────────────────────────────────────

export interface DLQEntry {
  event: BusEvent;
  error: string;
  failedAt: string;
}

class DeadLetterQueue {
  private entries: DLQEntry[] = [];
  private readonly maxSize = 100;

  push(event: BusEvent, error: string): void {
    this.entries.push({ event, error, failedAt: new Date().toISOString() });
    if (this.entries.length > this.maxSize) this.entries.shift();
    console.warn(
      `[AgentBus DLQ] Event ${event.type} (correlationId: ${event.correlationId}) failed: ${error}`,
    );
  }

  getAll(): DLQEntry[] { return [...this.entries]; }
  getByCorrelation(correlationId: string): DLQEntry[] {
    return this.entries.filter((e) => e.event.correlationId === correlationId);
  }
  size(): number { return this.entries.length; }
  clear(): void { this.entries = []; }
}

// ── Event Store ────────────────────────────────────────────────────────────────

class EventStore {
  private log: BusEvent[] = [];
  private readonly maxSize = 1000;

  append(event: BusEvent): void {
    this.log.push(event);
    if (this.log.length > this.maxSize) this.log.shift();
  }

  getChain(correlationId: string): BusEvent[] {
    return this.log.filter((e) => e.correlationId === correlationId);
  }

  getRun(runId: string): BusEvent[] {
    return this.log.filter((e) => e.runId === runId);
  }

  snapshotAt(correlationId: string, timestamp: string): BusEvent[] {
    return this.log.filter(
      (e) => e.correlationId === correlationId && e.timestamp <= timestamp,
    );
  }
}

// ── The Bus ────────────────────────────────────────────────────────────────────

export interface BusPublishContext {
  runId: string;
  sessionId: string;
  correlationId: string;
  sourceAgentId: string;
}

export class AgentBus {
  private sequences = new Map<string, number>();
  private breakers = new Map<string, CircuitBreaker>();
  private devObserverCleanup?: () => void;
  readonly dlq = new DeadLetterQueue();
  readonly store = new EventStore();

  private readonly subject$ = new Subject<BusEvent>();
  readonly events$ = this.subject$.pipe(share());

  publish<T>(
    type: BusEventType,
    payload: T,
    context: BusPublishContext,
  ): BusEvent<T> {
    const seqKey = `${context.correlationId}:${context.sourceAgentId}`;
    const seq = (this.sequences.get(seqKey) ?? 0) + 1;
    this.sequences.set(seqKey, seq);

    const event: BusEvent<T> = {
      eventId: randomUUID(),
      type,
      payload,
      runId: context.runId,
      sessionId: context.sessionId,
      correlationId: context.correlationId,
      sourceAgentId: context.sourceAgentId,
      timestamp: new Date().toISOString(),
      sequence: seq,
    };

    this.store.append(event as BusEvent);
    this.subject$.next(event as BusEvent);
    return event;
  }

  subscribe<T>(
    type: BusEventType,
    subscriberId: string,
    handler: (event: BusEvent<T>) => Promise<void> | void,
  ): () => void {
    const breaker = this.getOrCreateBreaker(subscriberId);

    const sub = this.events$.pipe(
      filter((e) => e.type === type),
    ).subscribe(async (event) => {
      try {
        await breaker.execute(() => Promise.resolve(handler(event as BusEvent<T>)));
      } catch (err) {
        if (isCircuitBreakerRejection(err)) return;
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.dlq.push(event, errorMsg);
      }
    });

    return () => sub.unsubscribe();
  }

  observe(observer: (event: BusEvent) => void): () => void {
    const sub = this.events$.subscribe(observer);
    return () => sub.unsubscribe();
  }

  streamOf<T>(type: BusEventType) {
    return this.events$.pipe(
      filter((e) => e.type === type),
    ) as ReturnType<typeof this.events$.pipe> & { _payload?: T };
  }

  static newCorrelationId(): string {
    return randomUUID();
  }

  healthCheck(): { healthy: boolean; dlqDepth: number; openBreakers: string[] } {
    const openBreakers = [...this.breakers.entries()]
      .filter(([, b]) => b.isOpen)
      .map(([id]) => id);
    return {
      healthy: this.dlq.size() < 10 && openBreakers.length === 0,
      dlqDepth: this.dlq.size(),
      openBreakers,
    };
  }

  /** Dev-only bus logger — call from init, tear down on quit. */
  enableDevObserver(): void {
    if (this.devObserverCleanup) return;
    this.devObserverCleanup = this.observe((event) => {
      console.log(
        `[AgentBus] ${event.type} | src:${event.sourceAgentId} | corr:${event.correlationId.slice(0, 8)} | seq:${event.sequence}`,
      );
    });
  }

  disableDevObserver(): void {
    this.devObserverCleanup?.();
    this.devObserverCleanup = undefined;
  }

  private getOrCreateBreaker(subscriberId: string): CircuitBreaker {
    let breaker = this.breakers.get(subscriberId);
    if (!breaker) {
      breaker = new CircuitBreaker(3, 30_000, {
        onOpen: () => {
          this.publish("bus.circuit.open", { agentId: subscriberId }, {
            runId: "bus",
            sessionId: "bus",
            correlationId: subscriberId,
            sourceAgentId: "agent-bus",
          });
        },
        onClose: () => {
          this.publish("bus.circuit.closed", { agentId: subscriberId }, {
            runId: "bus",
            sessionId: "bus",
            correlationId: subscriberId,
            sourceAgentId: "agent-bus",
          });
        },
      });
      this.breakers.set(subscriberId, breaker);
    }
    return breaker;
  }
}

export const agentBus = new AgentBus();

if (process.env.NODE_ENV === "development") {
  agentBus.enableDevObserver();
}

export const agentEvents$ = agentBus.events$;
