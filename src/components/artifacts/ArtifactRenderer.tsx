import type { ArtifactSection, IivoArtifact } from "../../types/artifacts";
import ChecklistArtifact from "./ChecklistArtifact";
import EmailArtifact from "./EmailArtifact";
import ReportArtifact from "./ReportArtifact";
import TableArtifact from "./TableArtifact";

export interface ArtifactRendererProps {
  artifact: IivoArtifact;
  onFeedback?: (message: string) => void;
  compact?: boolean;
  onRegenerateSection?: (section: ArtifactSection) => void;
  onEditSection?: (section: ArtifactSection) => void;
  onOpenInBuilder?: () => void;
  loadingSectionId?: string | null;
}

function isEmailArtifact(type: IivoArtifact["type"]): boolean {
  return (
    type === "cold_email" ||
    type === "email_template" ||
    type === "follow_up_sequence" ||
    type === "support_reply"
  );
}

function isTableArtifact(type: IivoArtifact["type"]): boolean {
  return type === "financial_table" || type === "comparison_table";
}

function isReportArtifact(type: IivoArtifact["type"]): boolean {
  return (
    type === "report" ||
    type === "proposal" ||
    type === "business_plan" ||
    type === "landing_page_copy" ||
    type === "script" ||
    type === "social_post" ||
    type === "website_audit" ||
    type === "campaign_plan" ||
    type === "canvas_project"
  );
}

export default function ArtifactRenderer({
  artifact,
  onFeedback,
  compact = false,
  onRegenerateSection,
  onEditSection,
  onOpenInBuilder,
  loadingSectionId,
}: ArtifactRendererProps) {
  const sectionProps = {
    onRegenerateSection,
    onEditSection,
    loadingSectionId,
  };

  return (
    <div
      className="iivo-artifact artifact-glass-card"
      data-testid="artifact-renderer"
      data-artifact-type={artifact.type}
      data-render-mode={artifact.renderMode}
    >
      <div className="artifact-header">
        <div className="artifact-header-row">
          <h3 className="artifact-title">{artifact.title}</h3>
          {onOpenInBuilder && (
            <button
              type="button"
              className="btn ghost small"
              data-testid="open-in-builder"
              onClick={onOpenInBuilder}
            >
              Open in Builder
            </button>
          )}
        </div>
        {artifact.summary && <p className="artifact-summary muted">{artifact.summary}</p>}
      </div>

      {isEmailArtifact(artifact.type) && (
        <EmailArtifact artifact={artifact} onFeedback={onFeedback} {...sectionProps} />
      )}
      {isTableArtifact(artifact.type) && (
        <TableArtifact artifact={artifact} onFeedback={onFeedback} {...sectionProps} />
      )}
      {artifact.type === "checklist" && (
        <ChecklistArtifact artifact={artifact} onFeedback={onFeedback} {...sectionProps} />
      )}
      {isReportArtifact(artifact.type) && (
        <ReportArtifact
          artifact={artifact}
          onFeedback={onFeedback}
          compact={compact}
          {...sectionProps}
        />
      )}
    </div>
  );
}
