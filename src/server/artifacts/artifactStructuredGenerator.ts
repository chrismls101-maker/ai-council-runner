import type { ResponseContract } from "../responseContracts/responseContract.js";
import { cleanArtifactText } from "./cleanArtifactText.js";
import {
  buildArtifactFromValidatedSchema,
  parseArtifactJson,
} from "./artifactSchema.js";
import type { ArtifactType, IivoArtifact } from "./artifactTypes.js";
import { buildArtifactFromAnswer } from "./artifactBuilder.js";

export type GenerateStructuredArtifactInput = {
  prompt: string;
  answer: string;
  artifactType: ArtifactType;
  responseContract: ResponseContract;
  renderMode?: "inline" | "canvas";
  providerContext?: { useJsonMode?: boolean };
};

export type StructuredArtifactResult = {
  artifact: IivoArtifact | null;
  buildMode: "schema_first" | "parser_fallback" | "plain_fallback";
  schemaValidationPassed: boolean;
  validationIssues: string[];
  warnings: string[];
};

function extractJsonFromAnswer(answer: string): unknown | null {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const trimmed = answer.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* continue */
    }
  }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      /* continue */
    }
  }
  return null;
}

function parseSubjectOptions(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.]+\s*/, "").trim())
    .filter((l) => l.length > 3 && l.length < 200);
}

