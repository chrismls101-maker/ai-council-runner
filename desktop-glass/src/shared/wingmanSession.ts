/**
 * IIVO Glass — Wingman Mode session types and logic.
 *
 * Wingman is the active work companion mode. It tracks the user's session,
 * stores screen inspections, detects loops and scope drift, and produces a
 * structured session report.
 *
 * Key rule: confidence is always "observed" | "inferred" — NEVER "verified".
 * Glass sees the screen; it cannot execute code or confirm claims.
 */

import type { TerminalEvent } from "./terminalEvents.ts";

// Re-export for convenience so consumers only need to import from wingmanSession
export type { TerminalEvent } from "./terminalEvents.ts";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface WingmanAppSnapshot {
  app: string;
  title: string;
  timestamp: number;
}

/**
 * A single user-triggered screen inspection.
 * confidence must NEVER be "verified" — only "observed" or "inferred".
 */
export interface WingmanInspection {
  id: string;
  triggeredBy: "user";
  timestamp: number;
  /** Path to screenshot file — never base64 inline. */
  screenshotRef: string;
  /** The user's question, if any was provided. */
  prompt?: string;
  /** Wingman's response — always uses "observed"/"appears to" language. */
  response: string;
  type: "question" | "next-step" | "warning" | "debug";
  /** Glass can observe and infer — it cannot verify. */
  confidence: "observed" | "inferred";
  /** Set by detectScopeDrift() when inspection reveals out-of-scope content. */
  scopeDriftWarning?: string;
}

export interface WingmanNote {
  id: string;
  timestamp: number;
  content: string;
  source: "user" | "wingman";
}

export interface WingmanReport {
  goal: string;
  /** Duration in milliseconds. */
  duration: number;
  /** Derived from appSnapshots — unique app names seen during session. */
  appsUsed: string[];
  /** AI-generated 3–5 sentence narrative of what happened. */
  summary: string;
  /** Key findings from inspections, always in observed language. */
  keyFindings: string[];
  /** Scope drift + loop warnings issued during the session. */
  warningsIssued: string[];
  /** Things Wingman observed on screen but cannot confirm are correct. */
  observedOnly: string[];
  /** Things the user still needs to verify manually — never empty if inspections ran. */
  notVerified: string[];
  /** Concrete next steps — max 3. */
  nextSteps: string[];
  /** Terminal events captured during the session (errors, failures, successes). */
  terminalEvents?: TerminalEvent[];
  savedAt?: number;
}

export interface WingmanSession {
  id: string;
  goal: string;
  startedAt: number;
  endedAt?: number;
  /** Passive tracking — app title only, no screenshots. */
  appSnapshots: WingmanAppSnapshot[];
  /** User-triggered inspections only — never autonomous in V1. */
  inspections: WingmanInspection[];
  notes: WingmanNote[];
  /** Set true when the same error is observed twice within a session. */
  loopWarning: boolean;
  /** Terminal events auto-captured while terminal awareness is active. */
  terminalEvents: TerminalEvent[];
  /** Whether terminal watching is enabled for this session (opt-in). */
  terminalWatching: boolean;
  report?: WingmanReport;
}

