/**
 * AletheiaConversationPlanner — natural-language goals → bounded operator plans.
 */

import { randomUUID } from "node:crypto";
import type { OperatorActionKind } from "./aletheiaComputerOperatorTypes.ts";
import { ALL_OPERATOR_ACTION_KINDS } from "./aletheiaComputerOperatorTypes.ts";

export interface ComputerOperatorPlan {
  planId: string;
  goal: string;
  targetApps: string[];
  allowedActions: OperatorActionKind[];
  scope: string;
  successCriteria: string[];
  stepBudget: number;
  authorityLevelRequired: "L2" | "L3";
  requiresConfirmation: boolean;
}

const KNOWN_APPS = [
  "Slack",
  "Chrome",
  "Safari",
  "Firefox",
  "Arc",
  "Cursor",
  "Figma",
  "Notion",
  "Mail",
  "Messages",
  "Finder",
  "Terminal",
  "Discord",
  "Zoom",
];

const DESTRUCTIVE_PATTERNS =
  /\b(send|delete|remove|post|submit|pay|purchase|shutdown|erase|format|uninstall)\b/i;

const INSPECT_PATTERNS =
  /\b(summarize|summary|read|inspect|check|look|find|open|navigate|go to|tell me|what's|what is)\b/i;

const ALL_OPERATOR_ACTIONS = ALL_OPERATOR_ACTION_KINDS;

function detectTargetApps(text: string): string[] {
  const lower = text.toLowerCase();
  const found = KNOWN_APPS.filter((app) => lower.includes(app.toLowerCase()));
  return [...new Set(found)];
}

function buildScope(lower: string): string {
  const parts: string[] = [];
  if (INSPECT_PATTERNS.test(lower)) {
    parts.push("inspect and navigate only");
  }
  if (/\bsend\b/i.test(lower) || DESTRUCTIVE_PATTERNS.test(lower)) {
    parts.push("no sending");
  }
  parts.push("no destructive actions");
  return parts.join("; ");
}

function extractSuccessCriteria(lower: string, raw: string): string[] {
  const criteria: string[] = [];
  if (/\bunread\b/.test(lower)) criteria.push("Unread items located or thread opened");
  if (/\bsummar/.test(lower)) criteria.push("Screen content summarized for the user");
  if (/\bopen\b/.test(lower) && detectTargetApps(raw).length) {
    criteria.push(`Target app focused: ${detectTargetApps(raw).join(", ")}`);
  }
  if (/\bthread\b/.test(lower)) criteria.push("Conversation thread visible");
  if (!criteria.length) criteria.push("Goal satisfied or best-effort read completed");
  return criteria;
}

/** Turn a conversation request into a bounded computer-operator plan. */
export function planFromNaturalLanguage(goal: string): ComputerOperatorPlan {
  const normalized = goal.trim();
  const lower = normalized.toLowerCase();
  const targetApps = detectTargetApps(normalized);
  const destructive = DESTRUCTIVE_PATTERNS.test(lower);
  const requiresConfirmation = destructive;

  return {
    planId: randomUUID(),
    goal: normalized || "Use the computer to complete the requested task",
    targetApps,
    allowedActions: [...ALL_OPERATOR_ACTIONS],
    scope: buildScope(lower),
    successCriteria: extractSuccessCriteria(lower, normalized),
    stepBudget: 12,
    authorityLevelRequired: destructive ? "L2" : "L3",
    requiresConfirmation,
  };
}

/** Human-readable scope declaration for session grant UI. */
export function formatComputerOperatorPlanDeclaration(plan: ComputerOperatorPlan): string {
  const apps =
    plan.targetApps.length > 0 ? plan.targetApps.join(", ") : "frontmost apps";
  const preview =
    plan.goal.length > 80 ? `${plan.goal.slice(0, 80)}…` : plan.goal;
  return `Allow Aletheia to inspect and navigate ${apps} for this task (${preview}); ${plan.scope}; max ${plan.stepBudget} steps.`;
}
