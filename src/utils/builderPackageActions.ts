import type { ArtifactAction } from "../types/artifacts";
import type { IivoArtifact } from "../types/artifacts";

export type PackageAction = {
  id: string;
  label: string;
  action: ArtifactAction | "copy_subject" | "copy_body" | "copy_followup" | "export_brief" | "export_sequence";
};

export function getPackageActions(artifact: IivoArtifact): PackageAction[] {
  const actions: PackageAction[] = [];
  const has = (a: ArtifactAction) => artifact.actions.includes(a);

  if (has("copy")) {
    actions.push({ id: "copy_all", label: "Copy all", action: "copy" });
  }

  switch (artifact.type) {
    case "cold_email":
    case "email_template":
    case "follow_up_sequence":
      actions.push({ id: "copy_subject", label: "Copy subject", action: "copy_subject" });
      actions.push({ id: "copy_body", label: "Copy body", action: "copy_body" });
      if (artifact.sections.some((s) => /follow/i.test(s.label))) {
        actions.push({ id: "copy_followup", label: "Copy follow-up", action: "copy_followup" });
      }
      break;
    case "financial_table":
    case "comparison_table":
      if (has("copy")) actions.push({ id: "copy_table", label: "Copy table", action: "copy" });
      break;
    case "campaign_plan":
      actions.push({ id: "export_brief", label: "Export campaign brief", action: "export_brief" });
      actions.push({ id: "export_sequence", label: "Export email sequence", action: "export_sequence" });
      break;
    default:
      break;
  }

  if (has("download_txt")) {
    actions.push({ id: "download_txt", label: "Download TXT", action: "download_txt" });
  }
  if (has("download_md")) {
    actions.push({ id: "download_md", label: "Download Markdown", action: "download_md" });
  }
  if (has("download_csv")) {
    actions.push({ id: "download_csv", label: "Download CSV", action: "download_csv" });
  }
  if (has("download_pdf")) {
    actions.push({ id: "download_pdf", label: "Download PDF", action: "download_pdf" });
  }

  if (has("copy_section")) {
    actions.push({ id: "copy_section", label: "Copy section", action: "copy_section" });
  }

  return actions;
}
