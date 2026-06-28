/**
 * Hybrid computer-use intent classifier (Stage 1 rules + Stage 3 delegated gate).
 *
 * Path 1 SINGLE_ACTION → orchestrator / activate_app
 * Path 2 OBSERVE       → delegated presence (focus + read visible state)
 * Path 3 OPERATE       → computer operator loop
 * NONE                 → normal conversation
 */

import { planFromNaturalLanguage } from "./aletheiaConversationPlanner.ts";
import {
  DELEGATED_APP_ALIASES,
  type DelegatedPresenceIntent,
} from "./aletheiaDelegatedPresence.ts";

export type ComputerUseRoute = "SINGLE_ACTION" | "OBSERVE" | "OPERATE" | "NONE";

export type VerbCluster = "OBSERVE" | "ACT" | "SINGLE_ACTION" | "AMBIGUOUS";

export interface ComputerUseClassification {
  route: ComputerUseRoute | "AMBIGUOUS";
  goal: string;
  targetApp?: string;
  stage: 1 | 3;
  reason: string;
  delegatedIntent?: DelegatedPresenceIntent;
}

const USE_COMPUTER_PATTERNS: RegExp[] = [
  /\b(?:use|on|control|operate)\s+my\s+computer\b/i,
  /\b(?:use|take)\s+the\s+computer\b/i,
];

const DESTRUCTIVE_MARKERS =
  /\b(send|delete|save|write|submit|post|publish|remove|close|quit|erase|format|uninstall|pay|purchase)\b/i;

