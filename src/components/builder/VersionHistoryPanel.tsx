import type { ArtifactSectionVersion } from "../../types/artifactVersions";
import { contentToCompareText } from "../../utils/textDiff";

export interface VersionHistoryPanelProps {
  sectionLabel: string;
  versions: ArtifactSectionVersion[];
  onRestore: (versionId: string) => void;
  onCompare: (versionId: string) => void;
  onCopyVersion?: (text: string) => void;
}

export default function VersionHistoryPanel({
  sectionLabel,
  versions,
  onRestore,
  onCompare,
  onCopyVersion,
}: VersionHistoryPanelProps) {
  if (versions.length === 0) {
    return (
      <div className="version-history-panel muted" data-testid="version-history-panel">
        <p>No versions yet for {sectionLabel}.</p>
      </div>
    );
  }

  const sorted = [...versions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="version-history-panel" data-testid="version-history-panel">
      <h4>Version history — {sectionLabel}</h4>
      <ul className="version-history-list">
        {sorted.map((v) => (
          <li key={v.id} data-testid={`version-entry-${v.id}`}>
            <span className="version-source">{v.source}</span>
            <span className="version-date muted">
              {new Date(v.createdAt).toLocaleString()}
            </span>
            {v.instruction && <p className="muted version-instruction">{v.instruction}</p>}
            <div className="version-entry-actions">
              <button
                type="button"
                className="btn ghost small"
                data-testid={`version-restore-${v.id}`}
                onClick={() => onRestore(v.id)}
              >
                Restore
              </button>
              <button
                type="button"
                className="btn ghost small"
                data-testid={`version-compare-${v.id}`}
                onClick={() => onCompare(v.id)}
              >
                Compare
              </button>
              <button
                type="button"
                className="btn ghost small"
                data-testid={`version-copy-${v.id}`}
                onClick={() => onCopyVersion?.(contentToCompareText(v.content))}
              >
                Copy version
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
