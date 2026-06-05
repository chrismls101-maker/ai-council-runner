/**
 * Session Copilot — orchestration state machine.
 *
 * Pure (no electron / fs / timers): the main process owns the interval timer
 * and side effects (AI calls, push, moments) and drives this controller via
 * `tick()` and `resolveIntervention()`. Keeping orchestration here makes the
 * "doesn't start on launch / only runs in active session / dedupe / decisions"
 * rules directly unit-testable.
 */

import type { GlassSession, GlassSessionEvent } from "./sessionTypes.ts";
import {
  DEFAULT_COPILOT_CONFIG,
  copilotModeIsActive,
  type GlassCopilotConfig,
  type GlassCopilotDebrief,
  type GlassCopilotInsight,
  type GlassCopilotIntervention,
  type GlassCopilotOffer,
  type GlassCopilotCardAction,
  type GlassCopilotRuntimeState,
} from "./copilotTypes.ts";
import { extractCopilotInsights, dedupeCopilotInsights } from "./copilotEngine.ts";
import {
  MIN_INTERVENTION_GAP_MS,
  buildDiagnoseOfferIntervention,
  buildInterventionForInsight,
  pickInterventionInsight,
} from "./copilotInterruption.ts";
import { detectStuckSignal } from "./copilotDiagnostic.ts";
import {
  resolveSessionType,
  type GlassCopilotSessionType,
} from "./copilotSessionType.ts";

const MAX_RECENT_SHOWN = 12;
/** After this many dismissals in a row, the governor backs off (slows down). */
const DISMISS_BACKOFF_THRESHOLD = 2;
const DISMISS_BACKOFF_MULTIPLIER = 3;

export interface CopilotControllerDeps {
  idFactory: () => string;
  clock: () => string;
  now: () => number;
}

export interface CopilotTickInput {
  sessionLive: boolean;
  session: GlassSession | null;
  /** Full running transcript (controller tracks its own watermark). */
  transcript: string;
  recentCommands: string[];
  recentResponses: string[];
  sourceApp?: string;
  sourceTitle?: string;
  systemAudioActive: boolean;
  /** Epoch ms of the last detected system-audio signal (undefined if never). */
  systemAudioLastSignalMs?: number;
  visualAskFailureCount?: number;
}

export interface CopilotTickResult {
  ran: boolean;
  reason?: string;
  newInsights: GlassCopilotInsight[];
  intervention: GlassCopilotIntervention | null;
  systemAudioSilenceWarning: boolean;
}

export type CopilotEffect =
  | "none"
  | "cursor_prompt"
  | "action_steps"
  | "save"
  | "diagnose"
  | "show-summary"
  | "later"
  | "dismiss";

export interface CopilotResolution {
  intervention: GlassCopilotIntervention | null;
  insight: GlassCopilotInsight | null;
  effect: CopilotEffect;
}

export class SessionCopilotController {
  private config: GlassCopilotConfig;
  private readonly deps: CopilotControllerDeps;

  private insights: GlassCopilotInsight[] = [];
  private interventions: GlassCopilotIntervention[] = [];
  private debrief: GlassCopilotDebrief | null = null;
  private offer: GlassCopilotOffer | null = null;

  private processedTranscriptLength = 0;
  private processedEventId: string | null = null;
  private lastInterventionMs: number | undefined;
  private lastRunAt: string | undefined;
  private recentShownTexts: string[] = [];
  private systemAudioSilenceWarning = false;
  private boundSessionId: string | null = null;
  private consecutiveDismissals = 0;
  private currentSessionType: GlassCopilotSessionType = "general_workflow";

  constructor(deps: CopilotControllerDeps, config: GlassCopilotConfig = DEFAULT_COPILOT_CONFIG) {
    this.deps = deps;
    this.config = config;
  }

  getConfig(): GlassCopilotConfig {
    return this.config;
  }

  setConfig(config: GlassCopilotConfig): void {
    this.config = config;
  }

  getInsights(): GlassCopilotInsight[] {
    return this.insights;
  }

  getInterventions(): GlassCopilotIntervention[] {
    return this.interventions;
  }

  getDebrief(): GlassCopilotDebrief | null {
    return this.debrief;
  }

  setDebrief(debrief: GlassCopilotDebrief | null): void {
    this.debrief = debrief;
  }

  getOffer(): GlassCopilotOffer | null {
    return this.offer;
  }

  setOffer(offer: GlassCopilotOffer | null): void {
    this.offer = offer;
  }