export interface WingmanState {
  active: boolean;
  session: WingmanSession | null;
  /** True during the screenshot + AI call for an inspection. */
  inspecting: boolean;
  report: WingmanReport | null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_WINGMAN_STATE: WingmanState = {
  active: false,
  session: null,
  inspecting: false,
  report: null,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function initialWingmanSession(goal: string): WingmanSession {
  return {
    id: `wingman-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    goal,
    startedAt: Date.now(),
    appSnapshots: [],
    inspections: [],
    notes: [],
    loopWarning: false,
    terminalEvents: [],
    terminalWatching: false,
  };
}

// ---------------------------------------------------------------------------
// App snapshot deduplication
// ---------------------------------------------------------------------------

/**
 * Returns true if the snapshot should be added (not a duplicate within 60s).
 * Deduplicates same app+title combinations seen within the last 60 seconds.
 */
export function shouldAddAppSnapshot(
  snapshots: WingmanAppSnapshot[],
  incoming: WingmanAppSnapshot,
  dedupeWindowMs = 60_000,
): boolean {
  const cutoff = incoming.timestamp - dedupeWindowMs;
  return !snapshots.some(
    (s) =>
      s.app === incoming.app &&
      s.title === incoming.title &&
      s.timestamp >= cutoff,
  );
}

/**
 * Derive unique app names used during the session (for the report).
 */
export function deriveAppsUsed(snapshots: WingmanAppSnapshot[]): string[] {
  const seen = new Set<string>();
  for (const s of snapshots) {
    if (s.app) seen.add(s.app);
  }
  return Array.from(seen);
}

// ---------------------------------------------------------------------------
// Loop detection
// ---------------------------------------------------------------------------

/** Keywords that indicate an error/problem state. */
const ERROR_KEYWORDS = [
  "error",
  "failed",
  "failure",
  "exception",
  "cannot",
  "unable",
  "undefined",
  "null",
  "crash",
  "refused",
  "timeout",
  "401",
  "403",
  "404",
  "500",
  "rejected",
  "broken",
  "incorrect",
  "unexpected",
];

/**
 * Extract error-indicating keywords from a response string.
 */
function extractErrorKeywords(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const kw of ERROR_KEYWORDS) {
    if (lower.includes(kw)) found.add(kw);
  }
  return found;
}

/**
 * Returns true if the last two inspections share enough error keywords
 * to suggest the same issue was observed twice.
 */
export function detectLoop(inspections: WingmanInspection[]): boolean {
  if (inspections.length < 2) return false;
  const last = inspections[inspections.length - 1];
  const prev = inspections[inspections.length - 2];
  const gap = last.timestamp - prev.timestamp;
  // Only flag loops within a 20-minute window
  if (gap > 20 * 60 * 1000) return false;
  const lastKw = extractErrorKeywords(last.response);
  const prevKw = extractErrorKeywords(prev.response);
  if (lastKw.size === 0 || prevKw.size === 0) return false;
  let shared = 0;
  for (const kw of lastKw) {
    if (prevKw.has(kw)) shared++;
  }
  // 2+ shared error keywords = likely same issue
  return shared >= 2;
}

// ---------------------------------------------------------------------------
// Scope drift detection
// ---------------------------------------------------------------------------

/** Pairs of task-goal keywords → risky out-of-scope area keywords. */
const SCOPE_DRIFT_RULES: Array<{
  taskSignals: string[];
  riskSignals: string[];
  warning: string;
}> = [
  {
    taskSignals: ["ui", "design", "style", "css", "layout", "color", "button", "landing"],
    riskSignals: ["stripe", "billing", "payment", "auth", "database", "migration", "config", "secret", "env", "password"],
    warning: "You described this as a UI change. I observe references to payment or auth configuration — verify nothing changed in critical business logic.",
  },
  {
    taskSignals: ["test", "testing", "spec", "unit"],
    riskSignals: ["production", "deploy", "release", "ship", "publish", "live"],
    warning: "You described this as a test task. I observe references to production or deployment — confirm you are not in a live environment.",
  },
  {
    taskSignals: ["fix", "bug", "debug", "patch"],
    riskSignals: ["migration", "schema", "database", "drop", "delete", "truncate"],
    warning: "You described this as a bug fix. I observe references to database schema changes — verify no data is at risk.",
  },
  {
    taskSignals: ["deploy", "release", "ship", "publish"],
    riskSignals: ["staging", "development", "localhost", "dev", "test"],
    warning: "You described a deployment task. I observe references to a non-production environment — confirm the correct deploy target.",
  },
];

/**
 * Check if the inspection response reveals content outside the task's scope.
 * Returns a warning string if drift is detected, null otherwise.
 */
export function detectScopeDrift(goal: string, inspectionResponse: string): string | null {
  const goalLower = goal.toLowerCase();
  const responseLower = inspectionResponse.toLowerCase();
  for (const rule of SCOPE_DRIFT_RULES) {
    const taskMatch = rule.taskSignals.some((s) => goalLower.includes(s));
    if (!taskMatch) continue;
    const riskMatch = rule.riskSignals.some((s) => responseLower.includes(s));
    if (riskMatch) return rule.warning;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verification checklist
// ---------------------------------------------------------------------------

/**
 * Generate a task-specific verification checklist from the session.
 * Items are derived from the goal + what was observed in inspections.
 */
export function buildVerificationChecklist(session: WingmanSession): string[] {
  const items: string[] = [];
  const goalLower = session.goal.toLowerCase();

  // Goal-derived items
  if (goalLower.includes("test") || goalLower.includes("fix") || goalLower.includes("debug")) {
    items.push("Run the full test suite to confirm the fix is working");
  }
  if (goalLower.includes("deploy") || goalLower.includes("release") || goalLower.includes("ship")) {
    items.push("Confirm the correct environment is targeted (staging vs. production)");
    items.push("Verify the build artifact matches what you intended to ship");
  }
  if (goalLower.includes("auth") || goalLower.includes("login") || goalLower.includes("token")) {
    items.push("Test the login flow end to end in a clean browser session");
  }
  if (goalLower.includes("ui") || goalLower.includes("design") || goalLower.includes("landing")) {
    items.push("Check the layout on mobile viewport");
  }

  // Inspection-derived items
  const warnings = session.inspections
    .filter((i) => i.scopeDriftWarning)
    .map((i) => i.scopeDriftWarning as string);
  for (const w of warnings) {
    if (!items.some((item) => item.toLowerCase().includes(w.slice(0, 20).toLowerCase()))) {
      items.push(w);
    }
  }

  // Loop warning item
  if (session.loopWarning) {
    items.push("Investigate the root cause — the same error was observed more than once");
  }

  // Fallback
  if (items.length === 0) {
    items.push("Review the session report and manually verify the task goal was completed");
  }

  return items.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Report prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the AI prompt for generating the WingmanReport narrative summary.
 *
 * IMPORTANT: The model must use observed/appears-to language — never verified/confirmed.
 */
export function buildWingmanReportPrompt(session: WingmanSession): string {
  const duration = session.endedAt
    ? Math.round((session.endedAt - session.startedAt) / 60_000)
    : 0;

  const appsUsed = deriveAppsUsed(session.appSnapshots);

  const inspectionSummaries = session.inspections
    .map(
      (ins, i) =>
        `Inspection ${i + 1} [${ins.type}]: ${ins.response.slice(0, 300)}${ins.response.length > 300 ? "…" : ""}`,
    )
    .join("\n");

  const notes = session.notes
    .map((n) => `[${n.source}] ${n.content}`)
    .join("\n");

  const terminalSummary =
    session.terminalEvents.length > 0
      ? session.terminalEvents
          .map((e) => `[${e.type}] ${e.label}`)
          .join("\n")
      : "No terminal events captured.";

  return `You are summarising a Wingman work session for the user.

SESSION DETAILS
Goal: ${session.goal}
Duration: ${duration} minutes
Apps used: ${appsUsed.join(", ") || "not recorded"}
Loop warning triggered: ${session.loopWarning ? "yes — same error observed more than once" : "no"}

TERMINAL EVENTS (auto-captured)
${terminalSummary}

INSPECTIONS DURING SESSION
${inspectionSummaries || "No inspections were performed."}

SESSION NOTES
${notes || "No notes recorded."}

YOUR TASK
Write a structured session summary with these exact sections:

SUMMARY
Write 3–5 sentences describing what happened in this session. Use past tense. Be specific about what was observed.

KEY FINDINGS
List up to 4 specific things observed during inspections. Start each with "•". Use "observed", "appeared to", "based on what was visible" — NEVER "verified", "confirmed", "tested", or "proven". Glass can see the screen; it cannot execute code.

OBSERVED ONLY (could not verify)
List up to 3 things that were seen on screen but cannot be confirmed without manual testing. Example: "Tests appeared to pass based on terminal output — not independently verified." This section must exist even if the session was short.

WHAT STILL NEEDS CHECKING
List up to 3 concrete actions the user should take before considering this task done.

NEXT STEP
Write exactly one sentence: the single most important next action.

RULES
- Never use the words "verified", "confirmed", "proven", "tested" in a way that implies Glass ran code or checked execution
- Always use "observed", "appears to", "based on what is visible", "I cannot confirm"
- Be specific — reference the actual goal and what was seen, not generic advice
- If no inspections ran, say so honestly and recommend the user inspect before trusting any results`;
}

// ---------------------------------------------------------------------------
// Report builder (from AI response)
// ---------------------------------------------------------------------------

/**
 * Parse the AI summary response and the session to build the final WingmanReport.
 */
export function buildWingmanReport(
  session: WingmanSession,
  aiSummary: string,
): WingmanReport {
  const appsUsed = deriveAppsUsed(session.appSnapshots);
  const duration = session.endedAt
    ? session.endedAt - session.startedAt
    : Date.now() - session.startedAt;

  // Extract key findings from inspections
  const keyFindings = session.inspections
    .filter((i) => i.type !== "question" || i.response.length > 50)
    .slice(0, 4)
    .map((i) => i.response.split(".")[0]?.trim() ?? i.response.slice(0, 80));

  // Warnings issued
  const warningsIssued: string[] = [];
  if (session.loopWarning) {
    warningsIssued.push("Same issue observed more than once — root cause may not be resolved");
  }
  for (const ins of session.inspections) {
    if (ins.scopeDriftWarning) warningsIssued.push(ins.scopeDriftWarning);
  }

  // Things observed on screen only
  const observedOnly =
    session.inspections.length > 0
      ? [
          "All findings are based on visible screen content — Glass cannot execute code or run tests",
          ...session.inspections
            .filter((i) => i.type === "next-step" || i.type === "debug")
            .slice(0, 2)
            .map((i) => `${i.response.slice(0, 80)}… (observed, not verified)`),
        ]
      : ["No screen inspections were performed during this session"];

  // What still needs checking
  const checklist = buildVerificationChecklist(session);
  const notVerified = checklist.slice(0, 3);

  // Next steps (from checklist)
  const nextSteps = checklist.slice(0, 3);

  return {
    goal: session.goal,
    duration,
    appsUsed,
    summary: aiSummary,
    keyFindings,
    warningsIssued,
    observedOnly,
    notVerified,
    nextSteps,
    terminalEvents: session.terminalEvents.slice(),
  };
}
