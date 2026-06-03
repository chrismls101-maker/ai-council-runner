/**
 * Daily Driver automatic friction detection + plain-language agent narration.
 */

import type { DailyDriverScenario } from "./dailyDriverScenarios.js";
import type { FrictionKind } from "./dailyDriverReport.js";
import {
  ALWAYS_FORBIDDEN_BLEED_TERMS,
  collectAllowedTerms,
  detectBleedTerms,
} from "./qaBleedScoring.js";
import { scoreAnswerContract } from "./dailyDriverContractScoring.js";
import { scoreArtifactCompliance } from "./dailyDriverArtifactScoring.js";
import { scoreBuilderWorkspace, type BuilderWorkspaceSignals } from "./dailyDriverBuilderScoring.js";

export type AutoIssueType =
  | "memory_bleed"
  | "wrong_route"
  | "generic_answer"
  | "context_ignored"
  | "vision_mismatch"
  | "self_reference_bleed";

export type AutoIssueSeverity = "minor" | "major" | "blocker";

export interface AutoDetectedIssue {
  scenarioId: string;
  type: AutoIssueType;
  severity: AutoIssueSeverity;
  evidence: string;
  agentMessage: string;
}

/** Contextual terms — allowed when prompt/scenario explicitly includes them. */
const CONTEXTUAL_CONTAMINATION_TERMS = [
  "AI Receptionist",
  "receptionist",
  "missed-call recovery",
  "missed calls",
  "missed call",
  "pilot customers",
  "plumbers",
  "HVAC",
];

const SMS_CONTAMINATION_TERMS = ["SMS follow-up", "delayed SMS"];

const IIVO_UNPROMPTED =
  /\bIIVO\b|iivo (decision )?engine|iivo routes|iivo lens|context bridge|council runner/i;

export interface ScenarioScoreOptions {
  durationMs?: number;
  artifactType?: string | null;
  hasArtifact?: boolean;
  effectiveExecutionMode?: string;
}

export interface ScenarioScoreResult {
  frictions: FrictionKind[];
  notes: string[];
  requiredMissed: string[];
  forbiddenHit: string[];
  autoIssues: AutoDetectedIssue[];
  agentMessages: string[];
  routeOk: boolean;
}

function isSupportOrRewriteScenario(scenario: DailyDriverScenario): boolean {
  return (
    scenario.category === "support" ||
    scenario.tags.includes("@support") ||
    /\b(support response|customer says|refund response|reply to a customer|rewrite this|make this sound professional)\b/i.test(
      scenario.prompt,
    )
  );
}

function isHeroRewriteScenario(scenario: DailyDriverScenario): boolean {
  return (
    scenario.category === "rewrite" ||
    scenario.tags.includes("@rewrite") ||
    /\b(rewrite the hero|rewrite this hero|rewrite this|plain.?language|jargon|homepage says|understands it|less corporate)\b/i.test(
      scenario.prompt,
    )
  );
}

/** Fast-lane utility — should be Direct Answer, not council. */
function isFastLaneDirectScenario(scenario: DailyDriverScenario): boolean {
  return (
    isHeroRewriteScenario(scenario) ||
    isSupportOrRewriteScenario(scenario) ||
    /\b(summarize|make this clearer|make this sound human|shorten this|translate|plain english|draft a short|improve this sentence|turn this into a headline)\b/i.test(
      scenario.prompt,
    )
  );
}

function isCouncilRoute(routeText: string): boolean {
  const lower = routeText.toLowerCase();
  return /\b(sales attack|product decision|market research|competitive intelligence|technical audit)\b/i.test(
    lower,
  );
}

function isLegalPolicyScenario(scenario: DailyDriverScenario): boolean {
  return (
    scenario.category === "legal-policy" ||
    scenario.tags.includes("@legal") ||
    /\b(privacy promises?|legal risks?|compliance|not legal advice)\b/i.test(scenario.prompt)
  );
}

