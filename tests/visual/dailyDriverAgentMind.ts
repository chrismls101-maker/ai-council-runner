/**
 * Daily Driver Agent Mind — public QA narration (not hidden chain-of-thought).
 */

import type { Page } from "@playwright/test";
import { isWatchMode, pauseMs, qaLog } from "./qaEnv.js";
import type { DailyDriverScenario } from "./dailyDriverScenarios.js";
import { resolveScenarioNarration } from "./dailyDriverScenarios.js";
import type { AutoDetectedIssue } from "./dailyDriverAutoDetect.js";
import type { DailyDriverReport, FrictionKind, ScenarioResult } from "./dailyDriverReport.js";
import { updateDailyAgentMindPanel, type FrictionSeverityLabel } from "./dailyDriverQaMonitor.js";

export type AgentMindEventType =
  | "plan"
  | "action"
  | "waiting"
  | "observation"
  | "evaluation"
  | "friction"
  | "decision"
  | "next"
  | "warning"
  | "pass"
  | "fail";

export interface AgentMindEvent {
  timestamp: string;
  scenarioId: string;
  scenarioTitle: string;
  type: AgentMindEventType;
  message: string;
  details?: Record<string, unknown>;
}

export interface AgentEvaluationSummary {
  routeText: string;
  answerLength: number;
  routeOk: boolean;
  requiredMissed: string[];
  forbiddenHit: string[];
  frictions: FrictionKind[];
  frictionNotes: string[];
  agentMessages: string[];
  autoIssues: AutoDetectedIssue[];
  contextUsed?: boolean;
  durationMs: number;
}