const SEQUENCE_CONNECTORS =
  /\b(and then|after that|once you find|once you've found|then save|then send)\b|,.*\band\b/i;

const SCROLL_TO_FIND_MARKERS =
  /\b(find the|look for the|locate the|which one is|the unread|unread thread|unread messages)\b/i;

const SCROLL_TO_FIND_MARKERS_EXTRA =
  /\bfirst\s+\w+\s+in\b|\bin the (?:left|right|top|bottom)\b.*\b(?:sidebar|panel|column|list)\b/i;

const OBSERVE_VERBS =
  /\b(tell me|show me|describe|what(?:'s| is) on|what does .+ say|read|look at|report|screenshot)\b/i;

const ACT_VERBS =
  /\b(click|press|tap|type|enter|select|drag|scroll to find|submit|send)\b/i;

const AMBIGUOUS_VERBS =
  /\b(find|get|fetch|go to|navigate to|open and|summarize|analyze|analyse|extract|compare|check)\b/i;

const COMPUTER_TASK_SHAPE =
  /\b(open|go to|find|check|summarize|describe|tell me|click|type|navigate|read|look|slack|figma|notion|chrome|terminal|mail|inbox|unread|screen|window|app)\b/i;

export interface ClassifyComputerUseOptions {
  /** Task-scoped toggle — lower threshold for computer paths; never forces operator loop. */
  useComputerHint?: boolean;
}

const IMPLIED_APP_PATTERNS: Array<{ pattern: RegExp; app: string }> = [
  { pattern: /\b(?:my )?inbox\b|\bunread email\b/i, app: "Mail" },
  { pattern: /\b(?:the )?browser\b|\bin chrome\b/i, app: "Google Chrome" },
  { pattern: /\b(?:the )?terminal\b|\berror in the terminal\b/i, app: "Terminal" },
  { pattern: /\b(?:my )?calendar\b/i, app: "Calendar" },
  { pattern: /\b(?:my )?messages\b|\bimessage\b/i, app: "Messages" },
];

function normalizeAppToken(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const key = trimmed.toLowerCase().replace(/\.$/, "");
  if (DELEGATED_APP_ALIASES[key]) return DELEGATED_APP_ALIASES[key];
  for (const [alias, canonical] of Object.entries(DELEGATED_APP_ALIASES)) {
    if (key === alias || key.startsWith(`${alias} `)) return canonical;
  }
  const titleCase = trimmed
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  return titleCase;
}

export function isExplicitComputerUseRequest(text: string): boolean {
  return USE_COMPUTER_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasDestructiveMarker(text: string): boolean {
  return DESTRUCTIVE_MARKERS.test(text);
}

export function hasSequenceConnector(text: string): boolean {
  return SEQUENCE_CONNECTORS.test(text);
}

export function requiresScrollingToFind(text: string): boolean {
  return SCROLL_TO_FIND_MARKERS.test(text) || SCROLL_TO_FIND_MARKERS_EXTRA.test(text);
}

/** Stage 1 — extract target app from named, implied, or planner hints. */
export function extractAppSignal(text: string, activeApp?: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const goMatch = trimmed.match(
    /\b(?:go to|open|switch to|focus|in)\s+([a-z0-9][\w\s]{0,24}?)(?:\s+and\b|[,.]|$)/i,
  );
  if (goMatch?.[1]) {
    const app = normalizeAppToken(goMatch[1]);
    if (app) return app;
  }

  for (const { pattern, app } of IMPLIED_APP_PATTERNS) {
    if (pattern.test(trimmed)) return app;
  }

  const plan = planFromNaturalLanguage(trimmed);
  if (plan.targetApps.length > 0) {
    return plan.targetApps[0] ?? null;
  }

  if (
    activeApp?.trim()
    && /\b(screen|window|artboard|terminal|error|what(?:'s| is)|describe|tell me)\b/i.test(trimmed)
  ) {
    return normalizeAppToken(activeApp) ?? activeApp;
  }

  return null;
}

export function extractVerbCluster(text: string): VerbCluster {
  const trimmed = text.trim();
  if (extractSingleActionApp(trimmed)) return "SINGLE_ACTION";
  if (ACT_VERBS.test(trimmed)) return "ACT";
  if (OBSERVE_VERBS.test(trimmed) && !AMBIGUOUS_VERBS.test(trimmed)) return "OBSERVE";
  if (AMBIGUOUS_VERBS.test(trimmed)) return "AMBIGUOUS";
  if (OBSERVE_VERBS.test(trimmed)) return "AMBIGUOUS";
  return "AMBIGUOUS";
}

function extractSingleActionApp(text: string): string | null {
  if (hasSequenceConnector(text)) return null;
  if (/\band\b/i.test(text)) return null;
  const match = text.match(
    /^(?:please\s+)?(?:open|close|quit|switch to|focus)\s+(.+?)\.?$/i,
  );
  if (!match?.[1]) return null;
  if (/\b(tell|describe|summarize|what|read|check|and)\b/i.test(match[1])) return null;
  return normalizeAppToken(match[1]);
}

function buildReportQuestion(text: string, targetApp: string): string {
  const stripped = text
    .replace(new RegExp(`\\b(?:go to|open|switch to|focus|in)\\s+${targetApp}\\s*(?:and|,)?\\s*`, "i"), "")
    .trim();
  if (/^tell me\b/i.test(stripped)) return stripped;
  if (/^(check|describe|summarize|report|look at|read)\b/i.test(stripped)) return stripped;
  if (stripped.length > 8) return stripped;
  return `Describe what you see in ${targetApp}`;
}

export function buildDelegatedPresenceIntentFromRequest(
  request: string,
  targetApp: string,
): DelegatedPresenceIntent {
  return {
    targetApp,
    goal: request.trim(),
    reportQuestion: buildReportQuestion(request, targetApp),
    matched: "computer-use-classifier",
  };
}

/** Stage 3 — gate before delegated presence (path 2). */
export function canUseDelegatedPresence(input: {
  request: string;
  targetApp: string;
}): boolean {
  if (hasDestructiveMarker(input.request)) return false;
  if (requiresScrollingToFind(input.request)) return false;
  if (hasSequenceConnector(input.request)) return false;
  return Boolean(input.targetApp.trim());
}

export function appendDelegatedPresenceEscalationHint(report: string): string {
  const trimmed = report.trim();
  if (!trimmed) return trimmed;
  if (/navigate further|take action on screen/i.test(trimmed)) return trimmed;
  return `${trimmed}\n\nIf you want me to navigate further or take action on screen, just say so.`;
}

/** Stage 1 (+ stage 3 for OBSERVE) — no LLM. */
export function classifyComputerUseIntentSync(
  request: string,
  activeApp?: string,
  options?: ClassifyComputerUseOptions,
): ComputerUseClassification {
  const goal = request.trim();
  const useComputerHint = options?.useComputerHint === true;
  if (!goal) {
    return { route: "NONE", goal, stage: 1, reason: "empty" };
  }

  if (isExplicitComputerUseRequest(goal)) {
    return { route: "OPERATE", goal, stage: 1, reason: "explicit-computer-use" };
  }

  let targetApp = extractAppSignal(goal, activeApp);
  if (!targetApp && useComputerHint && activeApp?.trim() && COMPUTER_TASK_SHAPE.test(goal)) {
    targetApp = normalizeAppToken(activeApp) ?? activeApp.trim();
  }
  if (!targetApp) {
    return { route: "NONE", goal, stage: 1, reason: "no-app-signal" };
  }

  const verbCluster = extractVerbCluster(goal);
  const destructive = hasDestructiveMarker(goal);
  const sequence = hasSequenceConnector(goal);
  const findNav = requiresScrollingToFind(goal);

  if (verbCluster === "SINGLE_ACTION") {
    const singleApp = extractSingleActionApp(goal) ?? targetApp;
    return {
      route: "SINGLE_ACTION",
      goal,
      targetApp: singleApp,
      stage: 1,
      reason: "single-action",
    };
  }

  if (destructive || verbCluster === "ACT" || sequence || findNav) {
    return {
      route: "OPERATE",
      goal,
      targetApp,
      stage: 1,
      reason: destructive
        ? "destructive-marker"
        : verbCluster === "ACT"
          ? "act-verb"
          : sequence
            ? "sequence-connector"
            : "scroll-to-find",
    };
  }

  if (verbCluster === "OBSERVE") {
    if (!canUseDelegatedPresence({ request: goal, targetApp })) {
      return {
        route: "OPERATE",
        goal,
        targetApp,
        stage: 3,
        reason: "observe-blocked-by-gate",
      };
    }
    return {
      route: "OBSERVE",
      goal,
      targetApp,
      stage: 3,
      reason: "observe-verb",
      delegatedIntent: buildDelegatedPresenceIntentFromRequest(goal, targetApp),
    };
  }

  if (useComputerHint) {
    return {
      route: "AMBIGUOUS",
      goal,
      targetApp,
      stage: 1,
      reason: "use-computer-hint",
    };
  }

  return {
    route: "AMBIGUOUS",
    goal,
    targetApp,
    stage: 1,
    reason: "ambiguous-verb",
  };
}

export function resolveAmbiguousComputerUseRoute(
  llmAnswer: "OBSERVE" | "OPERATE",
  sync: ComputerUseClassification,
): ComputerUseClassification {
  if (llmAnswer === "OPERATE" || !sync.targetApp) {
    return {
      route: "OPERATE",
      goal: sync.goal,
      targetApp: sync.targetApp,
      stage: 1,
      reason: "haiku-operate",
    };
  }
  if (!canUseDelegatedPresence({ request: sync.goal, targetApp: sync.targetApp })) {
    return {
      route: "OPERATE",
      goal: sync.goal,
      targetApp: sync.targetApp,
      stage: 3,
      reason: "haiku-observe-blocked",
    };
  }
  return {
    route: "OBSERVE",
    goal: sync.goal,
    targetApp: sync.targetApp,
    stage: 3,
    reason: "haiku-observe",
    delegatedIntent: buildDelegatedPresenceIntentFromRequest(sync.goal, sync.targetApp),
  };
}
