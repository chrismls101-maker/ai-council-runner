import { forwardRef, useEffect, useState } from "react";
import type { GlassIdeReviewFileChip } from "../../shared/glassIdeReviewShelf.ts";
import type { GlassIdeChangesetSummary } from "../../shared/glassIdeActiveFocus.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeChangesetPanelProps {
  summary: GlassIdeChangesetSummary;
  files: GlassIdeReviewFileChip[];
  onOpenFile?: (relativePath: string) => void;
  defaultOpen?: boolean;
}

function chipStatusClass(status: GlassIdeReviewFileChip["status"]): string {
  switch (status) {
    case "pending":
      return "gide-changeset__row--pending";
    case "running":
      return "gide-changeset__row--running";
    case "failed":
      return "gide-changeset__row--failed";
    case "skipped":
      return "gide-changeset__row--skipped";
    default:
      return "gide-changeset__row--applied";
  }
}

export const GlassIdeChangesetPanel = forwardRef<HTMLDetailsElement, GlassIdeChangesetPanelProps>(
  function GlassIdeChangesetPanel({
    summary,
    files,
    onOpenFile,
    defaultOpen = false,
  }, ref): JSX.Element | null {
    const [open, setOpen] = useState(defaultOpen);

    useEffect(() => {
      if (defaultOpen) setOpen(true);
    }, [defaultOpen]);

    if (!summary.visible || files.length === 0) return null;

    return (
      <details
        ref={ref}
        className="gide-changeset"
        data-testid="glass-ide-changeset"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="gide-changeset__summary">
          <span className="gide-changeset__title">Changeset</span>
          <span className="gide-changeset__headline">{summary.headline}</span>
          {summary.detail ? (
            <span className="gide-changeset__detail">{summary.detail}</span>
          ) : null}
        </summary>
        <ul className="gide-changeset__list">
          {files.map((file) => (
            <li key={file.relativePath} className={`gide-changeset__row ${chipStatusClass(file.status)}`}>
              <button
                type="button"
                className="gide-changeset__open"
                onClick={() => onOpenFile?.(file.relativePath)}
                onPointerDown={ensureOverlayInteractive}
                title={file.relativePath}
              >
                <span className="gide-changeset__path">{file.relativePath}</span>
                <span className="gide-changeset__meta">
                  <span className="gide-changeset__status">{file.status}</span>
                  {(file.added > 0 || file.removed > 0) ? (
                    <span className="gide-changeset__diff">
                      {file.added > 0 ? <span className="gide-review-shelf__add">+{file.added}</span> : null}
                      {file.removed > 0 ? <span className="gide-review-shelf__rem">−{file.removed}</span> : null}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    );
  },
);
