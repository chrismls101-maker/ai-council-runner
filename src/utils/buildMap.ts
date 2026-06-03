import type {
  ArtifactChecklist,
  ArtifactSection,
  ArtifactTable,
  ArtifactType,
} from "../types/artifacts";

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

function sectionText(section: ArtifactSection): string {
  if (typeof section.content === "string") return section.content.trim();
  if (section.kind === "checklist") {
    return (section.content as ArtifactChecklist).items.map((i) => i.label).join(" ");
  }
  if (section.kind === "table" && typeof section.content !== "string") {
    const t = section.content as ArtifactTable;
    return t.columns.join(" ") + String(t.rows.length);
  }
  return "";
}

type Template = { id: string; label: string; match?: RegExp };

const TEMPLATES: Partial<Record<ArtifactType, Template[]>> = {
  landing_page_copy: [
    { id: "hero", label: "Hero", match: /hero|headline/i },
    { id: "problem", label: "Problem", match: /problem|pain/i },
    { id: "solution", label: "Solution", match: /solution/i },
    { id: "proof", label: "Proof", match: /proof|trust/i },
    { id: "how", label: "How it Works", match: /how|works/i },
    { id: "pricing", label: "Pricing / Offer", match: /pricing|offer/i },
    { id: "faq", label: "FAQ", match: /faq/i },
    { id: "cta", label: "CTA", match: /cta/i },
  ],
  cold_email: [
    { id: "subjects", label: "Subject options", match: /subject/i },
    { id: "opening", label: "Opening line", match: /opening|intro/i },
    { id: "pain", label: "Pain / problem", match: /pain|problem/i },
    { id: "offer", label: "Offer", match: /offer/i },
    { id: "cta", label: "CTA", match: /cta/i },
    { id: "followup", label: "Follow-up", match: /follow/i },
  ],
  proposal: [
    { id: "summary", label: "Executive summary", match: /executive|summary/i },
    { id: "scope", label: "Scope", match: /scope/i },
    { id: "deliverables", label: "Deliverables", match: /deliverable/i },
    { id: "timeline", label: "Timeline", match: /timeline/i },
    { id: "pricing", label: "Pricing", match: /pricing/i },
    { id: "terms", label: "Terms", match: /terms/i },
    { id: "next", label: "Next step", match: /next/i },
  ],
  financial_table: [
    { id: "columns", label: "Columns", match: /column/i },
    { id: "rows", label: "Rows", match: /row/i },
    { id: "totals", label: "Totals", match: /total/i },
    { id: "assumptions", label: "Assumptions", match: /assumption/i },
    { id: "notes", label: "Notes", match: /note/i },
  ],
  website_audit: [
    { id: "context", label: "Screenshot / context", match: /screenshot|context/i },
    { id: "impression", label: "First impression", match: /first impression/i },
    { id: "clarity", label: "Clarity issues", match: /clarity/i },
    { id: "trust", label: "Trust issues", match: /trust/i },
    { id: "conversion", label: "Conversion blockers", match: /conversion/i },
    { id: "fixes", label: "Priority fixes", match: /priority|fix/i },
  ],
};

function findSection(t: Template, sections: ArtifactSection[]): ArtifactSection | undefined {
  return (
    sections.find((s) => s.id === t.id) ??
    (t.match ? sections.find((s) => t.match!.test(s.label)) : undefined)
  );
}

function score(s: ArtifactSection | undefined, label: string, id: string): BuildMapSection {
  if (!s) {
    return { id, label, status: "missing", reason: "Section not found", recommendedAction: "Add section" };
  }
  const len = sectionText(s).length;
  if (len < 20) {
    return { id: s.id, label: s.label, status: "weak", reason: "Very short", recommendedAction: "Improve section" };
  }
  if (len < 80) {
    return { id: s.id, label: s.label, status: "weak", reason: "Needs more detail", recommendedAction: "Expand section" };
  }
  return { id: s.id, label: s.label, status: "complete" };
}

export function buildArtifactMap(
  artifactType: ArtifactType,
  title: string,
  sections: ArtifactSection[],
): BuildMap {
  const template = TEMPLATES[artifactType];
  if (!template?.length) {
    const mapped = sections.map((s) => score(s, s.label, s.id));
    const complete = mapped.filter((m) => m.status === "complete").length;
    return {
      artifactType,
      title,
      sections: mapped,
      overallCompleteness: sections.length ? Math.round((complete / sections.length) * 100) : 0,
    };
  }
  const mapped = template.map((t) => {
    const s = findSection(t, sections);
    const sc = score(s, t.label, s?.id ?? t.id);
    return s ? sc : { ...sc, status: "missing" as const, reason: "Expected section missing", recommendedAction: "Add section" };
  });
  const complete = mapped.filter((m) => m.status === "complete").length;
  return { artifactType, title, sections: mapped, overallCompleteness: Math.round((complete / mapped.length) * 100) };
}
