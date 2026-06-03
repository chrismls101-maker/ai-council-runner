export type ArtifactType =
  | "plain_answer"
  | "email_template"
  | "support_reply"
  | "cold_email"
  | "follow_up_sequence"
  | "financial_table"
  | "comparison_table"
  | "checklist"
  | "report"
  | "proposal"
  | "business_plan"
  | "landing_page_copy"
  | "script"
  | "social_post"
  | "website_audit"
  | "campaign_plan"
  | "canvas_project"
  | "image_asset"
  | "image_pack"
  | "hero_visual"
  | "product_render"
  | "product_render_pack"
  | "ad_creative"
  | "ad_creative_pack"
  | "social_visual"
  | "proposal_cover"
  | "email_banner"
  | "brand_visual_system";

export type ArtifactRenderMode = "inline" | "canvas";

export type ArtifactAction =
  | "copy"
  | "copy_section"
  | "download_txt"
  | "download_md"
  | "download_csv"
  | "download_pdf"
  | "regenerate_section"
  | "edit_section"
  | "download_png"
  | "copy_prompt"
  | "regenerate"
  | "create_variants"
  | "attach_to_artifact";

export type ArtifactTable = {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  totals?: Record<string, string | number>;
};

export type ArtifactChecklist = {
  items: Array<{
    label: string;
    checked?: boolean;
    note?: string;
  }>;
};

export type ArtifactSection = {
  id: string;
  label: string;
  kind:
    | "text"
    | "email_subjects"
    | "email_body"
    | "table"
    | "checklist"
    | "bullets"
    | "code"
    | "notes"
    | "cta"
    | "preview";
  content: string | ArtifactTable | ArtifactChecklist;
  copyable?: boolean;
};

export type IivoArtifact = {
  id: string;
  type: ArtifactType;
  renderMode: ArtifactRenderMode;
  title: string;
  summary?: string;
  sections: ArtifactSection[];
  actions: ArtifactAction[];
  metadata?: Record<string, unknown>;
};

export type ArtifactBuildTrace = {
  artifactType: string;
  renderMode: ArtifactRenderMode;
  buildMode: "schema_first" | "parser_fallback" | "plain_fallback";
  schemaValidationPassed: boolean;
  validationIssues: string[];
  artifactSizeBytes: number;
  storedByReference: boolean;
  fallbackUsed?: boolean;
  warnings?: string[];
};

export type BuilderWorkspaceTrace = {
  opened: boolean;
  activeTab?: "compose" | "inspect" | "improve" | "package" | "execute" | "visuals";
  buildMapCompleteness?: number;
  qualityScore?: number;
  suggestedFixCount?: number;
  versionCount?: number;
  versionPersistence?: "server" | "local" | "hybrid";
  transformsCreated?: number;
  saved?: boolean;
  shareActionUsed?: string;
};

export type ArtifactTrace = {
  artifactType: ArtifactType;
  renderMode: ArtifactRenderMode;
  builderModeSuggested: boolean;
  builderModeAccepted?: boolean;
  artifactBuild?: ArtifactBuildTrace;
  builder?: BuilderWorkspaceTrace;
};
