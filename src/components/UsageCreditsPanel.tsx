import { useCallback, useEffect, useState } from "react";
import { withIivoWordmark } from "../utils/brandText";
import type { UsageSummaryResponse } from "../types/usage";
import { FUTURE_PRICING_TIERS } from "../types/usage";
import { downloadJson } from "../utils/downloadJson";
import {
  addLocalCredits,
  exportUsageEvents,
  fetchUsageSummary,
  formatCredits,
  resetLocalCredits,
} from "../utils/usageApi";

interface UsageCreditsPanelProps {
  onFeedback: (message: string) => void;
  onUsageChange?: (usage: UsageSummaryResponse) => void;
}

function formatEventType(type: string): string {
  return type.replace(/_/g, " ");
}

export default function UsageCreditsPanel({
  onFeedback,
  onUsageChange,
}: UsageCreditsPanelProps) {
  const [usage, setUsage] = useState<UsageSummaryResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchUsageSummary();
      setUsage(next);
      onUsageChange?.(next);
    } catch {
      onFeedback("Could not load usage");
    }
  }, [onFeedback, onUsageChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (action: "add" | "reset" | "export") => {
    setBusy(action);
    try {
      if (action === "add") {
        const next = await addLocalCredits(25);
        setUsage(next);
        onUsageChange?.(next);
        onFeedback("Added 25 local credits");
      } else if (action === "reset") {
        if (!window.confirm("Reset local credits to 100?")) return;
        const next = await resetLocalCredits();
        setUsage(next);
        onUsageChange?.(next);
        onFeedback("Local credits reset");
      } else {
        const data = await exportUsageEvents();
        const stamp = new Date().toISOString().slice(0, 10);
        downloadJson(`iivo-usage-events-${stamp}.json`, data);
        onFeedback("Exported usage events");
        try {
          await fetch("/api/audit/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventType: "usage_exported" }),
          });
        } catch {
          /* audit optional */
        }
      }
    } catch {
      onFeedback("Usage action failed");
    } finally {
      setBusy(null);
    }
  };

  if (!usage) {
    return (
      <section className="panel-section usage-credits-panel">
        <h2>Usage & Credits</h2>
        <p className="muted">Loading usage…</p>
      </section>
    );
  }

  return (
    <section className="panel-section usage-credits-panel" data-testid="usage-credits-panel">
      <h2>Usage & Credits</h2>
      <p className="usage-local-note muted" data-testid="usage-local-simulation-note">
        Local usage simulation for development — not billing. Local Free is a simulation until
        billing is added.
      </p>
      <p className="usage-explainer muted">
        {withIivoWordmark(
          "Credits control how many runs you can make. They are separate from provider dollar cost. More complex workflows use more credits. Benchmarking costs more because it runs a baseline plus IIVO. Attaching context is free; running IIVO with that context uses normal workflow credits. Screenshot capture and evidence storage cost 0 credits. Visual analysis of a screenshot uses Direct Answer (1 credit) plus a vision image add-on (+2 credits) when image vision is enabled.",
          "usage-explainer",
        )}
      </p>

      <div className="usage-balance-grid">
        <div className="usage-balance-card">
          <span className="usage-balance-label">Current credits</span>
          <strong className="usage-balance-value">{usage.currentCredits}</strong>
        </div>
        <div className="usage-balance-card">
          <span className="usage-balance-label">Monthly allowance</span>
          <strong className="usage-balance-value">{usage.monthlyCredits}</strong>
        </div>
        <div className="usage-balance-card">
          <span className="usage-balance-label">Used this month</span>
          <strong className="usage-balance-value">{usage.usedCreditsThisMonth}</strong>
        </div>
        <div className="usage-balance-card">
          <span className="usage-balance-label">Plan</span>
          <strong className="usage-balance-value">Local Free</strong>
        </div>
      </div>

      <p className="usage-reset-line muted">
        Resets {new Date(usage.resetDate).toLocaleDateString()}
      </p>

      <div className="settings-action-grid">
        <button
          type="button"
          className="btn ghost"
          disabled={busy !== null}
          onClick={() => runAction("add")}
        >
          {busy === "add" ? "Adding…" : "Add 25 local credits"}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy !== null}
          onClick={() => runAction("reset")}
        >
          {busy === "reset" ? "Resetting…" : "Reset local credits"}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy !== null}
          onClick={() => runAction("export")}
        >
          {busy === "export" ? "Exporting…" : "Export usage events"}
        </button>
      </div>

      <h3 className="usage-subheading">Credit cost table</h3>
      <p className="usage-table-note muted">
        Direct Answer: 1 · Vision image add-on: +2 · Entity Search: 3 · Product Decision: 5 · Sales
        Attack: 7 · Market Research: 8 · Competitive Intelligence: 8 · Technical Audit: 8 · Deep
        mode: 2x · Benchmark add-on: +3
      </p>
      <table className="usage-cost-table" data-testid="usage-cost-table">
        <thead>
          <tr>
            <th>Workflow / option</th>
            <th>Credits</th>
          </tr>
        </thead>
        <tbody>
          {(usage.costTable ?? []).map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{typeof row.credits === "number" && row.credits % 1 ? `${row.credits}x` : formatCredits(row.credits)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="usage-subheading">Recent usage</h3>
      {usage.recentUsage.length === 0 ? (
        <p className="muted">No usage events yet.</p>
      ) : (
        <ul className="usage-events-list">
          {usage.recentUsage.slice(0, 15).map((event) => (
            <li key={event.id} className="usage-event-item">
              <div className="usage-event-main">
                <span className="usage-event-type">{formatEventType(event.eventType)}</span>
                {event.credits != null && (
                  <span className="usage-event-credits">{formatCredits(event.credits)}</span>
                )}
              </div>
              <div className="usage-event-meta muted">
                {new Date(event.timestamp).toLocaleString()}
                {event.workflowId ? ` · ${event.workflowId}` : ""}
                {event.balanceAfter != null ? ` · balance ${event.balanceAfter}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="usage-subheading">Future pricing model</h3>
      <ul className="usage-future-pricing">
        {FUTURE_PRICING_TIERS.map((tier) => (
          <li key={tier}>{tier}</li>
        ))}
      </ul>
    </section>
  );
}
