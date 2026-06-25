/**
 * Glass Agent Event Bus — horizontal agent-to-agent communication.
 *
 * This is SEPARATE from the Glass State Bus (push() → renderer).
 * The State Bus is vertical: main process → renderer windows.
 * This Event Bus is horizontal: agent ↔ agent within the main process.
 *
 * Architecture: see glass-app/docs/architecture/GLASS_ARCHITECTURE.md
 */

import { Subject, filter, share, catchError, EMPTY, type Subscription } from "rxjs";
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
  | "knowledge.audio.build_plan_ready"
  | "session.enriched"
  | "delivery.complete"
  | "bus.dlq.event"
  | "bus.circuit.open"
  | "bus.circuit.closed"
  | "bus.heartbeat";

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

export interface BusHeartbeatPayload {
  seq: number;
  timestamp: string;
}

export interface IntentPayload {
  confidence: number;
  app?: string;
  windowTitle?: string;
  focusedText?: string;
  audioTranscript?: string;
}

/** Emitted when an audio/video listening session produces an extractable build intent. */
export interface AudioBuildPlanPayload {
  /** Formatted prompt ready to inject into Glass Coder pre-fill. */
  coderPrompt: string;
  /** First 500 chars of the source transcript (for memory/logging). */
  sourceTranscriptExcerpt: string;
  /** Raw extracted intent JSON from the extraction model. */
  extractedIntent: {
    intent: string;
    requirements: string[];
    stack: string[];
  };
}

/** Emitted when a Listen Mode session ends with extractable moments. */
export interface MeetingSessionPayload {
  /** Full rolling transcript text from the session. */
  transcript: string;
  /** Key moments extracted during the session. */
  moments: Array<{ type: string; summary: string; importance: string }>;
  /** Action steps found (type === "action_step" moments). */
  actionSteps: string[];
}

// ── Circuit Breaker ────────────────────────────────────────────────────────────

const CIRCUIT_OPEN_ERROR = "Circuit breaker open — agent temporarily disabled";

export const MISSED_HEARTBEAT_UNHEALTHY_THRESHOLD = 3;

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

export interface AgentBusSubscriberHealth {
  subscriberId: string;
  consecutiveMissedHeartbeats: number;
  healthy: boolean;
  lastAckSeq: number;
}

export interface AgentBusHealthSnapshot {
  healthy: boolean;
  dlqDepth: number;
  openBreakers: string[];
  heartbeatSeq: number;
  subscribers: AgentBusSubscriberHealth[];
  staleSubscribers: string[];
}

type ResilientSubscriptionOptions = {
  skipBreaker?: boolean;
};

export class AgentBus {
  private sequences = new Map<string, number>();
  private breakers = new Map<string, CircuitBreaker>();
  private devObserverCleanup?: () => void;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private heartbeatSeq = 0;
  private readonly subscriberHealth = new Map<string, { lastAckSeq: number; consecutiveMisses: number }>();
  private readonly subscriberRefCounts = new Map<string, number>();
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
    this.retainSubscriber(subscriberId);

    const unsubMain = this.createResilientSubscription(
      type,
      subscriberId,
      handler,
    );
    const unsubHeartbeat = this.createResilientSubscription(
      "bus.heartbeat",
      subscriberId,
      (event) => {
        const payload = event.payload as BusHeartbeatPayload;
        console.log(
          `[AgentBus] heartbeat ack | subscriber:${subscriberId} | type:bus.heartbeat | corr:${event.correlationId} | seq:${payload.seq}`,
        );
        this.recordHeartbeatAck(subscriberId);
      },
      { skipBreaker: true },
    );

