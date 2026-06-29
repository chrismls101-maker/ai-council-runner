import type { GlassPathway, PathwayLiveSession } from "../../shared/glassPathwaysTypes.ts";
import {
  buildPathwayNarrativeSummary,
  formatReceiptTime,
  recentPathwayReceipts,
} from "../../shared/glassPathwaysRuntime.ts";

interface GlassPathwayRuntimePanelProps {
  pathway: GlassPathway;
  liveSession: PathwayLiveSession | null;
  onCheckpoint?: () => void;
  compact?: boolean;
}

export function GlassPathwayRuntimePanel({
  pathway,
  liveSession,
  onCheckpoint,
  compact = false,
}: GlassPathwayRuntimePanelProps): JSX.Element | null {
  const summary = buildPathwayNarrativeSummary(pathway, liveSession);
  const receipts = recentPathwayReceipts(pathway, compact ? 3 : 5);

  if (!summary && receipts.length === 0) return null;

  return (
    <section
      className={`gpw-runtime${compact ? " gpw-runtime--compact" : ""}`}
      data-testid="glass-pathway-runtime-panel"
    >
      <div className="gpw-runtime__header">
        <h3 className="gpw-runtime__heading">Your journey</h3>
        {onCheckpoint ? (
          <button
            type="button"
            className="gpw-btn gpw-btn--secondary gpw-runtime__checkpoint"
            onClick={onCheckpoint}
            data-testid="glass-pathways-checkpoint"
          >
            Mark checkpoint
          </button>
        ) : null}
      </div>
      <p className="gpw-runtime__summary" role="status">{summary}</p>
      {receipts.length > 0 ? (
        <ul className="gpw-runtime__receipts">
          {receipts.map((receipt) => (
            <li key={receipt.id} data-testid="glass-pathway-receipt">
              <span className="gpw-runtime__receipt-time">{formatReceiptTime(receipt.timestamp)}</span>
              <span className="gpw-runtime__receipt-label">{receipt.summary}</span>
              {receipt.metadata?.detail && !compact ? (
                <span className="gpw-runtime__receipt-detail">{String(receipt.metadata.detail)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="gpw-runtime__empty">Actions you take here will appear in this log.</p>
      )}
    </section>
  );
}
