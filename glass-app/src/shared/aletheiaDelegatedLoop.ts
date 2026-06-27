/**
 * Aletheia general delegated loop (B3.3).
 *
 * Multi-step work across apps with a live human narrative and clean handoff.
 */

import { randomUUID } from "node:crypto";
import { DELEGATED_APP_ALIASES } from "./aletheiaDelegatedPresence.ts";

export type DelegatedLoopPhase =
  | "planning"
  | "running"
  | "awaiting_decision"
  | "complete"
  | "failed"
  | "cancelled";

export type DelegatedLoopStepKind =
  | "research"
  | "focus_observe"
  | "observe_context"
  | "writing"
  | "handoff";

export type DelegatedLoopStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface DelegatedLoopStepPlan {
  id: string;
  kind: DelegatedLoopStepKind;
  label: string;
  prompt: string;
  targetApp?: string;
  reportQuestion?: string;
}

export interface LoopNarrativeRow {
  id: string;
  sentence: string;
  stepIndex: number;
  createdAt: number;
}

export interface DelegatedLoopHandoff {
  completed: string;
  remaining: string;
  needsFromYou?: string;
}

export interface AletheiaDelegatedLoopSnapshot {
  loopId: string;
  phase: DelegatedLoopPhase;
  goal: string;
  steps: Array<DelegatedLoopStepPlan & { status: DelegatedLoopStepStatus; result?: string }>;
  narrative: LoopNarrativeRow[];
  currentStepIndex: number;
  handoff?: DelegatedLoopHandoff;
  pendingDecision?: { question: string; stepId: string };
  errorMessage?: string;
  startedAt: number;
  updatedAt: number;
}

export interface DelegatedLoopIntent {
  goal: string;
  matched: string;
}

const LOOP_INTENT_PATTERNS: RegExp[] = [
  /\b(work through .{8,120}( for me| and report back))\b/i,
  /\b(handle .{8,120} end to end)\b/i,
  /\b(step away while (you|aletheia) .{8,80})\b/i,
  /\b(run (a |this )?loop (on|through|for) .{8,80})\b/i,
  /\b(take care of .{12,120} across (apps|everything))\b/i,
  /\b(multi[- ]step: .{8,120})\b/i,
];

const DECISION_HINT_PATTERN = /\b(if you('| a)re stuck|choose between|which (one|option)|decide whether)\b/i;

export function classifyDelegatedLoopIntent(text: string): DelegatedLoopIntent | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 16) return null;

  for (const pattern of LOOP_INTENT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[0]) {
      return { goal: trimmed, matched: match[0] };
    }
  }

  return null;
}

export function delegatedLoopIntroSpeech(): string {
  return "I'll work through that step by step and keep you posted.";
}

export function isDelegatedLoopRunning(
  snapshot: AletheiaDelegatedLoopSnapshot | undefined,
): boolean {
  if (!snapshot) return false;
  return snapshot.phase === "planning"
    || snapshot.phase === "running"
    || snapshot.phase === "awaiting_decision";
}

export function buildDelegatedLoopPlan(goal: string): DelegatedLoopStepPlan[] {
  const lower = goal.toLowerCase();
  const steps: DelegatedLoopStepPlan[] = [];
  let stepNum = 0;

  const pushStep = (partial: Omit<DelegatedLoopStepPlan, "id">): void => {
    stepNum += 1;
    steps.push({ id: `step-${stepNum}`, ...partial });
  };

  if (/\b(research|look up|find out|verify)\b/i.test(goal)) {
    pushStep({
      kind: "research",
      label: "Checking sources",
      prompt: goal,
    });
  }

  const mentionedApps = new Set<string>();
  for (const [alias, app] of Object.entries(DELEGATED_APP_ALIASES)) {
    if (!lower.includes(alias) || mentionedApps.has(app)) continue;
    mentionedApps.add(app);
    pushStep({
      kind: "focus_observe",
      label: `Looking at ${app}`,
      prompt: goal,
      targetApp: app,
      reportQuestion: `What's relevant in ${app} for this goal: ${goal}`,
    });
  }

  if (/\b(write|draft|document|memo)\b/i.test(goal)) {
    pushStep({
      kind: "writing",
      label: "Drafting from what I found",
      prompt: goal,
    });
  }

  if (steps.length === 0) {
    pushStep({
      kind: "observe_context",
      label: "Reading your current screen context",
      prompt: goal,
      reportQuestion: goal,
    });
  }

  if (DECISION_HINT_PATTERN.test(goal)) {
    pushStep({
      kind: "observe_context",
      label: "Checking whether I need your input",
      prompt: goal,
      reportQuestion: `Do you need a decision from the user to continue? Goal: ${goal}`,
    });
  }

  pushStep({
    kind: "handoff",
    label: "Preparing your handoff",
    prompt: goal,
  });

  return steps.slice(0, 6);
}