function extractLabeledBlock(answer: string, labels: RegExp[]): string {
  const combined = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?(${labels.map((l) => l.source).join("|")})(?:\\*\\*)?\\s*:?\\s*\\n`,
    "im",
  );
  const m = answer.match(combined);
  if (!m || m.index == null) return "";
  const start = m.index + m[0].length;
  const rest = answer.slice(start);
  const nextHeader = rest.search(/\n\s*(?:#{1,6}|\*\*[A-Z])/);
  const body = nextHeader >= 0 ? rest.slice(0, nextHeader) : rest;
  return cleanArtifactText(body.trim());
}

/** Derive schema-shaped payload from free-form answer (no LLM). */
export function deriveStructuredPayload(
  answer: string,
  artifactType: ArtifactType,
  title: string,
): unknown | null {
  const cleaned = cleanArtifactText(answer);

  switch (artifactType) {
    case "cold_email":
    case "email_template": {
      const subjectBlock =
        extractLabeledBlock(cleaned, [/subject(?:\s+line)?s?/i, /subject options/i]) ||
        (() => {
          const m = cleaned.match(/subject:\s*([^\n]+)/i);
          return m ? m[1] : "";
        })();
      const subjects = parseSubjectOptions(subjectBlock);
      const emailBody =
        extractLabeledBlock(cleaned, [/email body/i, /^email$/i, /body/i, /message/i]) ||
        (() => {
          const hi = cleaned.match(/(?:^|\n)(Hi\s[^\n]+[\s\S]{20,})/i);
          return hi ? hi[1] : "";
        })() ||
        cleaned.replace(/subject:.*\n/i, "").trim();
      if (emailBody.length < 20) return null;
      return {
        title,
        subjectOptions:
          subjects.length > 0 ? subjects : [subjectBlock || "Subject line option"],
        emailBody: emailBody.slice(0, 8000),
        followUp: extractLabeledBlock(cleaned, [/follow-?up/i]) || undefined,
        notes: extractLabeledBlock(cleaned, [/why this works/i, /notes/i]) || undefined,
      };
    }
    case "support_reply": {
      const reply =
        extractLabeledBlock(cleaned, [/support reply/i, /reply to customer/i, /reply/i, /response/i]) ||
        cleaned;
      if (reply.length < 10) return null;
      return {
        title,
        replyBody: reply.split(/internal note/i)[0]?.trim() ?? reply,
        internalNote: extractLabeledBlock(cleaned, [/internal note/i, /agent note/i]) || undefined,
      };
    }
    case "follow_up_sequence": {
      const body =
        extractLabeledBlock(cleaned, [/email/i, /sequence/i, /message/i]) || cleaned;
      if (body.length < 20) return null;
      return {
        title,
        emails: [{ label: "Email 1", body: body.slice(0, 8000) }],
      };
    }
    case "financial_table":
    case "comparison_table": {
      const lines = cleaned.split("\n").filter((l) => l.includes("|"));
      if (lines.length < 2) return null;
      const header = lines[0]!
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (header.length < 2) return null;
      const rows: Array<Record<string, string | number>> = [];
      for (let i = 2; i < lines.length; i++) {
        const cells = lines[i]!
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
      return { title, columns: header, rows };
    }
    case "checklist": {
      const items = cleaned
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^[-*•\d.]|\[[ x]?\]/i.test(line))
        .map((line) => ({
          label: line
            .replace(/^[-*•\d.]+\s*/, "")
            .replace(/^\[[ x]?\]\s*/i, "")
            .trim(),
        }))
        .filter((i) => i.label.length > 0);
      if (items.length === 0) return null;
      return { title, items };
    }
    case "report":
    case "proposal":
    case "landing_page_copy":
    case "campaign_plan":
    case "website_audit":
    case "business_plan":
    case "canvas_project": {
      const sections: Array<{ label: string; content: string }> = [];
      const summary = extractLabeledBlock(cleaned, [/executive summary/i, /summary/i]);
      if (summary) sections.push({ label: "Summary", content: summary });
      const findings = extractLabeledBlock(cleaned, [/findings/i, /analysis/i]);
      if (findings) sections.push({ label: "Findings", content: findings });
      const rec = extractLabeledBlock(cleaned, [/recommendations?/i, /next steps?/i]);
      if (rec) sections.push({ label: "Recommendations", content: rec });
      if (sections.length === 0 && cleaned.length >= 40) {
        sections.push({ label: "Content", content: cleaned });
      }
      if (sections.length === 0) return null;
      return { title, sections, summary: summary || undefined };
    }
    default:
      return null;
  }
}

function trySchemaFirst(
  answer: string,
  artifactType: ArtifactType,
  title: string,
  renderMode: "inline" | "canvas",
): { artifact: IivoArtifact | null; schemaValidationPassed: boolean; issues: string[] } {
  const jsonRaw = extractJsonFromAnswer(answer);
  const candidates: unknown[] = [];
  if (jsonRaw) candidates.push(jsonRaw);
  const derived = deriveStructuredPayload(answer, artifactType, title);
  if (derived) candidates.push(derived);

  for (const raw of candidates) {
    const parsed = parseArtifactJson(artifactType, raw);
    if (!parsed.ok) continue;
    const artifact = buildArtifactFromValidatedSchema(artifactType, parsed.data, renderMode);
    if (artifact) {
      return { artifact, schemaValidationPassed: true, issues: [] };
    }
  }

  return {
    artifact: null,
    schemaValidationPassed: false,
    issues: ["Schema validation failed for structured payload"],
  };
}

/**
 * Schema-first artifact build; falls back to deterministic parser.
 */
export async function generateStructuredArtifact(
  input: GenerateStructuredArtifactInput,
): Promise<StructuredArtifactResult> {
  const { prompt, answer, artifactType, responseContract, renderMode = "inline" } = input;
  const warnings: string[] = [];

  if (!answer?.trim() || artifactType === "plain_answer") {
    return {
      artifact: null,
      buildMode: "plain_fallback",
      schemaValidationPassed: false,
      validationIssues: [],
      warnings,
    };
  }

  const title =
    responseContract.label ||
    artifactType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const schemaAttempt = trySchemaFirst(answer, artifactType, title, renderMode);
  if (schemaAttempt.artifact) {
    return {
      artifact: schemaAttempt.artifact,
      buildMode: "schema_first",
      schemaValidationPassed: true,
      validationIssues: [],
      warnings,
    };
  }

  const parserArtifact = buildArtifactFromAnswer({
    artifactType,
    answer,
    prompt,
    responseContract,
    renderMode,
  });

  if (parserArtifact) {
    warnings.push("Artifact schema validation failed; fallback renderer used.");
    return {
      artifact: parserArtifact,
      buildMode: "parser_fallback",
      schemaValidationPassed: false,
      validationIssues: schemaAttempt.issues,
      warnings,
    };
  }

  warnings.push("Artifact schema validation failed; fallback renderer used.");
  return {
    artifact: null,
    buildMode: "plain_fallback",
    schemaValidationPassed: false,
    validationIssues: schemaAttempt.issues,
    warnings,
  };
}
