import type { ArtifactTransformType } from "../types/builderWorkspace";
import type { ArtifactType } from "../types/artifacts";

export type TransformAction = {
  id: ArtifactTransformType;
  label: string;
};

const TRANSFORMS_BY_TYPE: Partial<Record<ArtifactType, TransformAction[]>> = {
  cold_email: [
    { id: "follow_up_sequence", label: "Turn into 3-email follow-up sequence" },
    { id: "call_script", label: "Turn into call script" },
    { id: "linkedin_dm", label: "Turn into LinkedIn DM" },
    { id: "outreach_checklist", label: "Turn into outreach checklist" },
  ],
  email_template: [
    { id: "follow_up_sequence", label: "Turn into follow-up sequence" },
    { id: "outreach_checklist", label: "Turn into outreach checklist" },
  ],
  landing_page_copy: [
    { id: "facebook_ad", label: "Turn into Facebook ad" },
    { id: "email_announcement", label: "Turn into email announcement" },
    { id: "social_post", label: "Turn into social post" },
    { id: "developer_checklist", label: "Turn into developer checklist" },
    { id: "ab_test_ideas", label: "Turn into A/B test ideas" },
  ],
  canvas_project: [
    { id: "developer_checklist", label: "Turn into developer checklist" },
    { id: "ab_test_ideas", label: "Turn into A/B test ideas" },
  ],
  website_audit: [
    { id: "developer_task_list", label: "Turn into developer task list" },
    { id: "client_report", label: "Turn into client report" },
    { id: "priority_checklist", label: "Turn into priority checklist" },
    { id: "before_after_plan", label: "Turn into before/after plan" },
  ],
  report: [
    { id: "priority_checklist", label: "Turn into priority checklist" },
    { id: "client_report", label: "Turn into client report" },
  ],
  proposal: [
    { id: "invoice_checklist", label: "Turn into invoice checklist" },
    { id: "scope_summary", label: "Turn into scope summary" },
    { id: "kickoff_checklist", label: "Turn into kickoff checklist" },
  ],
  business_plan: [
    { id: "execution_plan", label: "Turn into execution plan" },
    { id: "task_checklist", label: "Turn into task checklist" },
    { id: "risk_monitor", label: "Turn into risk monitor" },
  ],
  campaign_plan: [
    { id: "execution_plan", label: "Turn into execution plan" },
    { id: "email_announcement", label: "Turn into email sequence export" },
    { id: "task_checklist", label: "Turn into campaign checklist" },
  ],
  financial_table: [
    { id: "budget_summary", label: "Turn into budget summary" },
    { id: "assumptions_list", label: "Turn into assumptions list" },
    { id: "csv_export", label: "Turn into CSV-ready export" },
    { id: "investor_explanation", label: "Turn into investor explanation" },
  ],
  comparison_table: [
    { id: "budget_summary", label: "Turn into comparison summary" },
    { id: "assumptions_list", label: "Turn into assumptions list" },
  ],
  checklist: [{ id: "task_checklist", label: "Turn into execution checklist" }],
};

export function getTransformActions(artifactType: ArtifactType): TransformAction[] {
  return TRANSFORMS_BY_TYPE[artifactType] ?? [];
}