  /** Reset per-session state (called when a new session starts). */
  bindSession(sessionId: string | null): void {
    if (this.boundSessionId === sessionId) return;
    this.boundSessionId = sessionId;
    this.insights = [];
    this.interventions = [];
    this.debrief = null;
    this.offer = null;
    this.processedTranscriptLength = 0;
    this.processedEventId = null;
    this.lastInterventionMs = undefined;
    this.lastRunAt = undefined;
    this.recentShownTexts = [];
    this.systemAudioSilenceWarning = false;
    this.consecutiveDismissals = 0;
    this.currentSessionType = "general_workflow";
  }

  /** Effective minimum gap, widened when the user keeps dismissing. */
  private effectiveGapMs(): number {
    return this.consecutiveDismissals >= DISMISS_BACKOFF_THRESHOLD
      ? MIN_INTERVENTION_GAP_MS * DISMISS_BACKOFF_MULTIPLIER
      : MIN_INTERVENTION_GAP_MS;
  }

  getSessionType(): GlassCopilotSessionType {
    return this.currentSessionType;
  }

  /** Restore previously persisted copilot data for a session. */
  hydrate(sessionId: string, data: {
    insights?: GlassCopilotInsight[];
    interventions?: GlassCopilotIntervention[];
    debrief?: GlassCopilotDebrief | null;
  }): void {
    this.boundSessionId = sessionId;
    this.insights = data.insights ?? [];
    this.interventions = data.interventions ?? [];
    this.debrief = data.debrief ?? null;
  }

  private newEventsSince(events: GlassSessionEvent[]): GlassSessionEvent[] {
    if (!this.processedEventId) return events;
    const idx = events.findIndex((e) => e.id === this.processedEventId);
    return idx >= 0 ? events.slice(idx + 1) : events;
  }

  private remember(text: string): void {
    this.recentShownTexts.unshift(text);
    if (this.recentShownTexts.length > MAX_RECENT_SHOWN) {
      this.recentShownTexts.length = MAX_RECENT_SHOWN;
    }
  }

  private silenceWarningActive(input: CopilotTickInput): boolean {
    if (!input.systemAudioActive) return false;
    if (input.systemAudioLastSignalMs == null) return false;
    const elapsed = this.deps.now() - input.systemAudioLastSignalMs;
    return elapsed >= this.config.silenceTimeoutMin * 60_000;
  }

  /**
   * Run one extraction/intervention cycle. No-op (ran:false) unless a session
   * is live AND mode is active AND there is new context.
   */
  tick(input: CopilotTickInput): CopilotTickResult {
    const empty: CopilotTickResult = {
      ran: false,
      newInsights: [],
      intervention: null,
      systemAudioSilenceWarning: this.systemAudioSilenceWarning,
    };

    if (!input.sessionLive || !input.session) {
      return { ...empty, reason: "no-active-session" };
    }
    if (!copilotModeIsActive(this.config.mode)) {
      return { ...empty, reason: "mode-off" };
    }

    this.systemAudioSilenceWarning = this.silenceWarningActive(input);

    this.currentSessionType = resolveSessionType(this.config.sessionType, {
      appName: input.sourceApp,
      windowTitle: input.sourceTitle,
      transcript: input.transcript,
      recentCommands: input.recentCommands,
    });

    const newTranscript = input.transcript.slice(this.processedTranscriptLength);
    const newEvents = this.newEventsSince(input.session.events);

    const extractionInput = {
      newTranscript,
      newEvents,
      recentCommands: input.recentCommands,
      recentResponses: input.recentResponses,
      sourceApp: input.sourceApp,
      sourceTitle: input.sourceTitle,
    };

    // Advance watermarks regardless (we've now seen this context).
    this.processedTranscriptLength = input.transcript.length;
    if (input.session.events.length > 0) {
      this.processedEventId = input.session.events[input.session.events.length - 1].id;
    }
    this.lastRunAt = this.deps.clock();

    const candidates = extractCopilotInsights(extractionInput, {
      idFactory: this.deps.idFactory,
      clock: this.deps.clock,
    });
    const fresh = dedupeCopilotInsights(this.insights, candidates);
    this.insights.push(...fresh);

    let intervention: GlassCopilotIntervention | null = null;

    // Coaching/diagnostic: maybe surface one high-value insight card.
    const ctx = {
      config: this.config,
      nowMs: this.deps.now(),
      lastInterventionMs: this.lastInterventionMs,
      recentShownTexts: this.recentShownTexts,
      minGapMs: this.effectiveGapMs(),
    };
    const picked = pickInterventionInsight(fresh, ctx);
    if (picked) {
      intervention = buildInterventionForInsight(picked, this.deps, {
        sessionType: this.currentSessionType,
        appName: input.sourceApp,
      });
      this.lastInterventionMs = this.deps.now();
      this.remember(picked.text);
    }

    // Diagnostic mode: offer a diagnosis on a stuck/error signal (if no card yet).
    if (!intervention && this.config.mode === "diagnostic" && !this.config.muteSuggestions && this.config.showOverlaySuggestions) {
      const gapOk = this.lastInterventionMs == null || this.deps.now() - this.lastInterventionMs >= this.effectiveGapMs();
      if (gapOk) {
        const signal = detectStuckSignal({
          events: newEvents,
          recentCommands: input.recentCommands,
          visualAskFailureCount: input.visualAskFailureCount,
        });
        if (signal.stuck && signal.reason && !this.recentShownTexts.some((t) => t === signal.reason)) {
          intervention = buildDiagnoseOfferIntervention(signal.reason, this.deps);
          this.lastInterventionMs = this.deps.now();
          this.remember(signal.reason);
        }
      }
    }

    if (intervention) this.interventions.push(intervention);

    return {
      ran: true,
      newInsights: fresh,
      intervention,
      systemAudioSilenceWarning: this.systemAudioSilenceWarning,
    };
  }

