import { useCallback, useEffect, useState, type JSX } from "react";
import type { IivoAccountLink } from "../../shared/iivoAccountLink.ts";
import type { GlassState } from "../../shared/ipc.ts";

type GlassSummary = {
  flags: {
    aiCallsEnabled: boolean;
    overlayDemoEnabled: boolean;
    terminalAutoFixEnabled: boolean;
    coderBuildLoopEnabledForNewUsers: boolean;
  };
  apiHealth: "ok" | "degraded";
  glassBrowse: {
    entered: { last24h: number; last7d: number };
    commands: { last24h: number; last7d: number };
    autoExit: { last24h: number; last7d: number };
  };
  buildLoopRuns24h: number | null;
  buildLoopRunsNote: string;
};

interface FounderTabProps {
  state: GlassState;
  link: IivoAccountLink;
}

export default function FounderTab({ state, link }: FounderTabProps): JSX.Element {
  const [summary, setSummary] = useState<GlassSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const apiBase = state.iivoApiUrl.replace(/\/$/, "");

  const authHeaders = useCallback((): HeadersInit => ({
    Authorization: `Bearer ${link.sessionToken}`,
    "Content-Type": "application/json",
  }), [link.sessionToken]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/founder/glass-summary`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { summary: GlassSummary };
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load founder summary");
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(
    key: "aiCallsEnabled" | "overlayDemoEnabled",
  ): Promise<void> {
    if (!summary) return;
    const next = !summary.flags[key];
    setSaving(key);
    setSummary({
      ...summary,
      flags: { ...summary.flags, [key]: next },
    });
    try {
      const res = await fetch(`${apiBase}/api/founder/flags`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update flag");
      void load();
    } finally {
      setSaving(null);
    }
  }

  if (error && !summary) {
    return <p className="account-tab__error">{error}</p>;
  }

  if (!summary) {
    return <p className="account-tab__hint">Loading founder dashboard…</p>;
  }

  const healthLabel = summary.apiHealth === "ok" ? "OK" : "Degraded";

  return (
    <div className="founder-tab">
      {error ? <p className="account-tab__error">{error}</p> : null}

      <section className="founder-tab__section">
        <h3 className="account-tab__title">System health</h3>
        <ul className="founder-tab__metrics">
          <li>
            <span>API health</span>
            <strong data-health={summary.apiHealth}>{healthLabel}</strong>
          </li>
          <li>
            <span>AI calls</span>
            <strong>{summary.flags.aiCallsEnabled ? "Enabled" : "Disabled"}</strong>
          </li>
          <li>
            <span>Overlay demo</span>
            <strong>{summary.flags.overlayDemoEnabled ? "On" : "Off"}</strong>
          </li>
        </ul>
      </section>

      <section className="founder-tab__section">
        <h3 className="account-tab__title">Session usage (24h)</h3>
        <ul className="founder-tab__metrics">
          <li><span>Glass browse enters</span><strong>{summary.glassBrowse.entered.last24h}</strong></li>
          <li><span>Overlay commands</span><strong>{summary.glassBrowse.commands.last24h}</strong></li>
          <li><span>Auto exits</span><strong>{summary.glassBrowse.autoExit.last24h}</strong></li>
          <li>
            <span>Build-loop runs</span>
            <strong>
              {summary.buildLoopRuns24h ?? "—"}
            </strong>
          </li>
        </ul>
        <p className="account-tab__hint">{summary.buildLoopRunsNote}</p>
      </section>

      <section className="founder-tab__section">
        <h3 className="account-tab__title">Quick toggles</h3>
        <label className="founder-tab__toggle">
          <input
            type="checkbox"
            checked={summary.flags.aiCallsEnabled}
            disabled={saving === "aiCallsEnabled"}
            onChange={() => { void toggleFlag("aiCallsEnabled"); }}
          />
          <span>AI calls enabled</span>
        </label>
        <label className="founder-tab__toggle">
          <input
            type="checkbox"
            checked={summary.flags.overlayDemoEnabled}
            disabled={saving === "overlayDemoEnabled"}
            onChange={() => { void toggleFlag("overlayDemoEnabled"); }}
          />
          <span>Overlay demo on iivo.ai</span>
        </label>
        <p className="account-tab__hint">
          Full landing funnel totals (page views, enter rate) live on iivo.ai → Account → Founder.
          <code>GLASS_BROWSE_STATS_TOKEN</code> is for investor curl / weekly snapshots only.
        </p>
      </section>
    </div>
  );
}
