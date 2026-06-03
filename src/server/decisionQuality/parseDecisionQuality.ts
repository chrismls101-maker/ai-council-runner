import type { ConfidenceLevel, DecisionQuality, RiskLevel } from "./types.js";

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
  const body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
  return body || undefined;
}

function fieldValue(section: string | undefined, label: string): string | undefined {
  if (!section) return undefined;
  const re = new RegExp(
    `(?:\\*\\*)?${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\*\\*)?\\s*:\\s*(.+)$`,
    "im",
  );
  const match = section.match(re);
  return match?.[1]?.trim().replace(/^\*\*|\*\*$/g, "");
}

function parseConfidence(value: string | undefined): ConfidenceLevel | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("high")) return "High";
  if (normalized.includes("medium") || normalized.includes("med")) return "Medium";
  if (normalized.includes("low")) return "Low";
  return undefined;
}

function parseScore(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const score = Number(match[1]);
  if (Number.isNaN(score)) return undefined;
  return Math.min(10, Math.max(1, Math.round(score)));
}

function parseBulletList(section: string | undefined): string[] {
  if (!section) return [];
  const items = section
    .split(/\n/)
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter((line) => line.length > 0 && !/^none identified\.?$/i.test(line));
  return items;
}

function inferRiskLevel(flags: string[], mainRisk?: string): RiskLevel {
  const text = [...flags, mainRisk ?? ""].join(" ").toLowerCase();
  if (
    /not verified|no direct evidence|unsupported|not found|high risk|overbuilding|manual confirmation required/.test(
      text,
    )
  ) {
    return "High";
  }
  if (
    /weak source|untested|partially verified|medium risk|assumption|requires manual/.test(
      text,
    )
  ) {
    return "Medium";
  }
  if (flags.length === 0 && !mainRisk) return "Low";
  if (flags.length >= 3) return "High";
  if (flags.length >= 1) return "Medium";
  return "Low";
}

export function parseDecisionQuality(finalJudgeOutput: string): DecisionQuality {
  const qualitySection = extractSection(finalJudgeOutput, "Decision Quality");
  const riskSection =
    extractSection(finalJudgeOutput, "Risk Flags") ??
    fieldValue(extractSection(finalJudgeOutput, "Final Action Plan"), "Risk Flags");
  const nextMoveSection = extractSection(finalJudgeOutput, "Next Move");

  const riskFlags = parseBulletList(riskSection);
  const mainRisk = fieldValue(qualitySection, "Main risk");

  const quality: DecisionQuality = {
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

  return quality;
}

export function hasDecisionQualityContent(quality: DecisionQuality): boolean {
  return Boolean(
    quality.recommendedAction ||
      quality.confidence ||
      quality.decisionScore ||
      quality.riskFlags.length > 0 ||
      quality.nextMove?.doThisFirst,
  );
}
