import type { ArtifactSection, ArtifactTable, ArtifactType, IivoArtifact } from "./artifactTypes.js";

export type ArtifactValidationSeverity = "none" | "minor" | "major" | "blocker";

export type ArtifactValidationResult = {
  valid: boolean;
  issues: string[];
  severity: ArtifactValidationSeverity;
};

function sectionText(section: ArtifactSection): string {
  if (typeof section.content === "string") return section.content.trim();
  return "";
}

function sectionTable(section: ArtifactSection): ArtifactTable | null {
  if (typeof section.content === "object" && section.content !== null && "columns" in section.content) {
    return section.content as ArtifactTable;
  }
  return null;
}

function hasEmailBody(artifact: IivoArtifact): boolean {
  return artifact.sections.some(
    (s) =>
      s.kind === "email_body" &&
      sectionText(s).length >= 10,
  );
}

function hasSupportReply(artifact: IivoArtifact): boolean {
  return artifact.sections.some(
    (s) =>
      (s.kind === "email_body" || s.label.toLowerCase().includes("reply")) &&
      sectionText(s).length >= 10,
  );
}

function hasValidTable(artifact: IivoArtifact): boolean {
  for (const s of artifact.sections) {
    const table = sectionTable(s);
    if (table && table.columns.length >= 2 && table.rows.length >= 1) return true;
  }
  return false;
}

function hasUsefulSections(artifact: IivoArtifact): boolean {
  return artifact.sections.some((s) => {
    const text = sectionText(s);
    if (text.length >= 20) return true;
    if (s.kind === "checklist" && typeof s.content === "object" && "items" in s.content) {
      const items = (s.content as { items: unknown[] }).items;
      return items.length > 0;
    }
    if (s.kind === "table") return hasValidTable({ ...artifact, sections: [s] });
    return false;
  });
}

export function validateArtifact(artifact: IivoArtifact): ArtifactValidationResult {
  const issues: string[] = [];

  if (!artifact.title?.trim()) issues.push("Missing artifact title");
  if (!artifact.sections?.length) issues.push("No sections");

  switch (artifact.type) {
    case "cold_email":
    case "email_template":
    case "follow_up_sequence":
      if (!hasEmailBody(artifact)) issues.push("Cold email artifact missing email body");
      break;
    case "support_reply":
      if (!hasSupportReply(artifact)) issues.push("Support reply missing customer reply section");
      break;
    case "financial_table":
    case "comparison_table":
      if (!hasValidTable(artifact)) issues.push("Table artifact missing valid rows and columns");
      break;
    case "checklist": {
      const checklist = artifact.sections.find((s) => s.kind === "checklist");
      const items =
        checklist && typeof checklist.content === "object" && "items" in checklist.content
          ? (checklist.content as { items: unknown[] }).items
          : [];
      if (!items.length) issues.push("Checklist has no items");
      break;
    }
    case "canvas_project":
      if (!artifact.title?.trim()) issues.push("Canvas project missing title");
      if (!hasUsefulSections(artifact)) issues.push("Canvas project has no useful sections");
      break;
    case "report":
    case "proposal":
    case "landing_page_copy":
    case "campaign_plan":
    case "website_audit":
    case "business_plan":
      if (!hasUsefulSections(artifact)) issues.push("Report artifact has no useful content sections");
      break;
    default:
      break;
  }

  let severity: ArtifactValidationSeverity = "none";
  if (issues.length > 0) {
    const blocker = issues.some((i) =>
      /missing email body|missing customer reply|no sections|missing valid rows/i.test(i),
    );
    severity = blocker ? "blocker" : issues.length > 1 ? "major" : "minor";
  }

  return {
    valid: issues.length === 0,
    issues,
    severity,
  };
}

/** Best-effort repairs for parser-fallback artifacts. */
export function repairArtifact(artifact: IivoArtifact, answer: string): IivoArtifact {
  const repaired = { ...artifact, sections: [...artifact.sections] };

  if (
    (artifact.type === "cold_email" ||
      artifact.type === "email_template" ||
      artifact.type === "follow_up_sequence") &&
    !hasEmailBody(repaired)
  ) {
    const body = answer.replace(/subject:.*\n/i, "").trim().slice(0, 8000);
    if (body.length >= 10) {
      repaired.sections.push({
        id: `sec-repair-${Date.now()}`,
        label: "Email",
        kind: "email_body",
        content: body,
        copyable: true,
      });
    }
  }

  if (artifact.type === "support_reply" && !hasSupportReply(repaired)) {
    const body = answer.trim().slice(0, 6000);
    if (body.length >= 10) {
      repaired.sections.unshift({
        id: `sec-repair-${Date.now()}`,
        label: "Reply to customer",
        kind: "email_body",
        content: body,
        copyable: true,
      });
    }
  }

  if (
    (artifact.type === "financial_table" || artifact.type === "comparison_table") &&
    !hasValidTable(repaired)
  ) {
    const textSection = repaired.sections.find((s) => s.kind === "text");
    if (textSection && sectionText(textSection).length > 20) {
      repaired.type = "report";
      repaired.sections = [
        {
          id: textSection.id,
          label: "Content",
          kind: "text",
          content: sectionText(textSection),
          copyable: true,
        },
      ];
    }
  }

  return repaired;
}

export function isSchemaFirstEligible(type: ArtifactType): boolean {
  return type !== "plain_answer";
}
