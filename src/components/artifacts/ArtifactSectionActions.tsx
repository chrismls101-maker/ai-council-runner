import type { ArtifactSection, IivoArtifact } from "../../types/artifacts";
import { sectionSupportsEdit } from "../../utils/artifactMutations";

export interface ArtifactSectionActionsProps {
  artifact: IivoArtifact;
  section: ArtifactSection;
  onRegenerate?: (section: ArtifactSection) => void;
  onEdit?: (section: ArtifactSection) => void;
  loadingSectionId?: string | null;
}

export default function ArtifactSectionActions({
  artifact,
  section,
  onRegenerate,
  onEdit,
  loadingSectionId,
}: ArtifactSectionActionsProps) {
  const loading = loadingSectionId === section.id;
  const canRegenerate = artifact.actions.includes("regenerate_section") && onRegenerate;
  const canEdit =
    artifact.actions.includes("edit_section") &&
    onEdit &&
    sectionSupportsEdit(section);

  if (!canRegenerate && !canEdit) return null;

  return (
    <div className="artifact-section-actions">
      {canRegenerate && (
        <button
          type="button"
          className="btn ghost small"
          data-testid="artifact-regenerate-section"
          disabled={loading}
          onClick={() => onRegenerate(section)}
        >
          {loading ? "Regenerating…" : "Regenerate"}
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          className="btn ghost small"
          data-testid="artifact-edit-section"
          disabled={loading}
          onClick={() => onEdit(section)}
        >
          Edit
        </button>
      )}
    </div>
  );
}