export interface AgentMindSummary {
  mostUsefulAnswer?: string;
  weakestAnswer?: string;
  biggestFriction?: string;
  memoryBleedIncidents: string[];
  contextIgnoredIncidents: string[];
  uiConfusionIncidents: string[];
  recommendedNextFix?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function truncate(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function frictionSeverityFrom(
  frictions: FrictionKind[],
  forbiddenHit: string[],
  outcome: ScenarioResult["outcome"],
  scenarioSeverity: DailyDriverScenario["failureSeverity"],
): FrictionSeverityLabel {
  if (outcome === "fail" && scenarioSeverity === "blocker") return "blocker";
  if (frictions.includes("memory_bleed") || frictions.includes("self_reference_bleed")) {
    return forbiddenHit.length > 0 ? "blocker" : "major";
  }
  if (frictions.includes("context_ignored") || frictions.includes("wrong_route")) return "major";
  if (
    frictions.includes("generic_answer") ||
    frictions.includes("worse_than_chatgpt") ||
    outcome === "pass_with_friction"
  ) {
    return "minor";
  }
  if (frictions.includes("useful_answer") && frictions.length <= 1) return "none";
  return frictions.length > 0 ? "minor" : "none";
}

export function frictionSeverityReason(
  severity: FrictionSeverityLabel,
  frictions: FrictionKind[],
  notes: string[],
  agentMessages: string[],
): string {
  if (severity === "none") return "Answer matched the scenario goal.";
  if (agentMessages[0]) return agentMessages[0];
  if (severity === "blocker") {
    return notes[0] ?? "Blocker friction — unrelated memory or forbidden content in answer.";
  }
  if (severity === "major") {
    return notes[0] ?? "Major friction — context ignored, wrong route, or missing critical signals.";
  }
  return notes[0] ?? (frictions.join(", ") || "Minor friction detected.");
}

export class DailyDriverAgentMind {
  readonly transcript: AgentMindEvent[] = [];
  private scenarioIndex = 0;
  private scenarioTotal = 1;

  constructor(
    private readonly page: Page,
    private readonly report: DailyDriverReport,
  ) {}

  setRunBounds(index: number, total: number): void {
    this.scenarioIndex = index;
    this.scenarioTotal = total;
  }

  private push(
    scenario: DailyDriverScenario,
    type: AgentMindEventType,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const event: AgentMindEvent = {
      timestamp: nowIso(),
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      type,
      message,
      details,
    };
    this.transcript.push(event);
    this.report.appendAgentMindEvent(event);
    qaLog(`[Daily Agent] ${message}`);
  }

  async syncPanel(patch: Parameters<typeof updateDailyAgentMindPanel>[1]): Promise<void> {
    await updateDailyAgentMindPanel(this.page, {
      scenarioIndex: this.scenarioIndex,
      scenarioTotal: this.scenarioTotal,
      ...patch,
    });
  }

  private async timeline(scenario: DailyDriverScenario, message: string): Promise<void> {
    await this.syncPanel({ timelineEntry: message });
    this.push(scenario, "action", message);
  }

  async planScenario(scenario: DailyDriverScenario): Promise<void> {
    const n = resolveScenarioNarration(scenario);
    const promptPreview = truncate(scenario.prompt || scenario.title, 160);
    await this.syncPanel({
      scenarioTitle: scenario.title,
      plan: promptPreview,
      why: n.whyItMatters,
      goodAnswer: n.successLooksLike,
      badAnswer: n.failureLooksLike,
      now: `Planning scenario ${this.scenarioIndex}/${this.scenarioTotal}`,
      observation: "",
      evaluation: "",
      issues: "",
      verdict: "",
      frictionSeverity: "none",
      frictionReason: "",
      next: "",
    });
    await this.timeline(scenario, `Planning scenario: ${scenario.title}`);
    this.push(scenario, "plan", `I'm going to ask: ${promptPreview}`, { agentGoal: n.agentGoal });
    this.push(scenario, "plan", `Why this matters: ${n.whyItMatters}`);
    this.push(
      scenario,
      "plan",
      `Success looks like: ${n.successLooksLike}. Friction if: ${n.failureLooksLike}`,
      { userMindset: n.userMindset },
    );
  }

  async action(scenario: DailyDriverScenario, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.syncPanel({ now: message });
    await this.timeline(scenario, message);
  }

  async waiting(scenario: DailyDriverScenario, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.syncPanel({ now: message });
    await this.timeline(scenario, message);
    this.push(scenario, "waiting", message, details);
  }

  async observe(scenario: DailyDriverScenario, message: string, details?: Record<string, unknown>): Promise<void> {
    const route = typeof details?.routeText === "string" ? details.routeText : undefined;
    const answerLength = typeof details?.answerLength === "number" ? details.answerLength : undefined;
    await this.syncPanel({
      observation: message,
      routeObserved: route,
      answerLength,
      now: "Reviewing answer",
    });
    if (route) {
      await this.timeline(scenario, `Route observed: ${truncate(route, 60)}`);
    }
    this.push(scenario, "observation", message, details);
  }

  async evaluate(scenario: DailyDriverScenario, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.syncPanel({ evaluation: message, now: "Evaluating answer" });
    await this.timeline(scenario, `Evaluation: ${truncate(message, 80)}`);
    this.push(scenario, "evaluation", message, details);
  }

  async friction(
    scenario: DailyDriverScenario,
    severity: FrictionSeverityLabel,
    reason: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.syncPanel({
      frictionSeverity: severity,
      frictionReason: reason,
      issues: reason,
      now: `Friction: ${severity}`,
    });
    await this.timeline(scenario, `Friction: ${severity} — ${truncate(reason, 70)}`);
    this.push(scenario, "friction", `${severity}: ${reason}`, details);
  }

  async next(scenario: DailyDriverScenario, message: string): Promise<void> {
    await this.syncPanel({ next: message, now: message });
    await this.timeline(scenario, message);
    this.push(scenario, "next", message);
    if (isWatchMode()) {
      await this.page.waitForTimeout(pauseMs(1500));
    }
  }

  async pass(scenario: DailyDriverScenario, message: string): Promise<void> {
    this.push(scenario, "pass", message);
  }

  async fail(scenario: DailyDriverScenario, message: string): Promise<void> {
    this.push(scenario, "fail", message);
  }

  async warn(scenario: DailyDriverScenario, message: string): Promise<void> {
    this.push(scenario, "warning", message);
  }

  buildPublicEvaluation(
    scenario: DailyDriverScenario,
    summary: AgentEvaluationSummary,
    outcome: ScenarioResult["outcome"],
  ): string {
    const lines: string[] = ["My read:"];
    if (summary.routeText && summary.routeText !== "(skipped live)") {
      lines.push(
        summary.routeOk
          ? `Route looks acceptable (${truncate(summary.routeText, 80)}).`
          : `Route may be wrong (${truncate(summary.routeText, 80)}).`,
      );
    }
    for (const msg of summary.agentMessages.slice(0, 4)) {
      lines.push(msg);
    }
    if (summary.requiredMissed.length && !summary.agentMessages.length) {
      lines.push(`Missing expected signals: ${summary.requiredMissed.slice(0, 3).join(", ")}.`);
    }
    if (summary.contextUsed === false) {
      lines.push("Attached context may not have been used.");
    }
    if (summary.frictions.includes("useful_answer") && summary.frictions.length <= 1) {
      lines.push("Useful, on-topic answer for this scenario.");
    }
    lines.push(`Outcome: ${outcome}. Latency: ${Math.round(summary.durationMs / 1000)}s.`);
    return lines.join(" ");
  }

  async finishScenario(
    scenario: DailyDriverScenario,
    summary: AgentEvaluationSummary,
    outcome: ScenarioResult["outcome"],
  ): Promise<void> {
    this.report.appendAutoIssues(summary.autoIssues);

    const severity = frictionSeverityFrom(
      summary.frictions,
      summary.forbiddenHit,
      outcome,
      scenario.failureSeverity,
    );
    const reason = frictionSeverityReason(
      severity,
      summary.frictions,
      summary.frictionNotes,
      summary.agentMessages,
    );
    const evaluation = this.buildPublicEvaluation(scenario, summary, outcome);
    const verdict =
      outcome === "fail"
        ? `FAIL — ${reason}`
        : outcome === "pass_with_friction"
          ? `PASS with friction — ${reason}`
          : outcome === "skipped"
            ? "SKIPPED"
            : `PASS — ${reason}`;

    await this.syncPanel({
      evaluation,
      frictionSeverity: severity,
      frictionReason: reason,
      issues: summary.agentMessages.join(" | ") || reason,
      verdict,
      routeObserved: summary.routeText,
      answerLength: summary.answerLength,
      latencySec: Math.round(summary.durationMs / 1000),
      now: `Verdict: ${outcome}`,
    });

    await this.evaluate(scenario, evaluation, {
      outcome,
      severity,
      routeOk: summary.routeOk,
      answerLength: summary.answerLength,
    });
    await this.friction(scenario, severity, reason, { frictions: summary.frictions });

    if (outcome === "fail") {
      await this.fail(scenario, reason);
    } else if (outcome === "pass") {
      await this.pass(scenario, reason);
    } else if (outcome === "skipped") {
      await this.next(scenario, "Skipped (live not enabled) — moving on.");
      return;
    } else {
      await this.pass(scenario, `Pass with friction — ${reason}`);
    }

    if (isWatchMode()) {
      await this.page.waitForTimeout(pauseMs(2000));
    }

    const nextMsg =
      this.scenarioIndex < this.scenarioTotal
        ? `Moving to scenario ${this.scenarioIndex + 1} of ${this.scenarioTotal}…`
        : "Daily Driver run complete.";
    await this.next(scenario, nextMsg);
  }
}

export function buildAgentMindSummary(results: ScenarioResult[]): AgentMindSummary {
  const withPreview = results.filter((r) => r.answerPreview && r.answerPreview.length > 20);
  const useful = withPreview.filter((r) => r.frictions.includes("useful_answer") && r.outcome !== "fail");
  const weak = withPreview.filter(
    (r) =>
      r.frictions.includes("generic_answer") ||
      r.frictions.includes("worse_than_chatgpt") ||
      r.outcome === "pass_with_friction",
  );

  const memoryBleed = results
    .filter((r) => r.frictions.includes("memory_bleed") || r.frictions.includes("self_reference_bleed"))
    .map((r) => r.id);
  const contextIgnored = results.filter((r) => r.frictions.includes("context_ignored")).map((r) => r.id);
  const uiConfusion = results.filter((r) => r.frictions.includes("confusing_ui")).map((r) => r.id);

  const frictionRank = (r: ScenarioResult) => r.frictions.length + (r.outcome === "fail" ? 3 : 0);
  const worst = [...results].sort((a, b) => frictionRank(b) - frictionRank(a))[0];

  return {
    mostUsefulAnswer: useful[0]?.id,
    weakestAnswer: weak[0]?.id ?? worst?.id,
    biggestFriction: worst
      ? `${worst.id}: ${worst.frictions.join(", ") || worst.error || "review"}`
      : undefined,
    memoryBleedIncidents: memoryBleed,
    contextIgnoredIncidents: contextIgnored,
    uiConfusionIncidents: uiConfusion,
    recommendedNextFix: worst?.frictionNotes[0] ?? worst?.error,
  };
}

export function buildAgentMindMarkdown(
  events: AgentMindEvent[],
  options?: {
    autoDetectedIssues?: Array<{
      scenarioId: string;
      type: string;
      severity: string;
      evidence: string;
      agentMessage: string;
    }>;
  },
): string {
  const lines: string[] = ["# IIVO Daily Driver Agent Mind Transcript", ""];
  let currentId = "";

  for (const e of events) {
    if (e.scenarioId !== currentId) {
      currentId = e.scenarioId;
      lines.push(`## ${e.scenarioTitle}`, "", `*${e.scenarioId}*`, "");
    }
    const label = e.type.charAt(0).toUpperCase() + e.type.slice(1);
    lines.push(`**${label}:** ${e.message}`, "");
  }

  const issues = options?.autoDetectedIssues ?? [];
  if (issues.length > 0) {
    lines.push("## What the agent caught automatically", "");
    for (const issue of issues) {
      lines.push(
        `- **${issue.scenarioId}** (${issue.type}, ${issue.severity}): ${issue.agentMessage}`,
        `  - Evidence: \`${issue.evidence}\``,
        "",
      );
    }
    lines.push("## What I would have missed manually", "", "");
    for (const issue of issues.filter((i) => i.severity === "blocker" || i.severity === "major")) {
      lines.push(`- ${issue.agentMessage}`);
    }
    lines.push("", "## Next fixes", "");
    const fixTypes = [...new Set(issues.map((i) => i.type))];
    for (const t of fixTypes) {
      const related = issues.filter((i) => i.type === t);
      lines.push(`- Address **${t}** in: ${related.map((r) => r.scenarioId).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
