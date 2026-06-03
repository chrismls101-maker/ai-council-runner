import type { ArtifactSection, ArtifactType, IivoArtifact } from "../../types/artifacts";
import { supportsInlineVisualAction } from "../../utils/imageStudioActions";
import ImageResultGrid from "../images/ImageResultGrid";
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
  onGenerateVisual?: () => void;
  loadingSectionId?: string | null;
}

const IMAGE_ARTIFACT_TYPES = new Set<ArtifactType>([
  "image_asset",
  "image_pack",
  "hero_visual",
  "product_render",
  "product_render_pack",
  "ad_creative",
  "ad_creative_pack",
  "social_visual",
  "proposal_cover",
  "email_banner",
  "brand_visual_system",
]);

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

function isImageArtifact(type: IivoArtifact["type"]): boolean {
  return IMAGE_ARTIFACT_TYPES.has(type);
}

export default function ArtifactRenderer({
  artifact,
  onFeedback,
  compact = false,
  onRegenerateSection,
  onEditSection,
  onOpenInBuilder,
  onGenerateVisual,
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
          <div className="artifact-header-actions">
            {onGenerateVisual && supportsInlineVisualAction(artifact.type) && (
              <button
                type="button"
                className="btn ghost small"
                data-testid="generate-visual-inline"
                onClick={onGenerateVisual}
              >
                Generate visual
              </button>
            )}
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
        </div>
        {artifact.summary && <p className="artifact-summary muted">{artifact.summary}</p>}
      </div>

      {isImageArtifact(artifact.type) && <ImageResultGrid artifact={artifact} />}
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
