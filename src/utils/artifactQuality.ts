import type {
  ArtifactChecklist,
  ArtifactSection,
  ArtifactTable,
  ArtifactType,
} from "../types/artifacts";

export type ArtifactQualityScore = {
  overall: number;
  dimensions: Array<{ label: string; score: number; reason: string }>;
  missingPieces: string[];
  risks: string[];
  suggestedFixes: Array<{
    id: string;
    label: string;
    targetSectionId?: string;
    severity: "minor" | "major" | "critical";
  }>;
};

function sectionPlainText(section: ArtifactSection): string {
  if (typeof section.content === "string") return section.content;
  if (section.kind === "checklist") {
    return (section.content as ArtifactChecklist).items.map((i) => i.label).join(" ");
  }
  if (section.kind === "table" && typeof section.content !== "string") {
    const t = section.content as ArtifactTable;
    return `${t.columns.join(" ")} ${t.rows.length}`;
  }
  return "";
}

function hasSection(sections: ArtifactSection[], pattern: RegExp): boolean {
  return sections.some((s) => pattern.test(s.label) || pattern.test(sectionPlainText(s)));
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function scoreColdEmail(sections: ArtifactSection[], fullText: string): ArtifactQualityScore {
  const dimensions: ArtifactQualityScore["dimensions"] = [];
  const missing: string[] = [];
  const risks: string[] = [];
  const fixes: ArtifactQualityScore["suggestedFixes"] = [];

  const hasCta = /cta|call to action|reply|book|schedule/i.test(fullText);
  const hasSubject = hasSection(sections, /subject/i);
  const tooLong = wordCount(fullText) > 220;
  const spammy = /\b(guaranteed|act now|limited time|free!!!)\b/i.test(fullText);
  const clearOffer = /offer|value|help you|we can/i.test(fullText);

  dimensions.push({
    label: "Clarity",
    score: clearOffer ? 85 : 55,
    reason: clearOffer ? "Offer is identifiable" : "Offer is vague",
  });
  dimensions.push({
    label: "Actionability",
    score: hasCta ? 88 : 45,
    reason: hasCta ? "CTA present" : "No clear CTA",
  });
  dimensions.push({
    label: "Format fit",
    score: tooLong ? 60 : 90,
    reason: tooLong ? "Email may be too long" : "Length fits cold email",
  });

  if (!hasCta) {
    missing.push("Clear CTA");
    fixes.push({ id: "cta", label: "Add a clear CTA", severity: "critical" });
  }
  if (!hasSubject) {
    missing.push("Subject line options");
    fixes.push({ id: "subject", label: "Add subject options", severity: "major" });
  }
  if (tooLong) {
    risks.push("Email may be too long for cold outreach");
    fixes.push({ id: "shorten", label: "Shorten the email", severity: "minor" });
  }
  if (spammy) {
    risks.push("Tone may sound spammy");
    fixes.push({ id: "tone", label: "Reduce hype language", severity: "major" });
  }

  const overall = Math.round(
    dimensions.reduce((a, d) => a + d.score, 0) / Math.max(dimensions.length, 1),
  );
  return { overall, dimensions, missingPieces: missing, risks, suggestedFixes: fixes };
}

function scoreLanding(_sections: ArtifactSection[], fullText: string): ArtifactQualityScore {
  const dimensions: ArtifactQualityScore["dimensions"] = [];
  const missing: string[] = [];
  const risks: string[] = [];
  const fixes: ArtifactQualityScore["suggestedFixes"] = [];

  const headline = /headline|hero/i.test(fullText);
  const benefit = /benefit|save|grow|faster|reduce/i.test(fullText);
  const cta = /cta|get started|sign up|book|try/i.test(fullText);
  const proof = /proof|testimonial|trusted|clients|case study/i.test(fullText);
  const pricing = /pricing|plan|\$/i.test(fullText);

  dimensions.push({
    label: "Clarity",
    score: headline ? 82 : 50,
    reason: headline ? "Headline present" : "Headline unclear",
  });
  dimensions.push({
    label: "Conversion strength",
    score: cta ? 86 : 48,
    reason: cta ? "CTA visible" : "CTA weak or missing",
  });
  dimensions.push({
    label: "Trust strength",
    score: proof ? 80 : 55,
    reason: proof ? "Proof elements present" : "Trust/proof thin",
  });

  if (!headline) {
    missing.push("Clear headline");
    fixes.push({ id: "hero", label: "Strengthen hero headline", severity: "critical" });
  }
  if (!benefit) {
    missing.push("Visible benefit");
    fixes.push({ id: "benefit", label: "Clarify core benefit", severity: "major" });
  }
  if (!cta) {
    missing.push("Clear CTA");
    fixes.push({ id: "cta", label: "Add primary CTA", severity: "critical" });
  }
  if (!proof) {
    risks.push("Trust/proof may be missing");
    fixes.push({ id: "proof", label: "Add proof or social proof", severity: "major" });
  }
  if (!pricing) {
    risks.push("Pricing/offer clarity may be weak");
  }

  const overall = Math.round(dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length);
  return { overall, dimensions, missingPieces: missing, risks, suggestedFixes: fixes };
}

function scoreFinancialTable(sections: ArtifactSection[]): ArtifactQualityScore {
  const table = sections.find((s) => s.kind === "table" && typeof s.content !== "string");
  const dimensions: ArtifactQualityScore["dimensions"] = [];
  const missing: string[] = [];
  const risks: string[] = [];
  const fixes: ArtifactQualityScore["suggestedFixes"] = [];

  if (!table || typeof table.content === "string") {
    return {
      overall: 40,
      dimensions: [{ label: "Data completeness", score: 40, reason: "No table found" }],
      missingPieces: ["Financial table data"],
      risks: ["Artifact may not be a valid table"],
      suggestedFixes: [{ id: "table", label: "Add table with columns and rows", severity: "critical" }],
    };
  }

  const t = table.content as ArtifactTable;
  const hasTotals = Boolean(t.totals && Object.keys(t.totals).length);
  const hasAssumptions = hasSection(sections, /assumption/i);
  const emptyRows = t.rows.length === 0;

  dimensions.push({
    label: "Data completeness",
    score: t.columns.length >= 2 && !emptyRows ? 88 : 45,
    reason: t.columns.length >= 2 && !emptyRows ? "Table has structure" : "Table structure weak",
  });
  dimensions.push({
    label: "Format fit",
    score: hasTotals ? 85 : 60,
    reason: hasTotals ? "Totals present" : "Totals missing",
  });

  if (!hasTotals) {
    missing.push("Row/column totals");
    fixes.push({ id: "totals", label: "Add totals row", severity: "major", targetSectionId: table.id });
  }
  if (!hasAssumptions) {
    missing.push("Assumptions");
    fixes.push({ id: "assumptions", label: "Document assumptions", severity: "major" });
  }
  if (emptyRows) {
    risks.push("Table has no data rows");
    fixes.push({ id: "rows", label: "Populate table rows", severity: "critical", targetSectionId: table.id });
  }

  const overall = Math.round(dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length);
  return { overall, dimensions, missingPieces: missing, risks, suggestedFixes: fixes };
}

function scoreGeneric(sections: ArtifactSection[], fullText: string): ArtifactQualityScore {
  const wc = wordCount(fullText);
  const sectionCount = sections.length;
  const completeness = sectionCount >= 2 && wc > 120 ? 82 : sectionCount >= 1 ? 65 : 40;
  const clarity = wc > 80 ? 78 : 52;
  const overall = Math.round((completeness + clarity) / 2);
  return {
    overall,
    dimensions: [
      { label: "Completeness", score: completeness, reason: `${sectionCount} sections, ${wc} words` },
      { label: "Clarity", score: clarity, reason: wc > 80 ? "Adequate detail" : "Needs more detail" },
    ],
    missingPieces: sectionCount < 2 ? ["Additional structured sections"] : [],
    risks: wc < 60 ? ["Content may be too thin for this artifact type"] : [],
    suggestedFixes: wc < 80 ? [{ id: "expand", label: "Expand key sections", severity: "minor" }] : [],
  };
}

export function scoreArtifactQuality(
  artifactType: ArtifactType,
  sections: ArtifactSection[],
): ArtifactQualityScore {
  const fullText = sections.map((s) => sectionPlainText(s)).join("\n\n");

  switch (artifactType) {
    case "cold_email":
    case "email_template":
    case "follow_up_sequence":
      return scoreColdEmail(sections, fullText);
    case "landing_page_copy":
    case "canvas_project":
      return scoreLanding(sections, fullText);
    case "financial_table":
    case "comparison_table":
      return scoreFinancialTable(sections);
    default:
      return scoreGeneric(sections, fullText);
  }
}
