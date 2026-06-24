import type { GlassIdeReviewShelfModel } from "../../shared/glassIdeReviewShelf.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeReviewShelfProps {
  shelf: GlassIdeReviewShelfModel;
  onOpenFile?: (relativePath: string) => void;
}

function statusClass(status: GlassIdeReviewShelfModel["touchedFiles"][number]["status"]): string {
  switch (status) {
    case "pending":
      return "gide-review-shelf__chip--pending";
    case "running":
      return "gide-review-shelf__chip--running";
    case "failed":
      return "gide-review-shelf__chip--failed";
    case "skipped":
      return "gide-review-shelf__chip--skipped";
    default:
      return "gide-review-shelf__chip--applied";
  }
}

export function GlassIdeReviewShelf({
  shelf,
  onOpenFile,
}: GlassIdeReviewShelfProps): JSX.Element | null {
  if (!shelf.visible) return null;

  return (
    <aside
      className="gide-review-shelf"
      data-testid="glass-ide-review-shelf"
      aria-label="Run review"
    >
      <div className="gide-review-shelf__head">
        <span className="gide-review-shelf__title">Review</span>
        <span className="gide-review-shelf__summary">{shelf.summaryLine}</span>
        {shelf.openNextPath && onOpenFile ? (
          <button
            type="button"
            className="gide-review-shelf__open-next"
            onClick={() => onOpenFile(shelf.openNextPath!)}
            onPointerDown={ensureOverlayInteractive}
          >
            Open next
          </button>
        ) : null}
      </div>
      {shelf.touchedFiles.length > 0 ? (
        <div className="gide-review-shelf__chips">
          {shelf.touchedFiles.map((file) => (
            <button
              key={file.relativePath}
              type="button"
              className={`gide-review-shelf__chip ${statusClass(file.status)}`}
              onClick={() => onOpenFile?.(file.relativePath)}
              onPointerDown={ensureOverlayInteractive}
              title={file.relativePath}
            >
              <span className="gide-review-shelf__chip-name">{file.fileName}</span>
              {(file.added > 0 || file.removed > 0) ? (
                <span className="gide-review-shelf__chip-diff">
                  {file.added > 0 ? <span className="gide-review-shelf__add">+{file.added}</span> : null}
                  {file.removed > 0 ? <span className="gide-review-shelf__rem">−{file.removed}</span> : null}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {shelf.failedCheckCount > 0 ? (
        <p className="gide-review-shelf__warn">
          {shelf.failedCheckCount} verification check{shelf.failedCheckCount === 1 ? "" : "s"} failed
        </p>
      ) : null}
    </aside>
  );
}
