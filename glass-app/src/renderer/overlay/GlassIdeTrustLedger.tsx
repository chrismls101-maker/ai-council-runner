import type { GlassIdeTrustLedgerModel } from "../../shared/glassIdeRunSummary.ts";

interface GlassIdeTrustLedgerProps {
  ledger: GlassIdeTrustLedgerModel;
}

export function GlassIdeTrustLedger({
  ledger,
}: GlassIdeTrustLedgerProps): JSX.Element | null {
  if (!ledger.visible) return null;

  return (
    <div
      className="gide-trust-ledger"
      data-testid="glass-ide-trust-ledger"
      aria-label="Run activity"
    >
      <div className="gide-trust-ledger__counters">
        {ledger.counters.map((counter) => (
          <span key={counter.id} className="gide-trust-ledger__chip" title={counter.label}>
            <span className="gide-trust-ledger__chip-value">{counter.formatted}</span>
          </span>
        ))}
      </div>
      {ledger.usageLine ? (
        <span className="gide-trust-ledger__usage">{ledger.usageLine}</span>
      ) : null}
    </div>
  );
}