/** User asked to produce outreach copy — not merely choosing outreach among options. */
function isSalesOutreachWritingScenario(scenario: DailyDriverScenario): boolean {
  return /\b(write a (cold )?email|write (a )?cold email|cold email to|draft (an )?email|run a cold outreach campaign)\b/i.test(
    scenario.prompt,
  );
}

function isStrategicChoiceScenario(scenario: DailyDriverScenario): boolean {
  return (
    /\b(should i .+ or .+ first|which should .+ build first|build first\?)\b/i.test(scenario.prompt) ||
    (/\bshould i\b/i.test(scenario.prompt) &&
      /\bor\b/i.test(scenario.prompt) &&
      /\b(first|before|instead)\b/i.test(scenario.prompt))
  );
}

function isFeaturePrioritizationScenario(scenario: DailyDriverScenario): boolean {
  return (
    scenario.workflow === "product-decision" ||
    /\b(which should .+ build first|users keep asking for|prioritize)\b/i.test(scenario.prompt)
  );
}

function routeMatchesAccepted(scenario: DailyDriverScenario, routeText: string): boolean {
  if (!routeText || routeText === "(skipped live)") return true;
  const patterns = [
    ...(scenario.acceptedRoutes ?? []),
    ...(scenario.expectedRoute ? [scenario.expectedRoute] : []),
  ];
  if (patterns.length === 0) return true;
  return patterns.some((re) => re.test(routeText));
}

export function buildWrongRouteMessage(
  scenario: DailyDriverScenario,
  routeText: string,
): string | null {
  if (!routeText || routeText === "(skipped live)") return null;
  const routeLower = routeText.toLowerCase();

  if (isSupportOrRewriteScenario(scenario) && /sales attack/i.test(routeLower)) {
    return `I expected Direct Answer because this is a customer support or rewrite task. IIVO routed ${routeText}, which is overkill and likely wrong.`;
  }
  if (isLegalPolicyScenario(scenario) && /sales attack/i.test(routeLower)) {
    return `I expected Direct Answer for a legal/privacy advisory question. IIVO routed ${routeText}, which is the wrong council path.`;
  }
  if (
    (isSupportOrRewriteScenario(scenario) || isHeroRewriteScenario(scenario)) &&
    /product decision/i.test(routeLower)
  ) {
    return `I expected Direct Answer for a simple rewrite/support task, not Product Decision (${routeText}).`;
  }
  if (isHeroRewriteScenario(scenario) && /sales attack/i.test(routeLower)) {
    return `I expected Direct Answer for a marketing rewrite, not Sales Attack (${routeText}).`;
  }
  if (isStrategicChoiceScenario(scenario) && /sales attack/i.test(routeLower)) {
    return `I expected Product Decision or Direct Answer for a strategic validation choice, not Sales Attack (${routeText}).`;
  }
  if (isSalesOutreachWritingScenario(scenario) && !/sales attack/i.test(routeLower)) {
    return `I expected Sales Attack for cold outreach writing. Route observed: ${routeText}.`;
  }
  if (isFeaturePrioritizationScenario(scenario) && !/product decision|direct answer/i.test(routeLower)) {
    return `I expected Product Decision for this prioritization prompt. Route observed: ${routeText}.`;
  }
  if (scenario.expectedRoute && !routeMatchesAccepted(scenario, routeText)) {
    const accepted =
      scenario.acceptedRoutes?.map((r) => r.source).join(" or ") ?? scenario.expectedRoute.source;
    return `Route mismatch: expected ${accepted}, observed ${routeText}.`;
  }
  return null;
}

export function buildMemoryBleedMessage(
  scenario: DailyDriverScenario,
  term: string,
  allowedLower: string[],
): string {
  const allowed = allowedLower.some((a) => term.toLowerCase().includes(a) || a.includes(term.toLowerCase()));
  if (allowed) {
    return `'${term}' appeared, but it was allowed because the user prompt or scenario explicitly includes it.`;
  }
  if (/relevant past outcome/i.test(term)) {
    return `I found '${term}' in a ${scenario.category} answer. Unrelated Decision Learning context should not appear here.`;
  }
  if (/delayed sms|sms follow-up/i.test(term)) {
    return `I found '${term}' in an unrelated ${scenario.category} answer. Old SMS outcome language should not appear unless the user asked about SMS.`;
  }
  return `I found '${term}' in an unrelated ${scenario.category} answer. This is unrelated project context and should be blocked.`;
}

