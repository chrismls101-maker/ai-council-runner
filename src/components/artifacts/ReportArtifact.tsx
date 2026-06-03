import { copyText, sectionPlainText } from "../../utils/artifactClipboard";
import ArtifactActions from "./ArtifactActions";
import ArtifactSectionActions from "./ArtifactSectionActions";
import type { ArtifactSectionHandlerProps } from "./artifactSectionProps";

export interface ReportArtifactProps extends ArtifactSectionHandlerProps {
  onFeedback?: (message: string) => void;
  compact?: boolean;
}

export default function ReportArtifact({
  artifact,
  onFeedback,
  compact = false,
  onRegenerateSection,
  onEditSection,
  loadingSectionId,
}: ReportArtifactProps) {
  return (
    <div
      className={`artifact-report${compact ? " compact" : ""}`}
      data-testid="artifact-report"
    >
      {artifact.sections.map((section) => (
        <div key={section.id} className="artifact-section artifact-report-section">
          <div className="artifact-section-header">
            <h4>{section.label}</h4>
            <div className="artifact-section-header-actions">
              <ArtifactSectionActions
                artifact={artifact}
                section={section}
                onRegenerate={onRegenerateSection}
                onEdit={onEditSection}
                loadingSectionId={loadingSectionId}
              />
              {section.copyable && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() =>
                    void copyText(sectionPlainText(section)).then(() =>
                      onFeedback?.(`${section.label} copied`),
                    )
                  }
                >
                  Copy
                </button>
              )}
            </div>
          </div>
          <div className="artifact-report-body">
            {section.kind === "bullets" ? (
              <ul className="artifact-bullets">
                {sectionPlainText(section)
                  .split("\n")
                  .filter(Boolean)
                  .map((line, index) => (
                    <li key={index}>{line.replace(/^[-*•]\s*/, "")}</li>
                  ))}
              </ul>
            ) : (
              <pre className="artifact-body-text">{sectionPlainText(section)}</pre>
            )}
          </div>
        </div>
      ))}
      <ArtifactActions
        artifact={artifact}
        actions={artifact.actions}
        onFeedback={onFeedback}
      />
    </div>
  );
}