  /** Apply a user's card decision; returns the effect for main to execute. */
  resolveIntervention(id: string, action: GlassCopilotCardAction): CopilotResolution {
    const intervention = this.interventions.find((i) => i.id === id) ?? null;
    if (!intervention) return { intervention: null, insight: null, effect: "none" };

    intervention.resolvedAction = action;
    intervention.resolvedAt = this.deps.clock();

    const insight = intervention.insightId
      ? this.insights.find((i) => i.id === intervention.insightId) ?? null
      : null;

    let effect: CopilotEffect = "none";
    switch (action) {
      case "yes":
        if (insight) insight.userDecision = "accepted";
        effect = intervention.kind === "cursor_prompt" ? "cursor_prompt" : "save";
        break;
      case "create-prompt":
        if (insight) insight.userDecision = "accepted";
        effect = "cursor_prompt";
        break;
      case "turn-into-action":
        if (insight) insight.userDecision = "accepted";
        effect = "action_steps";
        break;
      case "save":
        if (insight) insight.userDecision = "saved";
        effect = "save";
        break;
      case "diagnose":
        if (insight) insight.userDecision = "accepted";
        effect = "diagnose";
        break;
      case "show-summary":
        effect = "show-summary";
        break;
      case "later":
        if (insight) insight.userDecision = "later";
        effect = "later";
        break;
      case "no":
      case "dismiss":
        if (insight) insight.userDecision = "dismissed";
        effect = "dismiss";
        break;
      default:
        effect = "none";
    }

    // Governor: track dismissal streak to back off; any acceptance restores.
    if (action === "dismiss" || action === "no") {
      this.consecutiveDismissals += 1;
    } else if (
      action === "yes" ||
      action === "save" ||
      action === "diagnose" ||
      action === "create-prompt" ||
      action === "turn-into-action"
    ) {
      this.consecutiveDismissals = 0;
    }

    return { intervention, insight, effect };
  }

  /** Remove an intervention from the pending list (after it is resolved/expired). */
  clearIntervention(id: string): void {
    this.interventions = this.interventions.filter((i) => i.id !== id);
  }

  pendingInterventions(): GlassCopilotIntervention[] {
    return this.interventions.filter((i) => !i.resolvedAt);
  }

  /** Build the renderer-facing runtime snapshot. */
  runtimeState(sessionLive: boolean): GlassCopilotRuntimeState {
    return {
      mode: this.config.mode,
      config: this.config,
      active: sessionLive && copilotModeIsActive(this.config.mode),
      muted: this.config.muteSuggestions,
      pendingInterventions: this.pendingInterventions(),
      insightCount: this.insights.length,
      lastRunAt: this.lastRunAt,
      lastInterventionAt: this.lastInterventionMs
        ? new Date(this.lastInterventionMs).toISOString()
        : undefined,
      debrief: this.debrief,
      offer: this.offer,
      systemAudioSilenceWarning: this.systemAudioSilenceWarning,
      sessionType: this.currentSessionType,
      debriefReady: this.debrief != null,
      consecutiveDismissals: this.consecutiveDismissals,
      listeningLimitReached: false,
    };
  }

  /** Snapshot for persistence onto the session. */
  sessionData(): { insights: GlassCopilotInsight[]; interventions: GlassCopilotIntervention[]; debrief: GlassCopilotDebrief | null } {
    return {
      insights: this.insights,
      interventions: this.interventions,
      debrief: this.debrief,
    };
  }
}