function contaminationTermsForScenario(scenario: DailyDriverScenario): string[] {
  const terms = [
    ...ALWAYS_FORBIDDEN_BLEED_TERMS,
    ...CONTEXTUAL_CONTAMINATION_TERMS,
    ...SMS_CONTAMINATION_TERMS,
  ];
  if (scenario.memoryBleedForbiddenTerms) {
    for (const t of scenario.memoryBleedForbiddenTerms) {
      if (!terms.includes(t)) terms.push(t);
    }
  }
  return [...new Set(terms)];
}

function memoryBleedSeverity(scenario: DailyDriverScenario, term: string): AutoIssueSeverity {
  if (/delayed sms|ai front desk|relevant past outcome/i.test(term)) {
    return "blocker";
  }
  if (scenario.failureSeverity === "blocker") return "blocker";
  return "major";
}

export function scoreScenarioFriction(
  scenario: DailyDriverScenario,
  answer: string,
  routeText: string,
  options?: ScenarioScoreOptions,
): ScenarioScoreResult {
  const frictions: FrictionKind[] = [];
  const notes: string[] = [];
  const requiredMissed: string[] = [];
  const forbiddenHit: string[] = [];
  const autoIssues: AutoDetectedIssue[] = [];
  const agentMessages: string[] = [];
  const promptLower = scenario.prompt.toLowerCase();
  const allowedLower = collectAllowedTerms(scenario);

  if (scenario.category === "legal-policy" && scenario.requiredSignals.length > 1) {
    const matched = scenario.requiredSignals.filter((re) => re.test(answer)).length;
    if (matched < 2) {
      requiredMissed.push(`legal-policy concepts (${matched}/2 groups)`);
    }
  } else {
    for (const re of scenario.requiredSignals) {
      if (!re.test(answer)) requiredMissed.push(re.source);
    }
  }

  for (const re of scenario.forbiddenSignals) {
    if (re.test(answer)) forbiddenHit.push(re.source);
  }

  const bleedTerms = scenario.memoryBleedForbiddenTerms ?? contaminationTermsForScenario(scenario);

  if (scenario.memoryBleedForbiddenTerms || scenario.audience === "general") {
    for (const term of detectBleedTerms(answer, bleedTerms, allowedLower)) {
      forbiddenHit.push(term);
      if (!frictions.includes("memory_bleed")) frictions.push("memory_bleed");
      const msg = buildMemoryBleedMessage(scenario, term, allowedLower);
      notes.push(msg);
      agentMessages.push(msg);
      if (!msg.includes("allowed because")) {
        autoIssues.push({
          scenarioId: scenario.id,
          type: "memory_bleed",
          severity: memoryBleedSeverity(scenario, term),
          evidence: term,
          agentMessage: msg,
        });
      }
    }
  }

  const wrongRouteMsg = buildWrongRouteMessage(scenario, routeText);
  const routeOk = !wrongRouteMsg && routeMatchesAccepted(scenario, routeText);
  if (wrongRouteMsg) {
    frictions.push("wrong_route");
    notes.push(wrongRouteMsg);
    agentMessages.push(wrongRouteMsg);
    const routeSeverity: AutoIssueSeverity =
      isSupportOrRewriteScenario(scenario) ||
      isLegalPolicyScenario(scenario) ||
      isHeroRewriteScenario(scenario) ||
      /delayed sms|memory_bleed/i.test(wrongRouteMsg)
        ? "major"
        : "minor";
    autoIssues.push({
      scenarioId: scenario.id,
      type: "wrong_route",
      severity: routeSeverity,
      evidence: routeText,
      agentMessage: wrongRouteMsg,
    });
  } else if (scenario.expectedRoute && !routeMatchesAccepted(scenario, routeText)) {
    frictions.push("wrong_route");
    notes.push(`Route was "${routeText}"`);
  }

  if (isFastLaneDirectScenario(scenario) && routeText && isCouncilRoute(routeText)) {
    const overMsg = `Simple rewrite/utility prompt was routed to ${routeText} — council is overkill for daily-driver feel.`;
    if (!frictions.includes("over_routed")) frictions.push("over_routed");
    notes.push(overMsg);
    agentMessages.push(overMsg);
    const overSeverity: AutoIssueSeverity =
      (options?.durationMs ?? 0) > 45_000 ? "blocker" : "major";
    autoIssues.push({
      scenarioId: scenario.id,
      type: "wrong_route",
      severity: overSeverity,
      evidence: routeText,
      agentMessage: overMsg,
    });
    if ((options?.durationMs ?? 0) > 45_000 && !frictions.includes("too_slow")) {
      frictions.push("too_slow");
      notes.push("Council run exceeded 45s on a fast-lane utility prompt.");
    }
  }

  const contractScore = scoreAnswerContract(scenario.prompt, answer);
  for (const f of contractScore.frictions) {
    if (!frictions.includes(f)) frictions.push(f);
  }
  for (const note of contractScore.notes) {
    notes.push(note);
    agentMessages.push(note);
    if (/contract violation|deliverable|strategy report/i.test(note)) {
      autoIssues.push({
        scenarioId: scenario.id,
        type: "wrong_route",
        severity: /deliverable_not_first|wrong_output_format/.test(frictions.join(" "))
          ? "blocker"
          : "major",
        evidence: routeText,
        agentMessage: note,
      });
    }
  }

  const artifactScore = scoreArtifactCompliance(scenario, answer, {
    artifactType: options?.artifactType,
    hasArtifact: options?.hasArtifact,
  });
  for (const f of artifactScore.frictions) {
    if (!frictions.includes(f)) frictions.push(f);
  }
  for (const note of artifactScore.notes) {
    notes.push(note);
    agentMessages.push(note);
  }

  if (options?.builderWorkspace) {
    const builderScore = scoreBuilderWorkspace(scenario, options.builderWorkspace);
    for (const f of builderScore.frictions) {
      if (!frictions.includes(f)) frictions.push(f);
    }
    for (const note of builderScore.notes) {
      notes.push(note);
      agentMessages.push(note);
    }
  }

  if (options?.durationMs) {
    const ms = options.durationMs;
    const isFastLane = isFastLaneDirectScenario(scenario);
    const effectiveLower = options.effectiveExecutionMode?.toLowerCase() ?? "";
    const isQuickEffective =
      effectiveLower.includes("quick") ||
      (isFastLane && !isCouncilRoute(routeText));

    if (isQuickEffective) {
      if (ms > 60_000) {
        if (!frictions.includes("too_slow")) frictions.push("too_slow");
        notes.push(`Quick effective mode took ${Math.round(ms / 1000)}s — blocker (>60s).`);
        agentMessages.push(
          `Quick Mode run took ${Math.round(ms / 1000)}s — far slower than ChatGPT/Claude daily-driver target.`,
        );
      } else if (ms > 45_000) {
        if (!frictions.includes("too_slow")) frictions.push("too_slow");
        notes.push(`Quick effective mode took ${Math.round(ms / 1000)}s — major friction (>45s).`);
      } else if (ms > 30_000 && !frictions.includes("worse_than_chatgpt")) {
        frictions.push("worse_than_chatgpt");
        notes.push(`Quick effective mode took ${Math.round(ms / 1000)}s — worse than ChatGPT feel (>30s).`);
      }
    }

    if (
      (effectiveLower.includes("council") || isCouncilRoute(routeText)) &&
      ms > 150_000 &&
      !frictions.includes("too_slow")
    ) {
      frictions.push("too_slow");
      notes.push(`Council effective mode took ${Math.round(ms / 1000)}s — over 150s budget.`);
    }

    if (isFastLane && isCouncilRoute(routeText) && ms > 45_000) {
      if (!frictions.includes("too_slow")) frictions.push("too_slow");
      if (!frictions.includes("over_routed")) frictions.push("over_routed");
      notes.push(`Fast-lane task took ${Math.round(ms / 1000)}s on council route — blocker for daily-driver feel.`);
    } else if (isFastLane && ms > 20_000 && !isCouncilRoute(routeText) && !isQuickEffective) {
      notes.push(`Fast-lane direct answer took ${Math.round(ms / 1000)}s (target under 20s).`);
    } else if (
      /\b(write|draft).*(cold email)\b/i.test(scenario.prompt) &&
      ms > 90_000 &&
      !frictions.includes("too_slow")
    ) {
      frictions.push("too_slow");
      notes.push(`Sales email deliverable took ${Math.round(ms / 1000)}s — performance friction (>90s).`);
      agentMessages.push("One-off sales asset took over 90s — suggest Quick Mode for single emails.");
    }
  }

  if (requiredMissed.length > 0) {
    frictions.push("generic_answer");
    const msg = `The answer was safe but generic. It did not include enough required signals (${requiredMissed.slice(0, 3).join(", ")}).`;
    notes.push(msg);
    agentMessages.push(msg);
    autoIssues.push({
      scenarioId: scenario.id,
      type: "generic_answer",
      severity: "minor",
      evidence: requiredMissed.join(", "),
      agentMessage: msg,
    });
  }

  if (scenario.contextRequired && answer.length > 80 && !/context|attached|based on/i.test(answer)) {
    frictions.push("context_ignored");
    const msg = "Attached context was expected but not clearly used in the answer.";
    notes.push(msg);
    agentMessages.push(msg);
    autoIssues.push({
      scenarioId: scenario.id,
      type: "context_ignored",
      severity: "major",
      evidence: "no context reference",
      agentMessage: msg,
    });
  }

  if (
    scenario.forbidSelfReference &&
    IIVO_UNPROMPTED.test(answer) &&
    !/\biivo\b/i.test(promptLower)
  ) {
    frictions.push("self_reference_bleed", "worse_than_chatgpt");
    const msg = "Answer mentioned IIVO unprompted on a general business task.";
    notes.push(msg);
    agentMessages.push(msg);
    autoIssues.push({
      scenarioId: scenario.id,
      type: "self_reference_bleed",
      severity: "major",
      evidence: "IIVO",
      agentMessage: msg,
    });
  }

  if (/as an ai language model|i hope this helps|here are some general/i.test(answer)) {
    frictions.push("generic_answer", "worse_than_chatgpt");
    notes.push("Generic assistant phrasing detected");
  }

  const needsConcreteStep =
    scenario.audience === "general" &&
    scenario.category !== "rewrite" &&
    scenario.category !== "legal-policy" &&
    !/summarize|explain the difference|headline|interview question|5.second test/i.test(scenario.prompt);
  if (
    needsConcreteStep &&
    answer.length > 120 &&
    !/\d\.|first,|next step|this week|48 hour|within \d+ (day|hour)|tomorrow|today/i.test(answer)
  ) {
    frictions.push("worse_than_chatgpt");
    notes.push("No concrete next step or time-bound action detected");
  }

  if (
    scenario.liveVisionRequired &&
    answer.length > 0 &&
    /cannot see|can't see|no image|unable to view the screenshot/i.test(answer)
  ) {
    frictions.push("technical_fail");
    const msg = "Vision was enabled but the answer says it cannot see the screenshot — blocker.";
    notes.push(msg);
    agentMessages.push(msg);
    autoIssues.push({
      scenarioId: scenario.id,
      type: "vision_mismatch",
      severity: "blocker",
      evidence: "cannot see image",
      agentMessage: msg,
    });
  }

  if (frictions.length === 0 && answer.length > 40) {
    frictions.push("useful_answer");
  }

  return {
    frictions,
    notes,
    requiredMissed,
    forbiddenHit,
    autoIssues,
    agentMessages,
    routeOk,
  };
}
