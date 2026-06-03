import type { DecisionQuality } from "../types/decisionQuality";

function extractSection(markdown: string, heading: string): string | undefined {
  const pattern = new RegExp(
    `^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "im",
  );
  const match = markdown.match(pattern);
  if (!match || match.index == null) return undefined;
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.search(/^##\s+/m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim() || undefined;
}

function fieldValue(section: string | undefined, label: string): string | undefined {
  if (!section) return undefined;
  const re = new RegExp(
    `(?:\\*\\*)?${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\*\\*)?\\s*:\\s*(.+)$`,
    "im",
  );
  return section.match(re)?.[1]?.trim().replace(/^\*\*|\*\*$/g, "");
}

function parseConfidence(value: string | undefined): DecisionQuality["confidence"] {
  if (!value) return undefined;
  const n = value.toLowerCase();
  if (n.includes("high")) return "High";
  if (n.includes("medium") || n.includes("med")) return "Medium";
  if (n.includes("low")) return "Low";
  return undefined;
}

function parseScore(value: string | undefined): number | undefined {
  const match = value?.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const score = Number(match[1]);
  if (Number.isNaN(score)) return undefined;
  return Math.min(10, Math.max(1, Math.round(score)));
}

function parseBulletList(section: string | undefined): string[] {
  if (!section) return [];
  return section
    .split(/\n/)
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter((line) => line.length > 0 && !/^none identified\.?$/i.test(line));
}

function inferRiskLevel(flags: string[], mainRisk?: string): DecisionQuality["riskLevel"] {
  const text = [...flags, mainRisk ?? ""].join(" ").toLowerCase();
  if (/not verified|no direct evidence|unsupported|not found|high risk/.test(text)) {
    return "High";
  }
  if (/weak source|untested|partially verified|medium risk|assumption/.test(text)) {
    return "Medium";
  }
  if (flags.length >= 3) return "High";
  if (flags.length >= 1) return "Medium";
  return "Low";
}

export function parseDecisionQualityFromMarkdown(
  finalJudgeOutput: string,
): DecisionQuality {
  const qualitySection = extractSection(finalJudgeOutput, "Decision Quality");
  const riskSection = extractSection(finalJudgeOutput, "Risk Flags");
  const nextMoveSection = extractSection(finalJudgeOutput, "Next Move");
  const riskFlags = parseBulletList(riskSection);
  const mainRisk = fieldValue(qualitySection, "Main risk");

  return {
    recommendedAction: fieldValue(qualitySection, "Recommended Action"),
    confidence: parseConfidence(fieldValue(qualitySection, "Confidence")),
    decisionScore: parseScore(fieldValue(qualitySection, "Decision Score")),
    whyThisScore: fieldValue(qualitySection, "Why this score"),
    mainRisk,
    missingInformation: fieldValue(qualitySection, "Missing information"),
    nextAction24h: fieldValue(qualitySection, "Next action within 24 hours"),
    whatWouldChangeDecision: fieldValue(
      qualitySection,
      "What would change the decision",
    ),
    riskFlags,
    riskLevel: inferRiskLevel(riskFlags, mainRisk),
    nextMove: nextMoveSection
      ? {
          doThisFirst: fieldValue(nextMoveSection, "Do this first"),
          timeEstimate: fieldValue(nextMoveSection, "Time estimate"),
          expectedResult: fieldValue(nextMoveSection, "Expected result"),
          ifItFails: fieldValue(nextMoveSection, "If it fails, do this"),
        }
      : undefined,
  };
}

export function resolveDecisionQuality(
  stored: DecisionQuality | undefined,
  finalJudgeOutput: string | undefined,
): DecisionQuality | undefined {
  if (stored && (stored.recommendedAction || stored.confidence || stored.decisionScore)) {
    return stored;
  }
  if (!finalJudgeOutput?.trim()) return undefined;
  const parsed = parseDecisionQualityFromMarkdown(finalJudgeOutput);
  if (
    parsed.recommendedAction ||
    parsed.confidence ||
    parsed.decisionScore ||
    parsed.riskFlags.length > 0
  ) {
    return parsed;
  }
  return undefined;
}

export function riskBadgeClass(level: string | undefined): string {
  switch (level) {
    case "High":
      return "risk-high";
    case "Medium":
      return "risk-medium";
    default:
      return "risk-low";
  }
}
