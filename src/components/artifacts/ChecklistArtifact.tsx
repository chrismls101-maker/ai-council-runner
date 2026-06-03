import type { ArtifactChecklist } from "../../types/artifacts";
import { copyText, sectionPlainText } from "../../utils/artifactClipboard";
import ArtifactActions from "./ArtifactActions";
import ArtifactSectionActions from "./ArtifactSectionActions";
import type { ArtifactSectionHandlerProps } from "./artifactSectionProps";

export interface ChecklistArtifactProps extends ArtifactSectionHandlerProps {
  onFeedback?: (message: string) => void;
}

export default function ChecklistArtifact({
  artifact,
  onFeedback,
  onRegenerateSection,
  onEditSection,
  loadingSectionId,
}: ChecklistArtifactProps) {
  const section = artifact.sections[0];
  const checklist =
    section && typeof section.content !== "string"
      ? (section.content as ArtifactChecklist)
      : { items: [] };

  if (!section) return null;

  return (
    <div className="artifact-checklist-card" data-testid="artifact-checklist">
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
      <ul className="artifact-checklist-list">
        {checklist.items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <label>
              <input type="checkbox" defaultChecked={item.checked} readOnly />
              <span>{item.label}</span>
            </label>
            {item.note && <span className="artifact-checklist-note muted">{item.note}</span>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn ghost small"
        data-testid="artifact-copy-checklist"
        onClick={() =>
          void copyText(sectionPlainText(section!)).then(() =>
            onFeedback?.("Checklist copied"),
          )
        }
      >
        Copy checklist
      </button>
      <ArtifactActions
        artifact={artifact}
        actions={artifact.actions}
        onFeedback={onFeedback}
      />
    </div>
  );
}
