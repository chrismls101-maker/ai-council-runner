import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
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

export const ColdEmailArtifactSchema = z.object({
  title: z.string().min(1),
  subjectOptions: z.array(z.string().min(1)).min(1),
  emailBody: z.string().min(20),
  followUp: z.string().optional(),
  notes: z.union([z.array(z.string()), z.string()]).optional(),
});

export const SupportReplyArtifactSchema = z.object({
  title: z.string().min(1),
  replyBody: z.string().min(10),
  internalNote: z.string().optional(),
});

export const EmailTemplateArtifactSchema = ColdEmailArtifactSchema;

export const FollowUpSequenceArtifactSchema = z.object({
  title: z.string().min(1),
  subjectOptions: z.array(z.string()).optional(),
  emails: z.array(z.object({ label: z.string().optional(), body: z.string().min(10) })).min(1),
  notes: z.union([z.array(z.string()), z.string()]).optional(),
});

export const TableArtifactSchema = z.object({
  title: z.string().min(1),
  columns: z.array(z.string().min(1)).min(2),
  rows: z.array(z.record(z.union([z.string(), z.number()]))).min(1),
  notes: z.string().optional(),
});

export const ChecklistArtifactSchema = z.object({
  title: z.string().min(1),
  items: z
    .array(
      z.object({
        label: z.string().min(1),
        checked: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

export const ReportArtifactSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  sections: z
    .array(
      z.object({
        label: z.string().min(1),
        content: z.string().min(1),
        kind: z
          .enum(["text", "bullets", "notes", "cta", "preview"])
          .optional(),
      }),
    )
    .min(1),
});

export const CanvasProjectArtifactSchema = ReportArtifactSchema.extend({
  summary: z.string().optional(),
});

const SCHEMA_BY_TYPE: Partial<Record<ArtifactType, z.ZodType>> = {
  cold_email: ColdEmailArtifactSchema,
  email_template: EmailTemplateArtifactSchema,
  support_reply: SupportReplyArtifactSchema,
  follow_up_sequence: FollowUpSequenceArtifactSchema,
  financial_table: TableArtifactSchema,
  comparison_table: TableArtifactSchema,
  checklist: ChecklistArtifactSchema,
  report: ReportArtifactSchema,
  proposal: ReportArtifactSchema,
  landing_page_copy: ReportArtifactSchema,
  campaign_plan: ReportArtifactSchema,
  canvas_project: CanvasProjectArtifactSchema,
};

export function getArtifactSchema(type: ArtifactType): z.ZodType | null {
  return SCHEMA_BY_TYPE[type] ?? null;
}

export function parseArtifactJson(
  type: ArtifactType,
  raw: unknown,
): { ok: true; data: unknown } | { ok: false; issues: string[] } {
  const schema = getArtifactSchema(type);
  if (!schema) return { ok: false, issues: [`No schema for type ${type}`] };
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

function notesToString(notes: string[] | string | undefined): string | undefined {
  if (!notes) return undefined;
  return Array.isArray(notes) ? notes.join("\n") : notes;
}

export function artifactFromColdEmailSchema(
  data: z.infer<typeof ColdEmailArtifactSchema>,
  type: ArtifactType,
  renderMode: "inline" | "canvas",
): IivoArtifact {
  const sections: ArtifactSection[] = [
    {
      id: sectionId(),
      label: "Subject options",
      kind: "email_subjects",
      content: data.subjectOptions.join("\n"),
      copyable: true,
    },
    {
      id: sectionId(),
      label: "Email body",
      kind: "email_body",
      content: data.emailBody.slice(0, 8000),
      copyable: true,
    },
  ];
  const followUp = data.followUp?.trim();
  if (followUp) {
    sections.push({
      id: sectionId(),
      label: "Follow-up",
      kind: "text",
      content: followUp,
      copyable: true,
    });
  }
  const notes = notesToString(data.notes);
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
    renderMode,
    title: data.title,
    summary: type === "cold_email" ? "Cold email ready to send" : undefined,
    sections,
    actions: ["copy", "copy_section", "download_txt"],
  };
}

export function artifactFromSupportSchema(
  data: z.infer<typeof SupportReplyArtifactSchema>,
): IivoArtifact {
  const sections: ArtifactSection[] = [
    {
      id: sectionId(),
      label: "Reply to customer",
      kind: "email_body",
      content: data.replyBody,
      copyable: true,
    },
  ];
  if (data.internalNote?.trim()) {
    sections.push({
      id: sectionId(),
      label: "Internal note",
      kind: "notes",
      content: data.internalNote,
      copyable: true,
    });
  }
  return {
    id: uuidv4(),
    type: "support_reply",
    renderMode: "inline",
    title: data.title,
    sections,
    actions: ["copy", "copy_section", "regenerate_section", "edit_section"],
  };
}

export function artifactFromFollowUpSchema(
  data: z.infer<typeof FollowUpSequenceArtifactSchema>,
): IivoArtifact {
  const sections: ArtifactSection[] = [];
  if (data.subjectOptions?.length) {
    sections.push({
      id: sectionId(),
      label: "Subject options",
      kind: "email_subjects",
      content: data.subjectOptions.join("\n"),
      copyable: true,
    });
  }
  data.emails.forEach((email, i) => {
    sections.push({
      id: sectionId(),
      label: email.label ?? `Email ${i + 1}`,
      kind: "email_body",
      content: email.body,
      copyable: true,
    });
  });
  const notes = notesToString(data.notes);
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
    type: "follow_up_sequence",
    renderMode: "inline",
    title: data.title,
    sections,
    actions: ["copy", "copy_section", "download_txt"],
  };
}

export function artifactFromTableSchema(
  data: z.infer<typeof TableArtifactSchema>,
  type: "financial_table" | "comparison_table",
): IivoArtifact {
  const table: ArtifactTable = { columns: data.columns, rows: data.rows };
  const sections: ArtifactSection[] = [
    {
      id: sectionId(),
      label: "Table",
      kind: "table",
      content: table,
      copyable: true,
    },
  ];
  if (data.notes?.trim()) {
    sections.push({
      id: sectionId(),
      label: "Notes",
      kind: "notes",
      content: data.notes,
      copyable: true,
    });
  }
  return {
    id: uuidv4(),
    type,
    renderMode: "inline",
    title: data.title,
    sections,
    actions: ["copy", "copy_section", "download_csv", "regenerate_section"],
  };
}

export function artifactFromChecklistSchema(
  data: z.infer<typeof ChecklistArtifactSchema>,
): IivoArtifact {
  const checklist: ArtifactChecklist = { items: data.items };
  return {
    id: uuidv4(),
    type: "checklist",
    renderMode: "inline",
    title: data.title,
    sections: [
      {
        id: sectionId(),
        label: "Checklist",
        kind: "checklist",
        content: checklist,
        copyable: true,
      },
    ],
    actions: ["copy", "copy_section"],
  };
}

export function artifactFromReportSchema(
  data: z.infer<typeof ReportArtifactSchema>,
  type: ArtifactType,
  renderMode: "inline" | "canvas",
): IivoArtifact {
  const sections: ArtifactSection[] = data.sections.map((s) => ({
    id: sectionId(),
    label: s.label,
    kind: (s.kind ?? "text") as ArtifactSection["kind"],
    content: s.content,
    copyable: true,
  }));
  return {
    id: uuidv4(),
    type,
    renderMode,
    title: data.title,
    summary: data.summary,
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

export function buildArtifactFromValidatedSchema(
  type: ArtifactType,
  data: unknown,
  renderMode: "inline" | "canvas",
): IivoArtifact | null {
  switch (type) {
    case "cold_email":
    case "email_template":
      return artifactFromColdEmailSchema(
        data as z.infer<typeof ColdEmailArtifactSchema>,
        type,
        renderMode,
      );
    case "support_reply":
      return artifactFromSupportSchema(data as z.infer<typeof SupportReplyArtifactSchema>);
    case "follow_up_sequence":
      return artifactFromFollowUpSchema(data as z.infer<typeof FollowUpSequenceArtifactSchema>);
    case "financial_table":
      return artifactFromTableSchema(data as z.infer<typeof TableArtifactSchema>, type);
    case "comparison_table":
      return artifactFromTableSchema(data as z.infer<typeof TableArtifactSchema>, type);
    case "checklist":
      return artifactFromChecklistSchema(data as z.infer<typeof ChecklistArtifactSchema>);
    case "report":
    case "proposal":
    case "landing_page_copy":
    case "campaign_plan":
    case "website_audit":
    case "business_plan":
    case "canvas_project":
      return artifactFromReportSchema(
        data as z.infer<typeof ReportArtifactSchema>,
        type,
        renderMode,
      );
    default:
      return null;
  }
}