export function initialDelegatedLoopSnapshot(
  goal: string,
  plan: DelegatedLoopStepPlan[],
  now = Date.now(),
): AletheiaDelegatedLoopSnapshot {
  return {
    loopId: randomUUID(),
    phase: "planning",
    goal,
    steps: plan.map((step) => ({ ...step, status: "pending" as const })),
    narrative: [],
    currentStepIndex: 0,
    startedAt: now,
    updatedAt: now,
  };
}

export function appendLoopNarrative(
  snapshot: AletheiaDelegatedLoopSnapshot,
  sentence: string,
  stepIndex: number,
  now = Date.now(),
): AletheiaDelegatedLoopSnapshot {
  return {
    ...snapshot,
    narrative: [
      ...snapshot.narrative,
      { id: randomUUID(), sentence, stepIndex, createdAt: now },
    ],
    updatedAt: now,
  };
}

export function markLoopPhase(
  snapshot: AletheiaDelegatedLoopSnapshot,
  phase: DelegatedLoopPhase,
  patch?: Partial<
    Pick<AletheiaDelegatedLoopSnapshot, "handoff" | "pendingDecision" | "errorMessage" | "currentStepIndex">
  >,
  now = Date.now(),
): AletheiaDelegatedLoopSnapshot {
  return { ...snapshot, phase, ...patch, updatedAt: now };
}

export function updateLoopStep(
  snapshot: AletheiaDelegatedLoopSnapshot,
  stepId: string,
  patch: Partial<{ status: DelegatedLoopStepStatus; result?: string }>,
  now = Date.now(),
): AletheiaDelegatedLoopSnapshot {
  const steps = snapshot.steps.map((step) =>
    step.id === stepId ? { ...step, ...patch } : step,
  );
  return { ...snapshot, steps, updatedAt: now };
}

export function narrativeForStepStart(step: DelegatedLoopStepPlan): string {
  switch (step.kind) {
    case "research":
      return "I'm checking sources for that now.";
    case "focus_observe":
      return `I'm switching to ${step.targetApp ?? "the app"} to see what's there.`;
    case "observe_context":
      return "I'm reading what's on your screen.";
    case "writing":
      return "I'm drafting from what I've gathered.";
    case "handoff":
      return "I'm putting together what I did and what's left.";
    default:
      return "Working on the next step.";
  }
}

export function buildDelegatedLoopHandoff(
  snapshot: AletheiaDelegatedLoopSnapshot,
): DelegatedLoopHandoff {
  const completedSteps = snapshot.steps.filter((s) => s.status === "done" && s.kind !== "handoff");
  const failedSteps = snapshot.steps.filter((s) => s.status === "failed");
  const skipped = snapshot.steps.filter((s) => s.status === "skipped");

  const completedParts = completedSteps.map((s) => {
    const excerpt = s.result?.trim();
    if (!excerpt) return s.label;
    const short = excerpt.length > 120 ? `${excerpt.slice(0, 117)}…` : excerpt;
    return `${s.label}: ${short}`;
  });

  const completed =
    completedParts.length > 0
      ? completedParts.join(" ")
      : "I started the loop but didn't finish any steps.";

  const remainingParts: string[] = [];
  if (failedSteps.length > 0) {
    remainingParts.push(`Failed: ${failedSteps.map((s) => s.label).join(", ")}.`);
  }
  const pending = snapshot.steps.filter((s) => s.status === "pending" || s.status === "running");
  if (pending.length > 0) {
    remainingParts.push(`Still pending: ${pending.map((s) => s.label).join(", ")}.`);
  }
  if (skipped.length > 0) {
    remainingParts.push(`Skipped: ${skipped.map((s) => s.label).join(", ")}.`);
  }

  const remaining =
    remainingParts.length > 0 ? remainingParts.join(" ") : "Nothing left — the loop finished.";

  let needsFromYou: string | undefined;
  if (snapshot.pendingDecision?.question) {
    needsFromYou = snapshot.pendingDecision.question;
  } else if (failedSteps.some((s) => s.kind === "focus_observe")) {
    needsFromYou = "I couldn't reach one of the apps — check Accessibility permission or tell me to retry.";
  } else if (DECISION_HINT_PATTERN.test(snapshot.goal)) {
    needsFromYou = "Tell me which direction you prefer and I can continue.";
  }

  return { completed, remaining, needsFromYou };
}

export function formatDelegatedLoopHandoffSpeech(handoff: DelegatedLoopHandoff): string {
  const parts = [handoff.completed];
  if (handoff.remaining && !handoff.remaining.startsWith("Nothing left")) {
    parts.push(handoff.remaining);
  }
  if (handoff.needsFromYou) {
    parts.push(handoff.needsFromYou);
  }
  return parts.join(" ");
}

export function resolveVoiceLoopDecision(
  text: string,
  snapshot: AletheiaDelegatedLoopSnapshot | undefined,
): "continue" | "cancel" | null {
  if (!snapshot || snapshot.phase !== "awaiting_decision") return null;
  const trimmed = text.trim();
  if (/^(yes|yeah|yep|continue|go ahead|keep going|proceed)\b/i.test(trimmed)) return "continue";
  if (/^(no|nope|stop|cancel|never mind|nevermind)\b/i.test(trimmed)) return "cancel";
  return null;
}
