/**
 * Aletheia delegated presence (B3.2).
 *
 * "Go to [app] and …" — focus any app, observe, and report back through Aletheia.
 */

import { randomUUID } from "node:crypto";
import { isAppleScriptCapableApp } from "./aletheiaComputerUseRouter.ts";

export type DelegatedPresencePhase =
  | "routing"
  | "focusing"
  | "observing"
  | "reporting"
  | "complete"
  | "failed";

export interface DelegatedPresenceAuditRow {
  id: string;
  narration: string;
  method?: string;
  ok: boolean | null;
  createdAt: number;
}

export interface AletheiaDelegatedPresenceSnapshot {
  taskId: string;
  phase: DelegatedPresencePhase;
  targetApp: string;
  goal: string;
  reportQuestion: string;
  audit: DelegatedPresenceAuditRow[];
  report?: string;
  errorMessage?: string;
  method?: string;
  startedAt: number;
  updatedAt: number;
}

export interface DelegatedPresenceIntent {
  targetApp: string;
  goal: string;
  reportQuestion: string;
  matched: string;
}

/** Spoken aliases → canonical macOS app names (AppleScript activate). */
export const DELEGATED_APP_ALIASES: Readonly<Record<string, string>> = {
  figma: "Figma",
  notion: "Notion",
  slack: "Slack",
  safari: "Safari",
  chrome: "Google Chrome",
  "google chrome": "Google Chrome",
  arc: "Arc",
  cursor: "Cursor",
  claude: "Claude",
  mail: "Mail",
  notes: "Notes",
  terminal: "Terminal",
  iterm: "iTerm2",
  "system settings": "System Settings",
  finder: "Finder",
  brave: "Brave Browser",
  edge: "Microsoft Edge",
};

const DELEGATED_PATTERNS: RegExp[] = [
  /\b(?:go to|open|switch to|focus)\s+([a-z0-9][\w\s]{0,24}?)\s+and\s+(.+)/i,
  /\b(?:go operate|operate in)\s+([a-z0-9][\w\s]{0,24}?)(?:\s+and\s+(.+))?/i,
  /\bin\s+(figma|notion|slack|safari|chrome|cursor|mail|notes|terminal|finder)\s*,?\s*(.+)/i,
  /\b(?:go to|open)\s+(figma|notion|slack|safari|chrome|cursor|mail|notes)\s+and\s+tell me\s+(.+)/i,
];

function normalizeAppToken(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (DELEGATED_APP_ALIASES[key]) return DELEGATED_APP_ALIASES[key];
  for (const [alias, canonical] of Object.entries(DELEGATED_APP_ALIASES)) {
    if (key === alias || key.startsWith(`${alias} `)) return canonical;
  }
  const titleCase = trimmed
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  return isAppleScriptCapableApp(titleCase) ? titleCase : titleCase;
}

function buildReportQuestion(action: string): string {
  const trimmed = action.trim();
  if (/^tell me\b/i.test(trimmed)) return trimmed;
  if (/^(check|describe|summarize|report|look at|read)\b/i.test(trimmed)) return trimmed;
  return `Tell me: ${trimmed}`;
}

export function classifyDelegatedPresenceIntent(text: string): DelegatedPresenceIntent | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 12) return null;

  for (const pattern of DELEGATED_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const appRaw = match[1]?.trim();
    const actionRaw = (match[2] ?? match[3] ?? "describe what you see").trim();
    if (!appRaw) continue;

    const targetApp = normalizeAppToken(appRaw);
    if (!targetApp) continue;

    return {
      targetApp,
      goal: trimmed,
      reportQuestion: buildReportQuestion(actionRaw),
      matched: match[0],
    };
  }

  return null;
}

export function delegatedPresenceIntroSpeech(targetApp: string): string {
  return `I'll switch to ${targetApp} and report back.`;
}

export function isDelegatedPresenceRunning(
  snapshot: AletheiaDelegatedPresenceSnapshot | undefined,
): boolean {
  if (!snapshot) return false;
  return snapshot.phase === "routing"
    || snapshot.phase === "focusing"
    || snapshot.phase === "observing"
    || snapshot.phase === "reporting";
}

export function initialDelegatedPresenceSnapshot(
  intent: DelegatedPresenceIntent,
  now = Date.now(),
): AletheiaDelegatedPresenceSnapshot {
  return {
    taskId: randomUUID(),
    phase: "routing",
    targetApp: intent.targetApp,
    goal: intent.goal,
    reportQuestion: intent.reportQuestion,
    audit: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function appendDelegatedPresenceAudit(
  snapshot: AletheiaDelegatedPresenceSnapshot,
  row: Omit<DelegatedPresenceAuditRow, "id" | "createdAt">,
  now = Date.now(),
): AletheiaDelegatedPresenceSnapshot {
  return {
    ...snapshot,
    audit: [
      ...snapshot.audit,
      {
        id: randomUUID(),
        createdAt: now,
        ...row,
      },
    ],
    updatedAt: now,
  };
}

export function markDelegatedPresencePhase(
  snapshot: AletheiaDelegatedPresenceSnapshot,
  phase: DelegatedPresencePhase,
  patch?: Partial<Pick<AletheiaDelegatedPresenceSnapshot, "method" | "report" | "errorMessage">>,
  now = Date.now(),
): AletheiaDelegatedPresenceSnapshot {
  return {
    ...snapshot,
    phase,
    ...patch,
    updatedAt: now,
  };
}

export function buildDelegatedPresenceFallbackReport(input: {
  targetApp: string;
  reportQuestion: string;
  windowTitle?: string;
  frontApp?: string;
  screenDigest?: string;
}): string {
  const parts: string[] = [];
  parts.push(`I focused ${input.targetApp}.`);
  if (input.frontApp && input.frontApp !== input.targetApp) {
    parts.push(`Front app is still ${input.frontApp} — the switch may not have completed.`);
  }
  if (input.windowTitle) {
    parts.push(`Window: ${input.windowTitle}.`);
  }
  if (input.screenDigest?.trim()) {
    parts.push(input.screenDigest.trim());
  } else {
    parts.push("I couldn't refresh a detailed screen read, so this is based on window context only.");
  }
  return parts.join(" ");
}

export function delegatedPresenceSnapshotsEqual(
  a: AletheiaDelegatedPresenceSnapshot | undefined,
  b: AletheiaDelegatedPresenceSnapshot | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.taskId === b.taskId
    && a.phase === b.phase
    && a.targetApp === b.targetApp
    && a.report === b.report
    && a.errorMessage === b.errorMessage
    && a.audit.length === b.audit.length
  );
}
