import { useCallback, useEffect, useState, type JSX } from "react";

const INVESTOR_CURL = `curl -H "Authorization: Bearer YOUR_TOKEN" https://iivo.ai/api/landing/glass-browse/stats`;

type FeatureFlagKey =
  | "overlayDemoEnabled"
  | "terminalAutoFixEnabled"
  | "coderBuildLoopEnabledForNewUsers"
  | "aiCallsEnabled";

type Overview = {
  health: {
    sessions: { last24h: number; last7d: number };
    errors: { last24h: number; last7d: number };
    errorRate24h: number;
    status: "green" | "yellow" | "red";
  };
  usage: {
    estimatedSpendUsd24h: number;
    estimatedSpendUsd7d: number;
    topSessions: Array<{ label: string; credits: number }>;
    topSessionsNote: string;
  };
  flags: Record<FeatureFlagKey, boolean> & { updatedAt: string };
  glassBrowse: {
    pageViews: number;
    entered: number;
    commanded: number;
    autoExit: number;
    manualExit: number;
    mobilePreview: number;
    enterRate: number | null;
    commandRate: number | null;
  };
};

const FLAG_LABELS: Record<FeatureFlagKey, string> = {
  overlayDemoEnabled: "Glass overlay demo (iivo.ai)",
  terminalAutoFixEnabled: "Terminal Auto Fix (global)",
  coderBuildLoopEnabledForNewUsers: "Full build loop for new linked accounts",
  aiCallsEnabled: "AI calls (global kill switch)",
};

function statusLabel(status: Overview["health"]["status"]): string {
  switch (status) {
    case "green": return "Healthy";
    case "yellow": return "Elevated errors";
    default: return "Degraded";
  }
}

