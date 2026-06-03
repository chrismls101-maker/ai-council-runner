/**
 * Daily Driver friction report — JSON + terminal summary.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentMindEvent, AgentMindSummary } from "./dailyDriverAgentMind.js";
import { buildAgentMindMarkdown, buildAgentMindSummary } from "./dailyDriverAgentMind.js";
import type { AutoDetectedIssue } from "./dailyDriverAutoDetect.js";
import type { DailyDriverAudience } from "./dailyDriverScenarios.js";
import { getScenarioMixStats } from "./dailyDriverScenarios.js";
import { qaLog } from "./qaEnv.js";

export type FrictionKind =
  | "useful_answer"
  | "generic_answer"
  | "worse_than_chatgpt"
  | "wrong_route"
  | "over_routed"
  | "contract_violation"
  | "deliverable_not_first"
  | "wrong_output_format"
  | "raw_markdown_noise"
  | "context_ignored"
  | "context_overused"
  | "memory_bleed"
  | "self_reference_bleed"
  | "confusing_ui"
  | "missing_trace"
  | "too_slow"
  | "too_expensive"
  | "skipped_live"
  | "technical_fail"
  | "submit_not_fired";

export type ScenarioOutcome = "pass" | "pass_with_friction" | "fail" | "skipped";

export interface ScenarioResult {
  id: string;
  title: string;
  category: string;
  audience: DailyDriverAudience;
  tags: string[];
  outcome: ScenarioOutcome;
  route?: string;
  durationMs: number;
  frictions: FrictionKind[];
  frictionNotes: string[];
  requiredMissed: string[];
  forbiddenHit: string[];
  answerPreview?: string;
  error?: string;
}

export interface UsefulnessBucket {
  label: string;
  passed: string[];
  friction: string[];
  failed: string[];
}

export interface AgentVisibilityStats {
  panelInitialized: boolean;
  reattachCount: number;
  lastVisibleAt: string | null;
}

export interface DailyDriverSummaryJson {
  timestamp: string;
  mode: "default" | "full" | "live";
  scenarioCount: number;
  mix: ReturnType<typeof getScenarioMixStats>;
  passed: number;
  passedWithFriction: number;
  failed: number;
  skipped: number;
  results: ScenarioResult[];
  frictionCounts: Record<string, number>;
  agentVisibility: AgentVisibilityStats;
  autoDetectedIssues: AutoDetectedIssue[];
  usefulness: {
    general: UsefulnessBucket;
    iivoSpecific: UsefulnessBucket;
  };
  productQuestions: {
    feltUseful: string;
    worseThanChatGPT: string[];
    advancedFeaturesHelped: string[];
    memoryHelpOrHurt: string[];
    contextImproved: string[];
    uiUnderstandable: string[];
    fixNext: string[];
  };
  agentMindTranscript: AgentMindEvent[];
  agentMindSummary: AgentMindSummary;
}

const REPORT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-results",
);
const REPORT_PATH = path.join(REPORT_DIR, "iivo-daily-driver-summary.json");
const AGENT_MIND_MD_PATH = path.join(REPORT_DIR, "iivo-daily-driver-agent-mind.md");

function bucketResults(
  results: ScenarioResult[],
  audience: DailyDriverAudience,
): UsefulnessBucket {
  const subset = results.filter((r) => r.audience === audience);
  return {
    label:
      audience === "general"
        ? "General AI usefulness (business, writing, support, marketing, prioritization)"
        : "IIVO-specific usefulness (Lens, Vision, Context Bridge, Memory Guard, Benchmark)",
    passed: subset.filter((r) => r.outcome === "pass").map((r) => r.id),
    friction: subset.filter((r) => r.outcome === "pass_with_friction").map((r) => r.id),
    failed: subset.filter((r) => r.outcome === "fail").map((r) => r.id),
  };
}

export class DailyDriverReport {
  readonly results: ScenarioResult[] = [];
  readonly agentMindTranscript: AgentMindEvent[] = [];
  readonly autoDetectedIssues: AutoDetectedIssue[] = [];
  agentVisibility: AgentVisibilityStats = {
    panelInitialized: false,
    reattachCount: 0,
    lastVisibleAt: null,
  };

  markAgentPanelVisible(): void {
    this.agentVisibility.panelInitialized = true;
    this.agentVisibility.lastVisibleAt = new Date().toISOString();
  }

  recordAgentReattach(): void {
    this.agentVisibility.reattachCount += 1;
    this.agentVisibility.lastVisibleAt = new Date().toISOString();
  }

  appendAutoIssues(issues: AutoDetectedIssue[]): void {
    for (const issue of issues) {
      this.autoDetectedIssues.push(issue);
    }
  }

  appendAgentMindEvent(event: AgentMindEvent): void {
    this.agentMindTranscript.push(event);
  }

  add(result: ScenarioResult): void {
    this.results.push(result);
    const icon =
      result.outcome === "pass"
        ? "PASS"
        : result.outcome === "pass_with_friction"
          ? "PASS+friction"
          : result.outcome === "skipped"
            ? "SKIPPED"
            : "FAIL";
    const audienceTag = result.audience === "general" ? "general" : "iivo";
    qaLog(
      `[Daily Driver] [${audienceTag}] ${result.id}: ${icon}${result.frictions.length ? ` (${result.frictions.join(", ")})` : ""}`,
    );
  }

  frictionCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of this.results) {
      for (const f of r.frictions) {
        counts[f] = (counts[f] ?? 0) + 1;
      }
    }
    return counts;
  }

  hasBlockerFailures(): boolean {
    return this.results.some((r) => r.outcome === "fail");
  }

  toJson(mode: "default" | "full" | "live"): DailyDriverSummaryJson {
    const passed = this.results.filter((r) => r.outcome === "pass").length;
    const passedWithFriction = this.results.filter((r) => r.outcome === "pass_with_friction").length;
    const failed = this.results.filter((r) => r.outcome === "fail").length;
    const skipped = this.results.filter((r) => r.outcome === "skipped").length;
    const counts = this.frictionCounts();

    const worseThan = this.results
      .filter((r) => r.frictions.includes("worse_than_chatgpt") || r.frictions.includes("generic_answer"))
      .map((r) => r.id);
    const memoryHurt = this.results
      .filter((r) => r.frictions.includes("memory_bleed") || r.frictions.includes("self_reference_bleed"))
      .map((r) => r.id);
    const contextHelped = this.results
      .filter((r) => r.tags.includes("@context") && r.outcome !== "fail")
      .map((r) => r.id);
    const fixNext = this.results
      .filter((r) => r.outcome === "fail" || r.frictions.length > 0)
      .map((r) => `${r.id}: ${r.frictions.join(", ") || r.error || "review"}`);

    return {
      timestamp: new Date().toISOString(),
      mode,
      scenarioCount: this.results.length,
      mix: getScenarioMixStats(),
      passed,
      passedWithFriction,
      failed,
      skipped,
      results: [...this.results],
      frictionCounts: counts,
      usefulness: {
        general: bucketResults(this.results, "general"),
        iivoSpecific: bucketResults(this.results, "iivo"),
      },
      productQuestions: {
        feltUseful:
          passed + passedWithFriction > failed
            ? "Mostly useful on real-world tasks — see usefulness buckets and frictionCounts."
            : "Needs work before daily-driver ready.",
        worseThanChatGPT: worseThan,
        advancedFeaturesHelped: this.results
          .filter(
            (r) =>
              r.tags.some((t) => ["@lens", "@context", "@vision", "@benchmark"].includes(t)) &&
              r.outcome !== "fail",
          )
          .map((r) => r.id),
        memoryHelpOrHurt: [
          ...memoryHurt,
          ...this.results.filter((r) => r.tags.includes("@memory")).map((r) => r.id),
        ],
        contextImproved: contextHelped,
        uiUnderstandable: this.results
          .filter((r) => !r.frictions.includes("confusing_ui"))
          .map((r) => r.id),
        fixNext: fixNext.slice(0, 12),
      },
      agentVisibility: { ...this.agentVisibility },
      autoDetectedIssues: [...this.autoDetectedIssues],
      agentMindTranscript: [...this.agentMindTranscript],
      agentMindSummary: buildAgentMindSummary(this.results),
    };
  }

  async writeJsonReport(mode: "default" | "full" | "live"): Promise<string> {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(this.toJson(mode), null, 2)}\n`, "utf8");
    await fs.writeFile(
      AGENT_MIND_MD_PATH,
      `${buildAgentMindMarkdown(this.agentMindTranscript, {
        autoDetectedIssues: this.autoDetectedIssues,
      })}\n`,
      "utf8",
    );
    return REPORT_PATH;
  }

  printTerminalSummary(reportPath: string, mode: "default" | "full" | "live"): void {
    const j = this.toJson(mode);
    const lines = [
      "",
      "══════════════════════════════════════════════════",
      "  IIVO Daily Driver Simulation",
      `  Mode: ${mode} (${j.scenarioCount} scenarios)`,
      `  Catalog mix: ${j.mix.generalPct}% general / ${j.mix.iivoPct}% IIVO (${j.mix.general}+${j.mix.iivo} of ${j.mix.total})`,
      "══════════════════════════════════════════════════",
      "",
      `Pass: ${j.passed} | Pass+friction: ${j.passedWithFriction} | Fail: ${j.failed} | Skipped: ${j.skipped}`,
      "",
      "General AI usefulness:",
      `  Pass: ${j.usefulness.general.passed.length} | Friction: ${j.usefulness.general.friction.length} | Fail: ${j.usefulness.general.failed.length}`,
      "",
      "IIVO-specific usefulness:",
      `  Pass: ${j.usefulness.iivoSpecific.passed.length} | Friction: ${j.usefulness.iivoSpecific.friction.length} | Fail: ${j.usefulness.iivoSpecific.failed.length}`,
      "",
      "Friction counts:",
    ];
    for (const [k, v] of Object.entries(j.frictionCounts)) {
      if (v) lines.push(`  ${k}: ${v}`);
    }
    lines.push("", "Product feel:", `  Useful? ${j.productQuestions.feltUseful}`);
    if (j.productQuestions.worseThanChatGPT.length) {
      lines.push(`  Worse than ChatGPT/Claude: ${j.productQuestions.worseThanChatGPT.join(", ")}`);
    }
    if (j.productQuestions.fixNext.length) {
      lines.push("  Fix next:");
      for (const f of j.productQuestions.fixNext.slice(0, 5)) {
        lines.push(`    • ${f}`);
      }
    }
    const agent = j.agentMindSummary;
    lines.push("", "Daily Driver Agent Summary:", "");
    if (agent.mostUsefulAnswer) lines.push(`  Most useful answer: ${agent.mostUsefulAnswer}`);
    if (agent.weakestAnswer) lines.push(`  Weakest answer: ${agent.weakestAnswer}`);
    if (agent.biggestFriction) lines.push(`  Biggest friction: ${agent.biggestFriction}`);
    if (agent.memoryBleedIncidents.length) {
      lines.push(`  Memory bleed: ${agent.memoryBleedIncidents.join(", ")}`);
    }
    if (agent.contextIgnoredIncidents.length) {
      lines.push(`  Context ignored: ${agent.contextIgnoredIncidents.join(", ")}`);
    }
    if (agent.recommendedNextFix) {
      lines.push(`  Recommended next fix: ${agent.recommendedNextFix}`);
    }
    if (j.autoDetectedIssues.length > 0) {
      lines.push("", "Auto-detected issues (Agent Mind):", "");
      for (const issue of j.autoDetectedIssues.slice(0, 8)) {
        lines.push(`  • [${issue.severity}] ${issue.scenarioId}: ${issue.agentMessage}`);
      }
    }
    lines.push(
      "",
      `Agent panel: initialized=${j.agentVisibility.panelInitialized}, reattachs=${j.agentVisibility.reattachCount}`,
      `Report: ${reportPath}`,
      `Agent Mind: ${AGENT_MIND_MD_PATH}`,
      "",
    );
    console.log(lines.join("\n"));
  }
}
