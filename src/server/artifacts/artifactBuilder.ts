import { v4 as uuidv4 } from "uuid";
import type { ResponseContract } from "../responseContracts/responseContract.js";
import { cleanArtifactText, promptRequestsMarkdown } from "./cleanArtifactText.js";
import type {
  ArtifactChecklist,
  ArtifactSection,
  ArtifactTable,
  ArtifactType,
  IivoArtifact,
} from "./artifactTypes.js";

function sectionId(): string {
  return `sec-${uuidv4().slice(0, 8)}`;
}

function extractSection(
  answer: string,
  labels: RegExp[],
): { before: string; match: string; after: string } | null {
  const combined = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?(${labels.map((l) => l.source).join("|")})(?:\\*\\*)?\\s*:?\\s*\\n`,
    "im",
  );
  const m = answer.match(combined);
  if (!m || m.index == null) return null;
  const start = m.index + m[0].length;
  const rest = answer.slice(start);
  const nextHeader = rest.search(/\n\s*(?:#{1,6}|\*\*[A-Z])/);
  const body = nextHeader >= 0 ? rest.slice(0, nextHeader) : rest;
  return {
    before: answer.slice(0, m.index),
    match: cleanArtifactText(body.trim()),
    after: nextHeader >= 0 ? rest.slice(nextHeader) : "",
  };
}

function parseSubjectOptions(text: string): string[] {
  const lines = cleanArtifactText(text)
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.]+\s*/, "").trim())
    .filter(Boolean);
  return lines.filter((l) => l.length > 3 && l.length < 200);
}

function parseMarkdownTable(text: string): ArtifactTable | null {
  const lines = text.split("\n").filter((l) => l.trim());
  const tableLines = lines.filter((l) => l.includes("|"));
  if (tableLines.length < 2) return null;

  const header = tableLines[0]!
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  if (header.length < 2) return null;

  const rows: ArtifactTable["rows"] = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i]!
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const row: Record<string, string | number> = {};
    header.forEach((col, idx) => {
      row[col] = cells[idx] ?? "";
    });
    rows.push(row);
  }

  if (rows.length === 0) return null;
  return { columns: header, rows };
}

function parseChecklist(text: string): ArtifactChecklist {
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•\d.]|\[[ x]?\]/i.test(line))
    .map((line) => {
      const checked = /\[[xX]\]|✓/.test(line);
      const label = line
        .replace(/^[-*•\d.]+\s*/, "")
        .replace(/^\[[ x]?\]\s*/i, "")
        .trim();
      return { label: cleanArtifactText(label), checked };
    })
    .filter((i) => i.label.length > 0);

  return { items: items.length > 0 ? items : [{ label: cleanArtifactText(text) }] };
}

function buildColdEmailArtifact(answer: string, title: string): IivoArtifact {
  const cleaned = cleanArtifactText(answer);
  const sections: ArtifactSection[] = [];

  const subjectBlock =
    extractSection(cleaned, [/subject(?:\s+line)?s?/i, /subject options/i])?.match ??
    (() => {
      const m = cleaned.match(/subject:\s*([^\n]+)/i);
      return m ? m[1] : "";
    })();
  const subjects = parseSubjectOptions(subjectBlock);
  if (subjects.length > 0 || subjectBlock.trim()) {
    sections.push({
      id: sectionId(),
      label: "Subject options",
      kind: "email_subjects",
      content: subjects.length > 0 ? subjects.join("\n") : subjectBlock || "Subject line 1",
      copyable: true,
    });
  }

  const hiMatch = cleaned.match(/(?:^|\n)(Hi\s[^\n]+[\s\S]{15,})/i);
  const bodyBlock =
    extractSection(cleaned, [/email body/i, /^email$/i, /body/i, /cold email/i, /message/i, /cta/i])
      ?.match ??
    hiMatch?.[1] ??
    cleaned.replace(/subject:.*\n/i, "").trim();
  const bodyLabel = subjects.length > 0 || subjectBlock.trim() ? "Email body" : "Email";
  sections.push({
    id: sectionId(),
    label: bodyLabel,
    kind: "email_body",
    content: bodyBlock.slice(0, 8000) || cleaned.slice(0, 8000),
    copyable: true,
  });

  const followUp = extractSection(cleaned, [/follow-?up/i, /follow up email/i])?.match;
  if (followUp?.trim()) {
    sections.push({
      id: sectionId(),
      label: "Follow-up",
      kind: "text",
      content: followUp,
      copyable: true,
    });
  }

  const notes = extractSection(cleaned, [/why this works/i, /notes/i, /tips/i])?.match;
  if (notes?.trim()) {
    sections.push({
      id: sectionId(),
      label: "Why this works",
      kind: "notes",
      content: notes,
      copyable: true,
    });
  }

  return {
    id: uuidv4(),
    type: "cold_email",
    renderMode: "inline",
    title,
    summary: "Cold email ready to send",
    sections,
    actions: ["copy", "copy_section", "download_txt"],
  };
}

function buildSupportReplyArtifact(answer: string, title: string): IivoArtifact {
  const cleaned = cleanArtifactText(answer);
  const reply =
    extractSection(cleaned, [/support reply/i, /reply/i, /response/i])?.match ?? cleaned;
  const internal = extractSection(cleaned, [/internal note/i, /agent note/i])?.match;

  const sections: ArtifactSection[] = [
    {
      id: sectionId(),
      label: "Reply to customer",
      kind: "email_body",
      content: reply.split(/internal note/i)[0]?.trim() ?? reply,
      copyable: true,
    },
  ];

  if (internal?.trim()) {
    sections.push({
      id: sectionId(),
      label: "Internal note",
      kind: "notes",
      content: internal,
      copyable: true,
    });
  }

  return {
    id: uuidv4(),
    type: "support_reply",
    renderMode: "inline",
    title,
    sections,
    actions: ["copy", "copy_section", "regenerate_section", "edit_section"],
  };
}

function buildTableArtifact(
  answer: string,
  title: string,
  type: "financial_table" | "comparison_table",
): IivoArtifact | null {
  const cleaned = cleanArtifactText(answer);
  const table = parseMarkdownTable(cleaned);
  const sections: ArtifactSection[] = [];

  if (table) {
    sections.push({
      id: sectionId(),
      label: "Table",
      kind: "table",
      content: table,
      copyable: true,
    });
  } else if (/^[-*•\d.]|\[[ x]?\]/im.test(cleaned)) {
    return buildChecklistArtifact(answer, title);
  } else {
    return buildReportArtifact(answer, title, "report");
  }

  const notes = extractSection(cleaned, [/notes/i, /assumptions/i])?.match;
  if (notes?.trim()) {
    sections.push({
      id: sectionId(),
      label: "Notes",
      kind: "notes",
      content: notes,
      copyable: true,
    });
  }

  return {
    id: uuidv4(),
    type,
    renderMode: "inline",
    title,
    sections,
    actions: table
      ? ["copy", "copy_section", "download_csv", "regenerate_section"]
      : ["copy", "copy_section", "regenerate_section", "edit_section"],
  };
}

function buildChecklistArtifact(answer: string, title: string): IivoArtifact {
  const cleaned = cleanArtifactText(answer);
  return {
    id: uuidv4(),
    type: "checklist",
    renderMode: "inline",
    title,
    sections: [
      {
        id: sectionId(),
        label: "Checklist",
        kind: "checklist",
        content: parseChecklist(cleaned),
        copyable: true,
      },
    ],
    actions: ["copy", "copy_section"],
  };
}

function buildReportArtifact(
  answer: string,
  title: string,
  type: ArtifactType,
): IivoArtifact {
  const cleaned = cleanArtifactText(answer);
  const sections: ArtifactSection[] = [];

  const exec = extractSection(cleaned, [/executive summary/i, /summary/i, /recommendation/i]);
  if (exec?.match) {
    sections.push({
      id: sectionId(),
      label: "Summary",
      kind: "text",
      content: exec.match,
      copyable: true,
    });
  }

  const findings = extractSection(cleaned, [/findings/i, /analysis/i]);
  if (findings?.match) {
    sections.push({
      id: sectionId(),
      label: "Findings",
      kind: "text",
      content: findings.match,
      copyable: true,
    });
  }

  const rec = extractSection(cleaned, [/recommendations?/i, /next steps?/i]);
  if (rec?.match) {
    sections.push({
      id: sectionId(),
      label: "Recommendations",
      kind: "bullets",
      content: rec.match,
      copyable: true,
    });
  }

  if (sections.length === 0) {
    sections.push({
      id: sectionId(),
      label: "Content",
      kind: "text",
      content: cleaned,
      copyable: true,
    });
  }

  return {
    id: uuidv4(),
    type,
    renderMode: type === "canvas_project" || type === "business_plan" || type === "proposal" ? "canvas" : "inline",
    title,
    sections,
    actions: [
      "copy",
      "copy_section",
      "download_md",
      "download_txt",
      "download_pdf",
      "regenerate_section",
      "edit_section",
    ],
  };
}

export function buildArtifactFromAnswer({
  artifactType,
  answer,
  prompt,
  responseContract,
  renderMode,
}: {
  artifactType: ArtifactType;
  answer: string;
  prompt: string;
  responseContract: ResponseContract;
  renderMode?: "inline" | "canvas";
}): IivoArtifact | null {
  if (!answer?.trim()) return null;
  if (promptRequestsMarkdown(prompt) && artifactType === "plain_answer") return null;

  const title =
    responseContract.label ||
    artifactType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  switch (artifactType) {
    case "cold_email":
    case "email_template":
    case "follow_up_sequence":
      return { ...buildColdEmailArtifact(answer, title), type: artifactType, renderMode: renderMode ?? "inline" };
    case "support_reply":
      return buildSupportReplyArtifact(answer, title);
    case "financial_table":
    case "comparison_table":
      return buildTableArtifact(answer, title, artifactType);
    case "checklist":
      return buildChecklistArtifact(answer, title);
    case "landing_page_copy":
      return buildReportArtifact(answer, "Landing page copy", "landing_page_copy");
    case "script":
    case "social_post":
      return buildReportArtifact(answer, title, artifactType);
    case "report":
    case "proposal":
    case "business_plan":
    case "campaign_plan":
    case "website_audit":
    case "canvas_project":
      return buildReportArtifact(answer, title, artifactType);
    case "plain_answer":
    default:
      return null;
  }
}
