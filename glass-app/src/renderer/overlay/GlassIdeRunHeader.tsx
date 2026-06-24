import type { GlassIdeRunHeaderModel } from "../../shared/glassIdeRunHeader.ts";
import type { GlassIdeReviewFileChip } from "../../shared/glassIdeReviewShelf.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeRunHeaderProps {
  header: GlassIdeRunHeaderModel;
  onStop?: () => void;
  onOpenFile?: (relativePath: string) => void;
  onTrustEdits?: (runId: string) => void;
  onRollback?: (runId: string) => void;
  activeRunId?: string | null;
}

function chipStatusClass(status: GlassIdeReviewFileChip["status"]): string {
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

export function GlassIdeRunHeader({
  header,
  onStop,
  onOpenFile,
  onTrustEdits,
  onRollback,
  activeRunId,
}: GlassIdeRunHeaderProps): JSX.Element | null {
  if (!header.visible) return null;

  const showShelf = header.touchedFiles.length > 0 || header.failedCheckCount > 0;
  const trustRunId = activeRunId ?? header.rollbackRunId;

  return (
    <header
      className={`gide-run-header${showShelf ? " gide-run-header--with-shelf" : ""}`}
      data-testid="glass-ide-run-header"
      aria-label="Coder run"
    >
      <div className="gide-run-header__main">
        {header.taskLabel ? (
          <p className="gide-run-header__task" title={header.taskLabel}>{header.taskLabel}</p>
        ) : null}
        <div className="gide-run-header__meta">
          {header.phaseLabel ? (
            <span className="gide-run-header__phase" data-phase={header.phase ?? undefined}>
              {header.phaseLabel}
            </span>
          ) : null}
          <span className="gide-run-header__model">{header.modelLabel}</span>
          {header.elapsedLabel ? (
            <span className="gide-run-header__elapsed">{header.elapsedLabel}</span>
          ) : null}
          {header.qaProgressLine ? (
            <span className="gide-run-header__qa-progress">{header.qaProgressLine}</span>
          ) : null}
          {header.runStatsLine ? (
            <span className="gide-run-header__stats">{header.runStatsLine}</span>
          ) : (
            <span
              className={`gide-run-header__status${header.approvalPending ? " gide-run-header__status--pending" : ""}`}
            >
              {header.statusLabel}
            </span>
          )}
        </div>
        {(header.showTrustEdits || header.canRollback) ? (
          <div className="gide-run-header__actions">
            {header.showTrustEdits && trustRunId && onTrustEdits ? (
              <button
                type="button"
                className="gide-run-header__action"
                data-testid="glass-ide-header-trust-edits"
                onClick={() => onTrustEdits(trustRunId)}
                onPointerDown={ensureOverlayInteractive}
              >
                Trust edits for this run
              </button>
            ) : null}
            {header.canRollback && header.rollbackRunId && onRollback ? (
              <button
                type="button"
                className="gide-run-header__action gide-run-header__action--warn"
                data-testid="glass-ide-header-rollback"
                onClick={() => onRollback(header.rollbackRunId!)}
                onPointerDown={ensureOverlayInteractive}
              >
                Rollback to checkpoint
              </button>
            ) : null}
          </div>
        ) : null}
        {header.openNextPath && onOpenFile ? (
          <div className="gide-run-header__next">
            <span className="gide-run-header__next-label">Next review</span>
            <button
              type="button"
              className="gide-run-header__open-next"
              onClick={() => onOpenFile(header.openNextPath!)}
              onPointerDown={ensureOverlayInteractive}
            >
              {header.openNextPath.split("/").pop()}
            </button>
          </div>
        ) : null}
        {showShelf && header.touchedFiles.length > 0 ? (
          <div className="gide-run-header__chips" data-testid="glass-ide-review-shelf">
            {header.touchedFiles.map((file) => (
              <button
                key={file.relativePath}
                type="button"
                className={`gide-review-shelf__chip ${chipStatusClass(file.status)}`}
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
        {header.failedCheckCount > 0 ? (
          <p className="gide-run-header__warn">
            {header.failedCheckCount} verification check{header.failedCheckCount === 1 ? "" : "s"} failed
          </p>
        ) : null}
      </div>
      {header.showStop && onStop ? (
        <button
          type="button"
          className="gide-run-header__stop"
          onClick={onStop}
          onPointerDown={ensureOverlayInteractive}
          aria-label="Stop Coder run"
        >
          Stop
        </button>
      ) : null}
    </header>
  );
}
