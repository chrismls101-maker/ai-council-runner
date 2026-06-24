import type { CoderTranscriptInspectClusterItem } from "../../shared/glassIdeTranscriptCollapse.ts";
import { deriveInspectClusterRows } from "../../shared/glassIdeInspectCluster.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeTranscriptInspectClusterProps {
  item: CoderTranscriptInspectClusterItem;
  onOpenFile?: (relativePath: string) => void;
}

export function GlassIdeTranscriptInspectCluster({
  item,
  onOpenFile,
}: GlassIdeTranscriptInspectClusterProps): JSX.Element {
  const noun = item.count === 1 ? "step" : "steps";
  const summary = `Inspected ${item.count} ${noun}`;
  const rows = deriveInspectClusterRows(item.tools);

  return (
    <details
      className="gide-transcript-cluster"
      data-testid="glass-ide-transcript-inspect-cluster"
      onPointerDown={ensureOverlayInteractive}
    >
      <summary className="gide-transcript-cluster__summary">
        <span className="gide-transcript-cluster__icon" aria-hidden="true">◎</span>
        <span className="gide-transcript-cluster__label">{summary}</span>
        <span className="gide-transcript-cluster__hint">Show details</span>
      </summary>
      <ul className="gide-transcript-cluster__list">
        {rows.map((row) => (
          <li key={row.id} className="gide-transcript-cluster__row gide-transcript-cluster__row--detail">
            <span className="gide-transcript-cluster__row-dot" aria-hidden="true" />
            <div className="gide-transcript-cluster__row-body">
              <span className="gide-transcript-cluster__row-path" title={row.relativePath ?? undefined}>
                {row.relativePath ?? row.toolName.replace(/_/g, " ")}
              </span>
              {row.detail ? (
                <span className="gide-transcript-cluster__row-detail">{row.detail}</span>
              ) : null}
            </div>
            {row.openPath && onOpenFile ? (
              <button
                type="button"
                className="gide-transcript-cluster__row-open"
                onClick={() => onOpenFile(row.openPath!)}
                onPointerDown={ensureOverlayInteractive}
              >
                Open
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
