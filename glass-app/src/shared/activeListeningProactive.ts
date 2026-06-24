/**
 * Active Listening — non-annoying proactive moment detection.
 *
 * Surfaces high-value cards only (objections, action items, excited user cues).
 * Respects cooldown, mute, and passive mode (silent capture).
 */

import type { GlassCopilotConfig } from "./copilotTypes.ts";
import type { GlassCopilotIntervention } from "./copilotTypes.ts";
import {
  ACTIVE_LISTENING_PROACTIVE_COOLDOWN_MS,
  type ActiveListeningProactiveKind,
  type ActiveListeningProactiveMoment,
} from "./activeListeningTypes.ts";
import { isDuplicateText } from "./sessionIntelligence.ts";

const EXCITED_PATTERNS = [/\bwow\b/i, /\binteresting\b/i, /\bsave that\b/i, /\bthat'?s cool\b/i];
const OBJECTION_SNIPPET = /\b(too expensive|pricing|budget|not sure|concern|security|competitor)\b/i;
const ACTION_SNIPPET = /\b(action item|owner|deadline|follow up|next step|we need to|should)\b/i;
const DECISION_SNIPPET = /\b(decided|decision|agreed|let'?s go with|approved)\b/i;
const FRAMEWORK_SNIPPET = /\b(framework|model|process|method|step \d|phase \d)\b/i;
const TOOL_SNIPPET = /\b(cursor|github|figma|notion|slack|zoom|hubspot|salesforce)\b/i;
const CONFUSION_SNIPPET = /\b(stuck|confused|doesn'?t work|failed|error|again)\b/i;

export interface ProactiveDetectionInput {
  newTranscript: string;
  recentCommands?: string[];
  copilotConfig: GlassCopilotConfig;
  nowMs: number;
  lastProactiveMs?: number;
  recentShownTexts?: string[];
}

function shortExcerpt(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function detectMoments(text: string, recentCommands: string[] = []): ActiveListeningProactiveMoment[] {
  const moments: ActiveListeningProactiveMoment[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

  for (const sentence of sentences.slice(-6)) {
    if (OBJECTION_SNIPPET.test(sentence)) {
      moments.push({ kind: "customer_objection", title: "Customer objection detected", excerpt: sentence, importance: "high" });
    }
    if (ACTION_SNIPPET.test(sentence)) {
      moments.push({ kind: "action_item", title: "Possible action item", excerpt: sentence, importance: "high" });
    }
    if (DECISION_SNIPPET.test(sentence)) {
      moments.push({ kind: "decision_made", title: "Decision mentioned", excerpt: sentence, importance: "high" });
    }
    if (FRAMEWORK_SNIPPET.test(sentence)) {
      moments.push({ kind: "useful_framework", title: "Framework or process mentioned", excerpt: sentence, importance: "medium" });
    }
    if (TOOL_SNIPPET.test(sentence)) {
      moments.push({ kind: "tool_mentioned", title: "Tool or platform mentioned", excerpt: sentence, importance: "medium" });
    }
    if (CONFUSION_SNIPPET.test(sentence)) {
      moments.push({ kind: "repeated_confusion", title: "Repeated issue or confusion", excerpt: sentence, importance: "high" });
    }
    if (/\b(important|key idea|takeaway|remember)\b/i.test(sentence)) {
      moments.push({ kind: "important_idea", title: "Important idea", excerpt: sentence, importance: "high" });
    }
  }

  for (const cmd of recentCommands.slice(-3)) {
    if (EXCITED_PATTERNS.some((re) => re.test(cmd))) {
      moments.push({ kind: "user_excited", title: "You sounded interested", excerpt: cmd, importance: "high" });
    }
  }

  return moments;
}

const PROACTIVE_RANK: Record<ActiveListeningProactiveKind, number> = {
  customer_objection: 8,
  user_excited: 7,
  action_item: 6,
  decision_made: 6,
  important_idea: 5,
  repeated_confusion: 5,
  useful_framework: 4,
  tool_mentioned: 3,
};

export function pickActiveListeningProactiveMoment(input: ProactiveDetectionInput): ActiveListeningProactiveMoment | null {
  const { copilotConfig, nowMs, lastProactiveMs, recentShownTexts = [] } = input;
  if (copilotConfig.mode === "off") return null;
  if (copilotConfig.muteSuggestions) return null;
  if (!copilotConfig.showOverlaySuggestions && copilotConfig.mode !== "passive") return null;
  if (lastProactiveMs != null && nowMs - lastProactiveMs < ACTIVE_LISTENING_PROACTIVE_COOLDOWN_MS) return null;

  const moments = detectMoments(input.newTranscript, input.recentCommands);
  const highValue = moments.filter((m) => m.importance === "high");
  const pool = highValue.length ? highValue : copilotConfig.mode === "coaching" ? moments : [];
  if (pool.length === 0) return null;

  const sorted = [...pool].sort((a, b) => (PROACTIVE_RANK[b.kind] ?? 0) - (PROACTIVE_RANK[a.kind] ?? 0));
  for (const moment of sorted) {
    if (!recentShownTexts.some((t) => isDuplicateText(t, moment.excerpt))) return moment;
  }
  return null;
}

/** Passive mode: capture silently — no overlay card. */
export function proactiveShouldShowCard(config: GlassCopilotConfig): boolean {
  return config.mode === "coaching" || config.mode === "diagnostic";
}

export function buildActiveListeningProactiveIntervention(
  moment: ActiveListeningProactiveMoment,
  deps: { idFactory: () => string; clock: () => string },
): GlassCopilotIntervention {
  return {
    id: deps.idFactory(),
    kind: "action",
    title: moment.title,
    body: shortExcerpt(moment.excerpt),
    buttons: [
      { action: "save", label: "Save this", primary: true },
      { action: "turn-into-action", label: "Explain" },
      { action: "create-prompt", label: "Turn into action" },
      { action: "later", label: "Create prompt" },
      { action: "show-summary", label: "Create script" },
      { action: "summarize-blocker", label: "Add to report" },
      { action: "dismiss", label: "Dismiss" },
    ],
    createdAt: deps.clock(),
  };
}

/** Runtime state cleared by Stop Everything. */
export interface ActiveListeningRuntimeState {
  lastProactiveMs?: number;
  recentProactiveTexts: string[];
}

export function initialActiveListeningRuntime(): ActiveListeningRuntimeState {
  return { recentProactiveTexts: [] };
}

export function clearActiveListeningRuntime(): ActiveListeningRuntimeState {
  return initialActiveListeningRuntime();
}
