import { useState } from "react";
import type { ListenMeaningNote } from "../../shared/listenMeaningNote.ts";

/** Single lightbulb insight — no stacking, expand on click only. */
export function ListenInsightStrip({
  insight,
}: {
  insight: ListenMeaningNote | undefined;
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (!insight) return null;

  const hasWhy = Boolean(insight.whyItMatters?.trim());

  return (
    <div className="listen-insight-strip" data-testid="glass-listen-insight-strip">
      <button
        type="button"
        className="listen-insight-strip__toggle"
        data-testid="glass-listen-insight-toggle"
        aria-expanded={expanded}
        disabled={!hasWhy}
        onClick={() => hasWhy && setExpanded((v) => !v)}
      >
        <span className="listen-insight-strip__bulb" aria-hidden="true">
          💡
        </span>
        <span className="listen-insight-strip__text">{insight.note}</span>
      </button>
      {expanded && insight.whyItMatters ? (
        <p className="listen-insight-strip__why" data-testid="glass-listen-insight-why">
          {insight.whyItMatters}
        </p>
      ) : null}
    </div>
  );
}
