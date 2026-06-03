import type { ArtifactSection, ArtifactType } from "./artifactTypes.js";
import { sectionPlainText } from "./sectionText.js";

export type BuildMapSectionStatus = "complete" | "missing" | "weak";

export type BuildMapSection = {
  id: string;
  label: string;
  status: BuildMapSectionStatus;
  reason?: string;
  recommendedAction?: string;
};

export type BuildMap = {
  artifactType: ArtifactType;
  title: string;
  sections: BuildMapSection[];
  overallCompleteness: number;
};

type TemplateSection = { id: string; label: string; match?: RegExp };

const BUILD_MAP_TEMPLATES: Partial<Record<ArtifactType, TemplateSection[]>> = {
  landing_page_copy: [
    { id: "hero", label: "Hero", match: /hero|headline/i },
    { id: "problem", label: "Problem", match: /problem|pain/i },
    { id: "solution", label: "Solution", match: /solution|offer/i },
    { id: "proof", label: "Proof", match: /proof|trust|testimonial/i },
    { id: "how", label: "How it Works", match: /how|works|process/i },
    { id: "pricing", label: "Pricing / Offer", match: /pricing|offer|plan/i },
    { id: "faq", label: "FAQ", match: /faq|question/i },
    { id: "cta", label: "CTA", match: /cta|call to action/i },
  ],
  cold_email: [
    { id: "subjects", label: "Subject options", match: /subject/i },
    { id: "opening", label: "Opening line", match: /opening|intro/i },
    { id: "pain", label: "Pain / problem", match: /pain|problem/i },
    { id: "offer", label: "Offer", match: /offer|value/i },
    { id: "cta", label: "CTA", match: /cta|call|next step/i },
    { id: "followup", label: "Follow-up", match: /follow/i },
  ],
  proposal: [
    { id: "summary", label: "Executive summary", match: /executive|summary/i },
    { id: "scope", label: "Scope", match: /scope/i },
    { id: "deliverables", label: "Deliverables", match: /deliverable/i },
    { id: "timeline", label: "Timeline", match: /timeline|schedule/i },
    { id: "pricing", label: "Pricing", match: /pricing|investment/i },
    { id: "terms", label: "Terms", match: /terms/i },
    { id: "next", label: "Next step", match: /next/i },
  ],
  financial_table: [
    { id: "columns", label: "Columns", match: /column|header/i },
    { id: "rows", label: "Rows", match: /row|data/i },
    { id: "totals", label: "Totals", match: /total/i },
    { id: "assumptions", label: "Assumptions", match: /assumption/i },
    { id: "notes", label: "Notes", match: /note/i },
  ],
  website_audit: [
    { id: "context", label: "Screenshot / context", match: /screenshot|context/i },
    { id: "impression", label: "First impression", match: /first impression/i },
    { id: "clarity", label: "Clarity issues", match: /clarity/i },
    { id: "trust", label: "Trust issues", match: /trust/i },
    { id: "conversion", label: "Conversion blockers", match: /conversion|blocker/i },
    { id: "fixes", label: "Priority fixes", match: /priority|fix/i },
  ],
  canvas_project: [
    { id: "overview", label: "Overview", match: /overview|summary/i },
    { id: "sections", label: "Core sections", match: /section|body/i },
    { id: "cta", label: "CTA", match: /cta/i },
  ],
  report: [
    { id: "summary", label: "Summary", match: /summary|overview/i },
    { id: "findings", label: "Findings", match: /finding|issue/i },
    { id: "recommendations", label: "Recommendations", match: /recommend/i },
  ],
  campaign_plan: [
    { id: "objective", label: "Objective", match: /objective|goal/i },
    { id: "audience", label: "Audience", match: /audience/i },
    { id: "channels", label: "Channels", match: /channel/i },
    { id: "timeline", label: "Timeline", match: /timeline/i },
  ],
};

function matchSection(template: TemplateSection, sections: ArtifactSection[]): ArtifactSection | undefined {
  if (sections.some((s) => s.id === template.id)) {
    return sections.find((s) => s.id === template.id);
  }
  if (template.match) {
    return sections.find((s) => template.match!.test(s.label) || template.match!.test(s.id));
  }
  return undefined;
}

function scoreSection(section: ArtifactSection | undefined): BuildMapSection {
  if (!section) {
    return {
      id: "",
      label: "",
      status: "missing",
      reason: "Section not found in artifact",
      recommendedAction: "Add section",
    };
  }
  const text = sectionPlainText(section).trim();
  const len = text.length;
  if (len < 20) {
    return {
      id: section.id,
      label: section.label,
      status: "weak",
      reason: "Section is very short",
      recommendedAction: "Improve section",
    };
  }
  if (len < 80) {
    return {
      id: section.id,
      label: section.label,
      status: "weak",
      reason: "Section may need more detail",
      recommendedAction: "Expand section",
    };
  }
  return { id: section.id, label: section.label, status: "complete" };
}

function genericMap(artifactType: ArtifactType, title: string, sections: ArtifactSection[]): BuildMap {
  const mapped = sections.map((s) => scoreSection(s));
  const complete = mapped.filter((m) => m.status === "complete").length;
  const overall = sections.length ? Math.round((complete / sections.length) * 100) : 0;
  return { artifactType, title, sections: mapped, overallCompleteness: overall };
}

export function buildArtifactMap(
  artifactType: ArtifactType,
  title: string,
  sections: ArtifactSection[],
): BuildMap {
  const template = BUILD_MAP_TEMPLATES[artifactType];
  if (!template?.length) {
    return genericMap(artifactType, title, sections);
  }

  const mapped: BuildMapSection[] = template.map((t) => {
    const matched = matchSection(t, sections);
    const scored = scoreSection(matched);
    return {
      ...scored,
      id: matched?.id ?? t.id,
      label: t.label,
      status: matched ? scored.status : "missing",
      reason: matched ? scored.reason : "Expected section not present",
      recommendedAction: matched ? scored.recommendedAction : "Add section",
    };
  });

  const complete = mapped.filter((m) => m.status === "complete").length;
  const overall = Math.round((complete / mapped.length) * 100);

  return { artifactType, title, sections: mapped, overallCompleteness: overall };
}
