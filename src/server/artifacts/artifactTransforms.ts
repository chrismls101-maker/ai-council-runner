import { v4 as uuidv4 } from "uuid";
import { runDirectAnswerAgent } from "../agents/runDirectAnswer.js";
import type { TokenMode } from "../config/tokenModes.js";
import { resolveResponsePlan } from "../responseContracts/resolveResponsePlan.js";
import { buildArtifactFromAnswer } from "./artifactBuilder.js";
import type { ArtifactRelationship, ArtifactTransformResult } from "./artifactRelationshipStore.js";
import { saveRelationship } from "./artifactRelationshipStore.js";
import { buildMockTransformArtifact, isMockTransformMode } from "./mockArtifactTransforms.js";
import type { ArtifactType, IivoArtifact } from "./artifactTypes.js";
import { cleanArtifactText } from "./cleanArtifactText.js";
import { sectionPlainText } from "./sectionText.js";

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

const TRANSFORM_PROMPTS: Record<ArtifactTransformType, string> = {
  follow_up_sequence:
    "Create a 3-email follow-up sequence based on the source cold email. Include subject lines and bodies.",
  call_script: "Create a short outbound call script based on the source email offer.",
  linkedin_dm: "Create a concise LinkedIn DM version of the outreach message.",
  outreach_checklist: "Create a practical outreach checklist (steps, timing, channels).",
  facebook_ad: "Create Facebook ad copy (primary text, headline, description) from the landing page.",
  email_announcement: "Create a launch/announcement email from the landing page content.",
  social_post: "Create 2-3 social posts promoting the offer from the landing page.",
  developer_checklist: "Create a developer implementation checklist from the landing page sections.",
  ab_test_ideas: "List A/B test ideas for the landing page with hypothesis and metric.",
  developer_task_list: "Create a prioritized developer task list from the website audit findings.",
  client_report: "Create a client-friendly audit report summary from the findings.",
  priority_checklist: "Create a priority fix checklist from the audit/report.",
  before_after_plan: "Create a before/after improvement plan from the audit.",
  invoice_checklist: "Create an invoice/billing checklist aligned with the proposal.",
  scope_summary: "Create a concise scope summary from the proposal.",
  kickoff_checklist: "Create a project kickoff checklist from the proposal.",
  execution_plan: "Create an execution plan with phases and owners from the source document.",
  task_checklist: "Create an actionable task checklist from the source document.",
  risk_monitor: "Create a risk monitor list (risk, signal, mitigation) from the source.",
  budget_summary: "Create a budget summary narrative from the financial table.",
  assumptions_list: "Extract and list key assumptions from the financial data.",
  csv_export: "Reformat the table data as clean CSV-ready rows with headers.",
  investor_explanation: "Write a short investor-friendly explanation of the financial table.",
};

const TRANSFORM_TARGET_TYPE: Partial<Record<ArtifactTransformType, ArtifactType>> = {
  follow_up_sequence: "follow_up_sequence",
  call_script: "script",
  linkedin_dm: "cold_email",
  outreach_checklist: "checklist",
  facebook_ad: "social_post",
  email_announcement: "email_template",
  social_post: "social_post",
  developer_checklist: "checklist",
  ab_test_ideas: "report",
  developer_task_list: "checklist",
  client_report: "report",
  priority_checklist: "checklist",
  before_after_plan: "report",
  invoice_checklist: "checklist",
  scope_summary: "report",
  kickoff_checklist: "checklist",
  execution_plan: "report",
  task_checklist: "checklist",
  risk_monitor: "checklist",
  budget_summary: "report",
  assumptions_list: "report",
  csv_export: "financial_table",
  investor_explanation: "report",
};

export async function transformArtifact(params: {
  artifact: IivoArtifact;
  transformType: ArtifactTransformType;
  userPrompt: string;
  sourceSectionIds?: string[];
  tokenMode?: TokenMode;
  sourceRunId?: string;
}): Promise<ArtifactTransformResult> {
  const { artifact, transformType, userPrompt, sourceSectionIds, tokenMode = "small" } = params;

  let childArtifact: IivoArtifact;

  if (isMockTransformMode()) {
    childArtifact = buildMockTransformArtifact(artifact, transformType);
  } else {
    const instruction = TRANSFORM_PROMPTS[transformType];
    const sections =
      sourceSectionIds?.length
        ? artifact.sections.filter((s) => sourceSectionIds.includes(s.id))
        : artifact.sections;
    const sourceText = sections.map((s) => `## ${s.label}\n${sectionPlainText(s)}`).join("\n\n");

    const taskPrompt = [
      instruction,
      "",
      "Original user request:",
      userPrompt,
      "",
      "Source artifact content:",
      sourceText.slice(0, 8000),
      "",
      "Return a complete structured deliverable with clear ## section headings.",
    ].join("\n");

    const noop = () => {};
    const controller = new AbortController();
    const runId = `artifact-transform-${Date.now()}`;
    const result = await runDirectAnswerAgent(
      taskPrompt,
      tokenMode,
      controller.signal,
      noop,
      runId,
      { responsePlan: resolveResponsePlan(userPrompt) },
    );

    const answer = cleanArtifactText(result.output?.trim() ?? "");
    if (!answer) {
      throw new Error("Transform produced empty output.");
    }

    const targetType = TRANSFORM_TARGET_TYPE[transformType] ?? "report";
    const plan = resolveResponsePlan(userPrompt);
    const built = buildArtifactFromAnswer({
      prompt: `${userPrompt}\n\nTransform: ${transformType}`,
      answer,
      artifactType: targetType,
      responseContract: plan.contract,
      renderMode: "canvas",
    });

    if (!built) {
      throw new Error("Could not build artifact from transform output.");
    }

    childArtifact = {
      ...built,
      id: `art-${uuidv4().slice(0, 8)}`,
      title: `${artifact.title} — ${transformType.replace(/_/g, " ")}`,
      metadata: { ...built.metadata, transformedFrom: artifact.id, transformType },
    };
  }

  const relationship: ArtifactRelationship = {
    parentArtifactId: artifact.id,
    childArtifactId: childArtifact.id,
    transformType,
    createdAt: new Date().toISOString(),
  };

  await saveRelationship(relationship, childArtifact);

  return { artifact: childArtifact, relationship };
}
