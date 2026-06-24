import { useState } from "react";
import type { CoderTranscriptVerifyItem } from "../../shared/glassIdeCoderTranscript.ts";
import { formatStructuredFailure } from "../../shared/glassQaStructuredParsers.ts";

interface GlassIdeTranscriptVerifyCardProps {
  item: CoderTranscriptVerifyItem;
  onOpenFile?: (relativePath: string) => void;
}

function statusClass(status: CoderTranscriptVerifyItem["status"]): string {
  switch (status) {
    case "running":
      return "gide-transcript-verify--running";
    case "pass":
      return "gide-transcript-verify--pass";
    case "fail":
      return "gide-transcript-verify--fail";
    case "warn":
      return "gide-transcript-verify--warn";
    case "deferred":
      return "gide-transcript-verify--deferred";
    case "blocked":
      return "gide-transcript-verify--blocked";
    default:
      return "gide-transcript-verify--skipped";
  }
}

function formatDuration(ms?: number): string | null {
  if (!ms || ms < 1) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

function VerifyRow({
  item,
  nested = false,
  onOpenFile,
}: {
  item: CoderTranscriptVerifyItem;
  nested?: boolean;
  onOpenFile?: (relativePath: string) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(
    item.status === "fail" || item.status === "warn" || item.status === "blocked",
  );
  const spinning = item.status === "running";
  const duration = formatDuration(item.durationMs);
  const hasDetails = Boolean(
    item.command
    || item.output
    || item.failures?.length
    || item.deferredReason,
  );

  return (
    <article
      className={`gide-transcript-verify ${statusClass(item.status)}${nested ? " gide-transcript-verify--nested" : ""}`}
      data-testid="glass-ide-transcript-verify"
      data-verify-id={item.id}
    >
      <header className="gide-transcript-verify__header">
        <span
          className={`gide-transcript-verify__icon${spinning ? " gide-transcript-verify__icon--spin" : ""}`}
          aria-hidden="true"
        >
          {item.icon ?? (item.status === "pass" ? "✓" : item.status === "fail" ? "✗" : "⟳")}
        </span>
        <div className="gide-transcript-verify__body">
          <span className="gide-transcript-verify__label">{item.label}</span>
          {duration ? <span className="gide-transcript-verify__duration">{duration}</span> : null}
          {item.command ? (
            <code className="gide-transcript-verify__command">{item.command}</code>
          ) : null}
          {item.output && !expanded ? (
            <span className="gide-transcript-verify__summary">{item.output}</span>
          ) : null}
        </div>
        {hasDetails ? (
          <button
            type="button"
            className="gide-transcript-verify__toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        ) : null}
      </header>

      {expanded && item.failures?.length ? (
        <ul className="gide-transcript-verify__failures">
          {item.failures.map((failure, index) => (
            <li key={`${item.id}-failure-${index}`} className="gide-transcript-verify__failure">
              <span>{formatStructuredFailure(failure)}</span>
              {failure.file && onOpenFile ? (
                <button
                  type="button"
                  className="gide-transcript-verify__open"
                  onClick={() => onOpenFile(failure.file!)}
                >
                  Open file
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {expanded && item.output && !item.failures?.length ? (
        <pre className="gide-transcript-verify__output">{item.output.slice(0, 480)}</pre>
      ) : null}

      {expanded && item.deferredReason ? (
        <p className="gide-transcript-verify__deferred">{item.deferredReason}</p>
      ) : null}
    </article>
  );
}

export function GlassIdeTranscriptVerifyCard({
  item,
  onOpenFile,
}: GlassIdeTranscriptVerifyCardProps): JSX.Element {
  if (item.nestedChecks?.length) {
    return (
      <div className="gide-transcript-verify-group" data-testid="glass-ide-transcript-verify-group">
        <VerifyRow item={item} onOpenFile={onOpenFile} />
        <div className="gide-transcript-verify-group__children">
          {item.nestedChecks.map((child) => (
            <VerifyRow key={child.id} item={child} nested onOpenFile={onOpenFile} />
          ))}
        </div>
      </div>
    );
  }

  return <VerifyRow item={item} onOpenFile={onOpenFile} />;
}
