import type { ArtifactSectionVersion } from "../../types/artifactVersions";
import type { ArtifactSection } from "../../types/artifacts";
import { diffArtifactSectionContent } from "../../utils/artifactDiff";
import { contentToCompareText } from "../../utils/textDiff";
import ChecklistDiffView from "./ChecklistDiffView";
import TableDiffView from "./TableDiffView";

export interface VersionCompareModalProps {
  open: boolean;
  version: ArtifactSectionVersion;
  currentSection: ArtifactSection;
  onClose: () => void;
  onRestore: (versionId: string) => void;
  onCopyVersion?: (text: string) => void;
}

export default function VersionCompareModal({
  open,
  version,
  currentSection,
  onClose,
  onRestore,
  onCopyVersion,
}: VersionCompareModalProps) {
  if (!open) return null;

  const beforeText = contentToCompareText(version.content);
  const afterText = contentToCompareText(currentSection.content);
  const diff = diffArtifactSectionContent(
    version.content,
    currentSection.content,
    currentSection.kind,
  );

  return (
    <div className="version-compare-overlay" data-testid="version-compare-modal" role="dialog">
      <div className="version-compare-modal">
        <header className="version-compare-header">
          <h3>Compare versions</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="muted version-compare-meta">
          {version.source} · {new Date(version.createdAt).toLocaleString()}
          {version.variantType && ` · ${version.variantType}`}
          {version.instruction && ` · ${version.instruction}`}
          {diff.mode !== "text" && ` · ${diff.mode} diff`}
        </p>
        <div className="version-compare-columns">
          <div className="version-compare-col">
            <h4>Previous</h4>
            <pre className="version-compare-pre">{beforeText}</pre>
          </div>
          <div className="version-compare-col">
            <h4>Current</h4>
            <pre className="version-compare-pre">{afterText}</pre>
          </div>
        </div>
        <div className="version-compare-diff" data-testid="version-compare-diff">
          <h4>Changes</h4>
          {diff.mode === "table" && <TableDiffView diff={diff} />}
          {diff.mode === "checklist" && <ChecklistDiffView diff={diff} />}
          {diff.mode === "text" && (
            <pre className="version-diff-pre">
              {diff.lines.map((line, i) => (
                <div key={`${i}-${line.type}`} className={`diff-line diff-${line.type}`}>
                  {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                  {line.text}
                </div>
              ))}
            </pre>
          )}
        </div>
        <div className="version-compare-actions">
          <button
            type="button"
            className="btn primary small"
            data-testid="version-compare-restore"
            onClick={() => onRestore(version.id)}
          >
            Restore this version
          </button>
          <button
            type="button"
            className="btn ghost small"
            data-testid="version-compare-copy"
            onClick={() => onCopyVersion?.(beforeText)}
          >
            Copy version
          </button>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
