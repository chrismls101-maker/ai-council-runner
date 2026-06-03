import type { ArtifactSection } from "../../types/artifacts";
import { copyText, sectionPlainText } from "../../utils/artifactClipboard";
import ArtifactActions from "./ArtifactActions";
import ArtifactSectionActions from "./ArtifactSectionActions";
import type { ArtifactSectionHandlerProps } from "./artifactSectionProps";

export interface EmailArtifactProps extends ArtifactSectionHandlerProps {
  onFeedback?: (message: string) => void;
}

function SubjectBlock({
  section,
  artifact,
  onFeedback,
  onRegenerateSection,
  onEditSection,
  loadingSectionId,
}: {
  section: ArtifactSection;
  artifact: EmailArtifactProps["artifact"];
  onFeedback?: (message: string) => void;
  onRegenerateSection?: EmailArtifactProps["onRegenerateSection"];
  onEditSection?: EmailArtifactProps["onEditSection"];
  loadingSectionId?: string | null;
}) {
  const text = typeof section.content === "string" ? section.content : "";
  const subjects = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="artifact-section artifact-email-subjects" data-testid="artifact-email-subjects">
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
          <button
            type="button"
            className="btn ghost small"
            data-testid="artifact-copy-subject"
            onClick={() =>
              void copyText(subjects[0] ?? text).then(() => onFeedback?.("Subject copied"))
            }
          >
            Copy subject
          </button>
        </div>
      </div>
      <ul className="artifact-subject-list">
        {subjects.map((subject, index) => (
          <li key={`${subject}-${index}`}>
            <span>{subject}</span>
            <button
              type="button"
              className="btn ghost small"
              onClick={() =>
                void copyText(subject).then(() => onFeedback?.("Subject copied"))
              }
            >
              Copy
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EmailArtifact({
  artifact,
  onFeedback,
  onRegenerateSection,
  onEditSection,
  loadingSectionId,
}: EmailArtifactProps) {
  return (
    <div className="artifact-email" data-testid="artifact-email">
      {artifact.sections.map((section) => {
        if (section.kind === "email_subjects") {
          return (
            <SubjectBlock
              key={section.id}
              section={section}
              artifact={artifact}
              onFeedback={onFeedback}
              onRegenerateSection={onRegenerateSection}
              onEditSection={onEditSection}
              loadingSectionId={loadingSectionId}
            />
          );
        }
        if (section.kind === "email_body" || section.kind === "text") {
          return (
            <div
              key={section.id}
              className="artifact-section artifact-email-body"
              data-testid="artifact-email-body"
            >
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
                      data-testid="artifact-copy-body"
                      onClick={() =>
                        void copyText(sectionPlainText(section)).then(() =>
                          onFeedback?.("Body copied"),
                        )
                      }
                    >
                      Copy body
                    </button>
                  )}
                </div>
              </div>
              <pre className="artifact-body-text">{sectionPlainText(section)}</pre>
            </div>
          );
        }
        if (section.kind === "notes") {
          return (
            <div key={section.id} className="artifact-section artifact-notes">
              <div className="artifact-section-header">
                <h4>{section.label}</h4>
                <ArtifactSectionActions
                  artifact={artifact}
                  section={section}
                  onRegenerate={onRegenerateSection}
                  onEdit={onEditSection}
                  loadingSectionId={loadingSectionId}
                />
              </div>
              <p className="artifact-notes-text">{sectionPlainText(section)}</p>
            </div>
          );
        }
        return null;
      })}
      <ArtifactActions
        artifact={artifact}
        actions={artifact.actions}
        onFeedback={onFeedback}
      />
    </div>
  );
}
