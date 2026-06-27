/**
 * Aletheia agent coordinator (B3.1).
 *
 * Routes companion coordination intents through council / research / writing
 * without exposing individual agent names in the user-facing surface.
 */

import { randomUUID } from "node:crypto";

export type CoordinationRoute = "council" | "research" | "writing" | "research_then_write";

export type AgentActivityPhase =
  | "idle"
  | "routing"
  | "running"
  | "synthesizing"
  | "complete"
  | "failed";

export type AgentActivityStepStatus = "pending" | "running" | "done" | "failed";

export interface AgentActivityStep {
  id: string;
  label: string;
  status: AgentActivityStepStatus;
  detail?: string;
  updatedAt: number;
}

export interface AletheiaAgentActivitySnapshot {
  coordinationId: string;
  route: CoordinationRoute;
  phase: AgentActivityPhase;
  prompt: string;
  steps: AgentActivityStep[];
  unifiedAnswer?: string;
  errorMessage?: string;
  correlationId?: string;
  startedAt: number;
  updatedAt: number;
}

export interface CoordinationIntent {
  route: CoordinationRoute;
  prompt: string;
  matched: string;
}

const RESEARCH_THEN_WRITE_PATTERNS: RegExp[] = [
  /\b(research .{4,80} (and|then) (write|draft))\b/i,
  /\b(look .{4,80} up .{0,40} (and|then) (write|draft))\b/i,
  /\b(find .{4,80} (and|then) (write|draft))\b/i,
];

const COUNCIL_PATTERNS: RegExp[] = [
  /\b(figure out|work out|help me decide|weigh the options|compare (these )?options)\b/i,
  /\b(what('s| is) the best (approach|way forward|strategy|path|option))\b/i,
  /\b(best approach|run (this )?through council|think this through|deliberate on)\b/i,
  /\b(what should (we|I) do)\b/i,
];

const RESEARCH_PATTERNS: RegExp[] = [
  /\b(research|look (this )?up|find out about|find the latest|go verify|verify that)\b/i,
  /\b(what do we know about|check the web|search for)\b/i,
];

const WRITING_PATTERNS: RegExp[] = [
  /\b(write me|draft me|help me write|compose (a|an|me))\b/i,
  /\b(write (a|an) .{4,80})\b/i,
  /\b(draft (a|an) .{4,80})\b/i,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}

export function classifyCoordinationIntent(text: string): CoordinationIntent | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 8) return null;

  const researchWrite = firstMatch(trimmed, RESEARCH_THEN_WRITE_PATTERNS);
  if (researchWrite) {
    return { route: "research_then_write", prompt: trimmed, matched: researchWrite };
  }

  const council = firstMatch(trimmed, COUNCIL_PATTERNS);
  if (council) {
    return { route: "council", prompt: trimmed, matched: council };
  }

  const research = firstMatch(trimmed, RESEARCH_PATTERNS);
  if (research) {
    return { route: "research", prompt: trimmed, matched: research };
  }

  const writing = firstMatch(trimmed, WRITING_PATTERNS);
  if (writing) {
    return { route: "writing", prompt: trimmed, matched: writing };
  }

  return null;
}

export function coordinationRouteNarration(route: CoordinationRoute): string {
  switch (route) {
    case "council":
      return "I'll work through the options and bring you one clear answer.";
    case "research":
      return "I'll check that and come back with what I find.";
    case "writing":
      return "I'll draft that for you.";
    case "research_then_write":
      return "I'll research it first, then draft something from what I find.";
    default:
      return "I'll work on that for you.";
  }
}

export function stepLabelsForRoute(route: CoordinationRoute): string[] {
  switch (route) {
    case "council":
      return ["Planning approach", "Stress-testing the plan", "Synthesizing answer"];
    case "research":
      return ["Checking sources"];
    case "writing":
      return ["Drafting"];
    case "research_then_write":
      return ["Checking sources", "Drafting from findings"];
    default:
      return ["Working"];
  }
}

export function initialAgentActivitySnapshot(
  route: CoordinationRoute,
  prompt: string,
  now = Date.now(),
): AletheiaAgentActivitySnapshot {
  const labels = stepLabelsForRoute(route);
  return {
    coordinationId: randomUUID(),
    route,
    phase: "routing",
    prompt,
    steps: labels.map((label, index) => ({
      id: `step-${index + 1}`,
      label,
      status: index === 0 ? "running" : "pending",
      updatedAt: now,
    })),
    startedAt: now,
    updatedAt: now,
  };
}

export function markAgentActivityPhase(
  snapshot: AletheiaAgentActivitySnapshot,
  phase: AgentActivityPhase,
  now = Date.now(),
): AletheiaAgentActivitySnapshot {
  return { ...snapshot, phase, updatedAt: now };
}

export function updateAgentActivityStep(
  snapshot: AletheiaAgentActivitySnapshot,
  stepId: string,
  patch: Partial<Pick<AgentActivityStep, "status" | "detail">>,
  now = Date.now(),
): AletheiaAgentActivitySnapshot {
  const steps = snapshot.steps.map((step) => {
    if (step.id !== stepId) return step;
    return {
      ...step,
      ...patch,
      updatedAt: now,
    };
  });
  return { ...snapshot, steps, updatedAt: now };
}

export function advanceAgentActivityStep(
  snapshot: AletheiaAgentActivitySnapshot,
  completedStepId: string,
  nextStepId?: string,
  now = Date.now(),
): AletheiaAgentActivitySnapshot {
  let next = updateAgentActivityStep(snapshot, completedStepId, { status: "done" }, now);
  if (nextStepId) {
    next = updateAgentActivityStep(next, nextStepId, { status: "running" }, now);
  }
  return next;
}

export function finalizeAgentActivity(
  snapshot: AletheiaAgentActivitySnapshot,
  input: { ok: boolean; answer?: string; errorMessage?: string },
  now = Date.now(),
): AletheiaAgentActivitySnapshot {
  const steps = snapshot.steps.map((step) => ({
    ...step,
    status: step.status === "failed" ? "failed" : "done" as AgentActivityStepStatus,
    updatedAt: now,
  }));
  return {
    ...snapshot,
    steps,
    phase: input.ok ? "complete" : "failed",
    unifiedAnswer: input.answer,
    errorMessage: input.errorMessage,
    updatedAt: now,
  };
}

export function agentActivitySnapshotsEqual(
  a: AletheiaAgentActivitySnapshot | undefined,
  b: AletheiaAgentActivitySnapshot | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.coordinationId === b.coordinationId
    && a.phase === b.phase
    && a.route === b.route
    && a.prompt === b.prompt
    && a.unifiedAnswer === b.unifiedAnswer
    && a.errorMessage === b.errorMessage
    && a.correlationId === b.correlationId
    && a.steps.length === b.steps.length
    && a.steps.every((step, index) => {
      const other = b.steps[index];
      return (
        step.id === other.id
        && step.label === other.label
        && step.status === other.status
        && step.detail === other.detail
      );
    })
  );
}

export function councilStepIdForRole(role: "strategy" | "critic" | "judge"): string {
  switch (role) {
    case "strategy":
      return "step-1";
    case "critic":
      return "step-2";
    case "judge":
      return "step-3";
    default:
      return "step-1";
  }
}

export function councilRoleLabel(role: "strategy" | "critic" | "judge"): string {
  switch (role) {
    case "strategy":
      return "Planning approach";
    case "critic":
      return "Stress-testing the plan";
    case "judge":
      return "Synthesizing answer";
    default:
      return "Working";
  }
}