export default function FounderDashboard(): JSX.Element {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<FeatureFlagKey | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/founder/overview", { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as Overview & { ok?: boolean };
      setOverview({
        health: data.health,
        usage: data.usage,
        flags: data.flags,
        glassBrowse: data.glassBrowse,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load founder dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(key: FeatureFlagKey): Promise<void> {
    if (!overview) return;
    const next = !overview.flags[key];
    setSaving(key);
    setOverview({
      ...overview,
      flags: { ...overview.flags, [key]: next },
    });
    try {
      const res = await fetch("/api/founder/flags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { flags: Overview["flags"] };
      setOverview((prev) => (prev ? { ...prev, flags: data.flags } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update flag");
      void load();
    } finally {
      setSaving(null);
    }
  }

  async function copyInvestorCurl(): Promise<void> {
    await navigator.clipboard.writeText(INVESTOR_CURL);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  }

  if (error && !overview) {
    return <p className="account-error">{error}</p>;
  }

  if (!overview) {
    return <div className="account-spinner" aria-label="Loading founder dashboard" />;
  }

  const { health, usage, flags, glassBrowse } = overview;

  return (
    <div className="founder-dash">
      {error ? <p className="account-error">{error}</p> : null}

      <section className="founder-section">
        <h2 className="account-section__title">Health &amp; errors</h2>
        <div className={`founder-status founder-status--${health.status}`}>
          {statusLabel(health.status)}
          <span>
            Error rate 24h: {(health.errorRate24h * 100).toFixed(1)}%
          </span>
        </div>
        <div className="founder-cards">
          <div className="founder-card">
            <p className="founder-card__label">Sessions</p>
            <p className="founder-card__value">{health.sessions.last24h}</p>
            <p className="founder-card__sub">24h · {health.sessions.last7d} in 7d</p>
          </div>
          <div className="founder-card">
            <p className="founder-card__label">Errors</p>
            <p className="founder-card__value">{health.errors.last24h}</p>
            <p className="founder-card__sub">24h · {health.errors.last7d} in 7d</p>
          </div>
        </div>
      </section>

      <section className="founder-section">
        <h2 className="account-section__title">Cost &amp; usage</h2>
        <div className="founder-cards">
          <div className="founder-card">
            <p className="founder-card__label">Est. credits (24h)</p>
            <p className="founder-card__value">{usage.estimatedSpendUsd24h}</p>
          </div>
          <div className="founder-card">
            <p className="founder-card__label">Est. credits (7d)</p>
            <p className="founder-card__value">{usage.estimatedSpendUsd7d}</p>
          </div>
        </div>
        <div className="founder-card founder-card--wide">
          <p className="founder-card__label">Top sessions by credits</p>
          {usage.topSessions.length > 0 ? (
            <ul className="founder-list">
              {usage.topSessions.map((row) => (
                <li key={row.label}>
                  <code>{row.label.slice(0, 12)}…</code>
                  <span>{row.credits}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="founder-card__sub">{usage.topSessionsNote}</p>
          )}
        </div>
      </section>

      <section className="founder-section">
        <h2 className="account-section__title">Landing funnel (Glass browse)</h2>
        <p className="account-section__desc">
          Live overlay demo on iivo.ai — same data as the secured stats API.
        </p>
        <div className="founder-cards">
          <div className="founder-card">
            <p className="founder-card__label">Page views</p>
            <p className="founder-card__value">{glassBrowse.pageViews}</p>
          </div>
          <div className="founder-card">
            <p className="founder-card__label">Entered overlay</p>
            <p className="founder-card__value">{glassBrowse.entered}</p>
            <p className="founder-card__sub">
              {glassBrowse.enterRate != null
                ? `${(glassBrowse.enterRate * 100).toFixed(1)}% enter rate`
                : "—"}
            </p>
          </div>
          <div className="founder-card">
            <p className="founder-card__label">Commands</p>
            <p className="founder-card__value">{glassBrowse.commanded}</p>
          </div>
          <div className="founder-card">
            <p className="founder-card__label">Mobile previews</p>
            <p className="founder-card__value">{glassBrowse.mobilePreview}</p>
          </div>
        </div>
      </section>

      <section className="founder-section">
        <h2 className="account-section__title">Investor &amp; ops tools</h2>
        <p className="account-section__desc">
          The funnel numbers above are live — you do not need a token while signed in here.
          <code className="founder-inline-code">GLASS_BROWSE_STATS_TOKEN</code> is only for
          terminal curl and weekly snapshots when you are not in this dashboard.
        </p>
        <div className="founder-card founder-card--wide">
          <p className="founder-card__label">Investor curl (replace YOUR_TOKEN)</p>
          <code className="founder-curl">{INVESTOR_CURL}</code>
          <button
            type="button"
            className="founder-copy-btn"
            onClick={() => { void copyInvestorCurl(); }}
          >
            {curlCopied ? "Copied!" : "Copy curl template"}
          </button>
        </div>
        <ul className="founder-ops-list">
          <li>
            <strong>Railway:</strong> set <code>GLASS_BROWSE_STATS_TOKEN</code> once
            (<code>openssl rand -hex 24</code>). Store the value in your password manager — it is
            not shown in this UI.
          </li>
          <li>
            <strong>Weekly snapshot:</strong>{" "}
            <code>GLASS_BROWSE_STATS_TOKEN=… npm run glass-browse:stats-snapshot</code> → saves to{" "}
            <code>data/landing/snapshots/</code> for trend lines.
          </li>
          <li>
            <strong>Glass desktop:</strong> Settings → Founder tab shows 24h enters/commands;
            full funnel totals stay here on iivo.ai.
          </li>
        </ul>
      </section>

      <section className="founder-section">
        <h2 className="account-section__title">Product levers</h2>
        <p className="account-section__desc">
          Updated {new Date(flags.updatedAt).toLocaleString()}
        </p>
        <ul className="founder-toggles">
          {(Object.keys(FLAG_LABELS) as FeatureFlagKey[]).map((key) => (
            <li key={key}>
              <label className="founder-toggle">
                <input
                  type="checkbox"
                  checked={flags[key]}
                  disabled={saving === key}
                  onChange={() => { void toggleFlag(key); }}
                />
                <span>{FLAG_LABELS[key]}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <style>{`
        .founder-dash { display: flex; flex-direction: column; gap: 20px; }
        .founder-section {
          background: #13131a; border: 1px solid #2a2a3a; border-radius: 12px;
          padding: 24px;
        }
        .founder-status {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 14px; border-radius: 8px; margin-bottom: 16px;
          font-size: 14px; font-weight: 600;
        }
        .founder-status--green { background: #052e16; color: #86efac; }
        .founder-status--yellow { background: #422006; color: #fcd34d; }
        .founder-status--red { background: #450a0a; color: #fca5a5; }
        .founder-status span { font-weight: 400; opacity: 0.9; }
        .founder-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .founder-card {
          background: #0a0a0f; border: 1px solid #2a2a3a; border-radius: 8px;
          padding: 14px 16px;
        }
        .founder-card--wide { margin-top: 12px; grid-column: 1 / -1; }
        .founder-card__label { margin: 0 0 6px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
        .founder-card__value { margin: 0; font-size: 28px; font-weight: 700; color: #f0f0f8; }
        .founder-card__sub { margin: 6px 0 0; font-size: 13px; color: #666; }
        .founder-list { list-style: none; margin: 8px 0 0; padding: 0; }
        .founder-list li {
          display: flex; justify-content: space-between; padding: 6px 0;
          border-bottom: 1px solid #1e1e2e; font-size: 13px; color: #ccc;
        }
        .founder-list code { color: #a78bfa; }
        .founder-toggles { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .founder-toggle { display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 14px; color: #d0d0e8; }
        .founder-toggle input { width: 18px; height: 18px; accent-color: #7c3aed; }
        .founder-inline-code, .founder-ops-list code {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 12px;
          color: #a78bfa;
        }
        .founder-curl {
          display: block;
          margin: 8px 0 12px;
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.5;
          color: #c4b5fd;
          background: #0a0a0f;
          border: 1px solid #2a2a3a;
          word-break: break-all;
        }
        .founder-copy-btn {
          display: inline-flex;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #d0d0e8;
          background: #1e1e2e;
          border: 1px solid #333;
          cursor: pointer;
        }
        .founder-copy-btn:hover { background: #28283a; }
        .founder-ops-list {
          margin: 16px 0 0;
          padding-left: 1.2rem;
          font-size: 13px;
          line-height: 1.6;
          color: #888;
        }
        .founder-ops-list li + li { margin-top: 10px; }
        .founder-ops-list strong { color: #ccc; font-weight: 600; }
      `}</style>
    </div>
  );
}