    return () => {
      unsubMain();
      unsubHeartbeat();
      this.releaseSubscriber(subscriberId);
    };
  }

  observe(
    observer: (event: BusEvent) => void,
    subscriberId = "bus-observer",
  ): () => void {
    this.retainSubscriber(subscriberId);
    const unsub = this.createResilientObserve(observer, subscriberId);
    const unsubHeartbeat = this.createResilientSubscription(
      "bus.heartbeat",
      subscriberId,
      (event) => {
        const payload = event.payload as BusHeartbeatPayload;
        console.log(
          `[AgentBus] heartbeat ack | subscriber:${subscriberId} | type:bus.heartbeat | corr:${event.correlationId} | seq:${payload.seq}`,
        );
        this.recordHeartbeatAck(subscriberId);
      },
      { skipBreaker: true },
    );
    return () => {
      unsub();
      unsubHeartbeat();
      this.releaseSubscriber(subscriberId);
    };
  }

  streamOf<T>(type: BusEventType) {
    return this.events$.pipe(
      filter((e) => e.type === type),
    ) as ReturnType<typeof this.events$.pipe> & { _payload?: T };
  }

  static newCorrelationId(): string {
    return randomUUID();
  }

  startHeartbeat(intervalMs = 30_000): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.pulseHeartbeat(), intervalMs);
  }

  stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  getHealthSnapshot(): AgentBusHealthSnapshot {
    const openBreakers = [...this.breakers.entries()]
      .filter(([, breaker]) => breaker.isOpen)
      .map(([id]) => id);
    const subscribers: AgentBusSubscriberHealth[] = [...this.subscriberHealth.entries()].map(
      ([subscriberId, health]) => ({
        subscriberId,
        consecutiveMissedHeartbeats: health.consecutiveMisses,
        healthy: health.consecutiveMisses < MISSED_HEARTBEAT_UNHEALTHY_THRESHOLD,
        lastAckSeq: health.lastAckSeq,
      }),
    );
    const staleSubscribers = subscribers
      .filter((row) => !row.healthy)
      .map((row) => row.subscriberId);
    const dlqDepth = this.dlq.size();
    return {
      healthy: staleSubscribers.length === 0 && dlqDepth < 10 && openBreakers.length === 0,
      dlqDepth,
      openBreakers,
      heartbeatSeq: this.heartbeatSeq,
      subscribers,
      staleSubscribers,
    };
  }

  healthCheck(): { healthy: boolean; dlqDepth: number; openBreakers: string[] } {
    const snapshot = this.getHealthSnapshot();
    return {
      healthy: snapshot.healthy,
      dlqDepth: snapshot.dlqDepth,
      openBreakers: snapshot.openBreakers,
    };
  }

  /** Dev-only bus logger — call from init, tear down on quit. */
  enableDevObserver(): void {
    if (this.devObserverCleanup) return;
    this.devObserverCleanup = this.observe((event) => {
      console.log(
        `[AgentBus] ${event.type} | src:${event.sourceAgentId} | corr:${event.correlationId.slice(0, 8)} | seq:${event.sequence}`,
      );
    }, "dev-observer");
  }

  disableDevObserver(): void {
    this.devObserverCleanup?.();
    this.devObserverCleanup = undefined;
  }

  pulseHeartbeat(): void {
    const previousSeq = this.heartbeatSeq;
    this.heartbeatSeq += 1;

    for (const [, health] of this.subscriberHealth) {
      if (previousSeq > 0 && health.lastAckSeq < previousSeq) {
        health.consecutiveMisses += 1;
      } else if (health.lastAckSeq >= previousSeq) {
        health.consecutiveMisses = 0;
      }
    }

    this.publish(
      "bus.heartbeat",
      { seq: this.heartbeatSeq, timestamp: new Date().toISOString() },
      {
        runId: "bus",
        sessionId: "bus",
        correlationId: `heartbeat-${this.heartbeatSeq}`,
        sourceAgentId: "agent-bus",
      },
    );
  }

  private recordHeartbeatAck(subscriberId: string): void {
    const health = this.subscriberHealth.get(subscriberId);
    if (!health) return;
    health.lastAckSeq = this.heartbeatSeq;
    health.consecutiveMisses = 0;
  }

  private retainSubscriber(subscriberId: string): void {
    const count = (this.subscriberRefCounts.get(subscriberId) ?? 0) + 1;
    this.subscriberRefCounts.set(subscriberId, count);
    if (count === 1) {
      this.subscriberHealth.set(subscriberId, { lastAckSeq: 0, consecutiveMisses: 0 });
    }
  }

  private releaseSubscriber(subscriberId: string): void {
    const count = (this.subscriberRefCounts.get(subscriberId) ?? 1) - 1;
    if (count <= 0) {
      this.subscriberRefCounts.delete(subscriberId);
      this.subscriberHealth.delete(subscriberId);
      return;
    }
    this.subscriberRefCounts.set(subscriberId, count);
  }

  private logSubscriberStreamError(
    subscriberId: string,
    eventType: BusEventType | "*",
    correlationId: string | undefined,
    err: unknown,
  ): void {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[AgentBus] stream error | subscriber:${subscriberId} | type:${eventType} | corr:${correlationId ?? "n/a"} | ${message}`,
    );
  }

  private logSubscriberHandlerError(
    subscriberId: string,
    event: BusEvent,
    err: unknown,
  ): void {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[AgentBus] handler error | subscriber:${subscriberId} | type:${event.type} | corr:${event.correlationId} | ${message}`,
    );
  }

  private scheduleResubscribe(connect: () => void, destroyed: () => boolean): void {
    if (destroyed()) return;
    queueMicrotask(connect);
  }

  private createResilientSubscription<T>(
    type: BusEventType,
    subscriberId: string,
    handler: (event: BusEvent<T>) => Promise<void> | void,
    options: ResilientSubscriptionOptions = {},
  ): () => void {
    let destroyed = false;
    let subscription: Subscription | undefined;
    const breaker = options.skipBreaker ? null : this.getOrCreateBreaker(subscriberId);

    const connect = (): void => {
      if (destroyed) return;
      subscription?.unsubscribe();

      subscription = this.events$.pipe(
        filter((event) => event.type === type),
        catchError((err) => {
          this.logSubscriberStreamError(subscriberId, type, undefined, err);
          this.scheduleResubscribe(connect, () => destroyed);
          return EMPTY;
        }),
      ).subscribe({
        next: (event) => {
          void (async () => {
            try {
              const runHandler = () => Promise.resolve(handler(event as BusEvent<T>));
              if (breaker) {
                await breaker.execute(runHandler);
              } else {
                await runHandler();
              }
            } catch (err) {
              if (isCircuitBreakerRejection(err)) return;
              this.logSubscriberHandlerError(subscriberId, event, err);
              this.dlq.push(event, err instanceof Error ? err.message : String(err));
            }
          })();
        },
        error: (err) => {
          this.logSubscriberStreamError(subscriberId, type, undefined, err);
          this.scheduleResubscribe(connect, () => destroyed);
        },
      });
    };

    connect();
    return () => {
      destroyed = true;
      subscription?.unsubscribe();
    };
  }

  private createResilientObserve(
    observer: (event: BusEvent) => void,
    subscriberId: string,
  ): () => void {
    let destroyed = false;
    let subscription: Subscription | undefined;

    const connect = (): void => {
      if (destroyed) return;
      subscription?.unsubscribe();

      subscription = this.events$.pipe(
        catchError((err) => {
          this.logSubscriberStreamError(subscriberId, "*", undefined, err);
          this.scheduleResubscribe(connect, () => destroyed);
          return EMPTY;
        }),
      ).subscribe({
        next: (event) => {
          try {
            observer(event);
          } catch (err) {
            this.logSubscriberHandlerError(subscriberId, event, err);
            this.dlq.push(event, err instanceof Error ? err.message : String(err));
          }
        },
        error: (err) => {
          this.logSubscriberStreamError(subscriberId, "*", undefined, err);
          this.scheduleResubscribe(connect, () => destroyed);
        },
      });
    };

    connect();
    return () => {
      destroyed = true;
      subscription?.unsubscribe();
    };
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
