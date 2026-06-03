export type BuilderWorkspaceTab = "compose" | "inspect" | "improve" | "package" | "execute";

export type SectionVariantType =
  | "shorter"
  | "premium"
  | "direct"
  | "human"
  | "proof"
  | "risk_reduced"
  | "spanish"
  | "custom";

export type BuilderWorkspaceTrace = {
  opened: boolean;
  activeTab?: BuilderWorkspaceTab;
  buildMapCompleteness?: number;
  qualityScore?: number;
  suggestedFixCount?: number;
  versionCount?: number;
  transformsCreated?: number;
};

export type ArtifactTransformType =
  | "follow_up_sequence"
  | "call_script"
  | "linkedin_dm"
  | "outreach_checklist"
  | "facebook_ad"
  | "email_announcement"
  | "social_post"
  | "developer_checklist"
  | "ab_test_ideas"
  | "developer_task_list"
  | "client_report"
  | "priority_checklist"
  | "before_after_plan"
  | "invoice_checklist"
  | "scope_summary"
  | "kickoff_checklist"
  | "execution_plan"
  | "task_checklist"
  | "risk_monitor"
  | "budget_summary"
  | "assumptions_list"
  | "csv_export"
  | "investor_explanation";

export type BuilderContextItem = {
  id: string;
  label: string;
  kind: "attachment" | "lens" | "screenshot" | "evidence" | "memory";
  relevance?: string;
};
