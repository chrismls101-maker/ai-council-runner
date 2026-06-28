import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProviderSpendResult,
  SpendSnapshot,
  CustomSpendProvider,
  ApiKeyMeta,
  SpendDaySummary,
} from "../../shared/ipc.ts";
import "./SpendTrackerPanel.css";

// ---------------------------------------------------------------------------
// localStorage helpers for custom providers
// ---------------------------------------------------------------------------

const CUSTOM_PROVIDERS_KEY = "glass:custom-spend-providers";

function loadCustomProviders(): CustomSpendProvider[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomProviders(providers: CustomSpendProvider[]): void {
  localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(providers));
}

// ---------------------------------------------------------------------------
// JSON dot-path resolver  e.g. "data.balance.amount" → value
// ---------------------------------------------------------------------------

function resolvePath(obj: unknown, path: string): number | undefined {
  if (!path || obj == null) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "number" ? cur : typeof cur === "string" ? parseFloat(cur) : undefined;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(usd: number | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function fmtUnits(n: number | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtReset(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `Resets ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function fmtAge(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ---------------------------------------------------------------------------
// Standard provider row
// ---------------------------------------------------------------------------

function ProviderRow({
  provider,
}: {
  provider: ProviderSpendResult;
}): JSX.Element {
  const { displayName, status, todayUSD, monthUSD, balanceUSD,
          unitLabel, unitsUsed, unitLimit, unitReset, error } = provider;

  const usagePct = unitLimit && unitsUsed != null
    ? Math.min(100, (unitsUsed / unitLimit) * 100)
    : null;

  return (
    <div className={`sp-row sp-row--${status}`}>
      <div className="sp-row-header">
        <div className="sp-row-name">
          <span className={`sp-dot sp-dot--${status}`} />
          {displayName}
          {status !== "ok" && (
            <span className="sp-badge">
              {status === "no-key" ? "no key" : status === "unavailable" ? "n/a" : "error"}
            </span>
          )}
        </div>
        <div className="sp-row-amounts">
          {status === "ok" && (
            <>
              {todayUSD != null && (
                <div className="sp-amount">
                  <span className="sp-amount-label">today</span>
                  <span className="sp-amount-value">{fmt(todayUSD)}</span>
                </div>
              )}
              {monthUSD != null && (
                <div className="sp-amount">
                  <span className="sp-amount-label">period</span>
                  <span className="sp-amount-value">{fmt(monthUSD)}</span>
                </div>
              )}
              {balanceUSD != null && (
                <div className="sp-amount">
                  <span className="sp-amount-label">balance</span>
                  <span className="sp-amount-value sp-amount-value--balance">{fmt(balanceUSD)}</span>
                </div>
              )}
            </>
          )}
          {status === "no-key" && (
            <span className="sp-row-hint">Add key in API Keys tab</span>
          )}
          {status === "unavailable" && (
            <span className="sp-row-hint" title={error}>no billing API</span>
          )}
          {status === "error" && (
            <span className="sp-row-hint sp-row-hint--error" title={error}>fetch failed</span>
          )}
        </div>
      </div>

      {status === "ok" && usagePct != null && (
        <div className="sp-usage-wrap">
          <div className="sp-usage-bar-track">
            <div
              className={`sp-usage-bar-fill${usagePct > 85 ? " sp-usage-bar-fill--warn" : ""}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="sp-usage-meta">
            <span>{fmtUnits(unitsUsed)} / {fmtUnits(unitLimit)} {unitLabel}</span>
            {unitReset && <span className="sp-usage-reset">{fmtReset(unitReset)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom provider row
// ---------------------------------------------------------------------------

interface CustomRowState {
  status: "idle" | "loading" | "ok" | "error";
  value?: number;
  error?: string;
  lastFetched?: number;
}

function CustomProviderRow({
  provider,
  onDelete,
}: {
  provider: CustomSpendProvider;
  onDelete: (id: string) => void;
}): JSX.Element {
  const [state, setState] = useState<CustomRowState>({ status: "idle" });

  const fetch = useCallback(async (): Promise<void> => {
    setState({ status: "loading" });
    try {
      const res = await window.glass.spendCustomFetch({
        url: provider.url,
        authStyle: provider.authStyle,
        customHeaderName: provider.customHeaderName,
        queryParamName: provider.queryParamName,
        keyId: provider.keyId,
      });

      if (!res.ok) {
        setState({ status: "error", error: res.error ?? `HTTP ${res.status}` });
        return;
      }

      const raw = resolvePath(res.body, provider.responsePath);
      if (raw == null) {
        setState({ status: "error", error: `Path "${provider.responsePath}" not found in response` });
        return;
      }

      const divisor = provider.divisor && provider.divisor !== 1 ? provider.divisor : 1;
      setState({ status: "ok", value: raw / divisor, lastFetched: Date.now() });
    } catch (err) {
      setState({ status: "error", error: err instanceof Error ? err.message : "Fetch failed" });
    }
  }, [provider]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return (
    <div className="sp-row sp-row--custom">
      <div className="sp-row-header">
        <div className="sp-row-name">
          <span className={`sp-dot sp-dot--${state.status === "ok" ? "ok" : state.status === "error" ? "error" : "unavailable"}`} />
          {provider.name}
          <span className="sp-badge sp-badge--custom">custom</span>
        </div>
        <div className="sp-row-amounts">
          {state.status === "loading" && <span className="sp-spinner sp-spinner--sm" />}
          {state.status === "ok" && state.value != null && (
            <div className="sp-amount">
              <span className="sp-amount-label">{provider.spendPeriod ?? "month"}</span>
              <span className="sp-amount-value">{fmt(state.value)}</span>
            </div>
          )}
          {state.status === "error" && (
            <span className="sp-row-hint sp-row-hint--error" title={state.error}>fetch failed</span>
          )}
          <button
            type="button"
            className="sp-btn-row-action"
            onClick={() => void fetch()}
            disabled={state.status === "loading"}
            title="Refresh"
          >↺</button>
          <button
            type="button"
            className="sp-btn-row-action sp-btn-row-action--delete"
            onClick={() => onDelete(provider.id)}
            title="Remove"
          >✕</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Provider form
// ---------------------------------------------------------------------------

const EMPTY_FORM: Omit<CustomSpendProvider, "id"> = {
  name: "",
  url: "",
  authStyle: "bearer",
  keyId: "",
  responsePath: "",
  divisor: 1,
  spendPeriod: "month",
};

function AddProviderForm({
  storedKeys,
  onSave,
  onCancel,
}: {
  storedKeys: ApiKeyMeta[];
  onSave: (p: CustomSpendProvider) => void;
  onCancel: () => void;
}): JSX.Element {
  const [form, setForm] = useState(EMPTY_FORM);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
    setTestResult(null);
  }

  const valid = form.name.trim() && form.url.trim() && form.keyId && form.responsePath.trim();

  async function handleTest(): Promise<void> {
    if (!form.keyId || !form.url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await window.glass.spendCustomFetch({
        url: form.url,
        authStyle: form.authStyle,
        customHeaderName: form.customHeaderName,
        queryParamName: form.queryParamName,
        keyId: form.keyId,
      });
      if (!res.ok) {
        setTestResult(`❌ HTTP ${res.status ?? "?"}: ${res.error ?? "failed"}`);
        return;
      }
      const raw = resolvePath(res.body, form.responsePath);
      if (raw == null) {
        setTestResult(`⚠️ Path "${form.responsePath}" not found. Response keys: ${JSON.stringify(Object.keys((res.body as object) ?? {})).slice(0, 80)}`);
        return;
      }
      const divisor = form.divisor && form.divisor !== 1 ? form.divisor : 1;
      setTestResult(`✅ Got ${fmt(raw / divisor)} — looks good!`);
    } catch (err) {
      setTestResult(`❌ ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTesting(false);
    }
  }

  function handleSave(): void {
    if (!valid) return;
    onSave({ ...form, id: `custom-${Date.now()}` });
  }

  return (
    <div className="sp-add-form">
      <div className="sp-add-form-title">Add custom provider</div>

      <label className="sp-field-label">Provider name</label>
      <input
        ref={nameRef}
        className="sp-input"
        placeholder="e.g. My LLM, RunPod, Together AI"
        value={form.name}
        onChange={(e) => update("name", e.target.value)}
      />

      <label className="sp-field-label">Billing API URL</label>
      <input
        className="sp-input"
        placeholder="https://api.example.com/v1/billing/usage"
        value={form.url}
        onChange={(e) => update("url", e.target.value)}
      />

      <label className="sp-field-label">Auth style</label>
      <select
        className="sp-select"
        value={form.authStyle}
        onChange={(e) => update("authStyle", e.target.value as CustomSpendProvider["authStyle"])}
      >
        <option value="bearer">Authorization: Bearer &lt;key&gt;</option>
        <option value="token">Authorization: Token &lt;key&gt;</option>
        <option value="custom-header">Custom header (e.g. xi-api-key)</option>
        <option value="query-param">Query param (e.g. ?api_key=…)</option>
      </select>

      {form.authStyle === "custom-header" && (
        <>
          <label className="sp-field-label">Header name</label>
          <input
            className="sp-input"
            placeholder="xi-api-key"
            value={form.customHeaderName ?? ""}
            onChange={(e) => update("customHeaderName", e.target.value)}
          />
        </>
      )}

      {form.authStyle === "query-param" && (
        <>
          <label className="sp-field-label">Param name</label>
          <input
            className="sp-input"
            placeholder="api_key"
            value={form.queryParamName ?? ""}
            onChange={(e) => update("queryParamName", e.target.value)}
          />
        </>
      )}

      <label className="sp-field-label">API key to use</label>
      <select
        className="sp-select"
        value={form.keyId}
        onChange={(e) => update("keyId", e.target.value)}
      >
        <option value="">— pick a stored key —</option>
        {storedKeys.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label || k.service} ({k.service})
          </option>
        ))}
      </select>

      <label className="sp-field-label">
        Value path in JSON response
        <span className="sp-field-hint"> e.g. total_usage · data.balance · items.0.amount</span>
      </label>
      <input
        className="sp-input"
        placeholder="total_usage"
        value={form.responsePath}
        onChange={(e) => update("responsePath", e.target.value)}
      />

      <div className="sp-add-row">
        <div className="sp-add-inline">
          <label className="sp-field-label sp-field-label--inline">Divisor</label>
          <input
            className="sp-input sp-input--narrow"
            type="number"
            min={1}
            placeholder="1"
            value={form.divisor ?? 1}
            onChange={(e) => update("divisor", parseFloat(e.target.value) || 1)}
          />
          <span className="sp-field-hint">(100 if API returns cents)</span>
        </div>
        <div className="sp-add-inline">
          <label className="sp-field-label sp-field-label--inline">Period</label>
          <select
            className="sp-select sp-select--narrow"
            value={form.spendPeriod ?? "month"}
            onChange={(e) => update("spendPeriod", e.target.value as "today" | "month")}
          >
            <option value="today">Today</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      {testResult && (
        <div className={`sp-test-result${testResult.startsWith("✅") ? " sp-test-result--ok" : testResult.startsWith("⚠") ? " sp-test-result--warn" : " sp-test-result--err"}`}>
          {testResult}
        </div>
      )}

      <div className="sp-add-actions">
        <button type="button" className="sp-btn-cancel" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="sp-btn-test"
          onClick={() => void handleTest()}
          disabled={!form.keyId || !form.url || testing}
        >
          {testing ? <span className="sp-spinner sp-spinner--sm" /> : "Test"}
        </button>
        <button
          type="button"
          className="sp-btn-save"
          onClick={handleSave}
          disabled={!valid}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History view — 30-day bar chart + monthly totals + all-time
// ---------------------------------------------------------------------------

interface HistoryData {
  entries: SpendDaySummary[];
  allTimeTotal: number;
  since: string | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function HistoryView({ onBack }: { onBack: () => void }): JSX.Element {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [window30, setWindow30] = useState<30 | 90>(30);

  useEffect(() => {
    setLoading(true);
    window.glass.spendHistoryGet(90)
      .then((r) => setData(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Compute bar chart data for selected window
  const chartEntries = data ? data.entries.slice(-(window30)) : [];
  const maxUSD = Math.max(...chartEntries.map((e) => e.totalUSD), 0.01);

  // Monthly breakdown
  const monthlyMap = new Map<string, number>();
  if (data) {
    for (const e of data.entries) {
      const ym = e.date.slice(0, 7);
      monthlyMap.set(ym, Math.max(monthlyMap.get(ym) ?? 0, e.totalUSD));
    }
  }
  const months = Array.from(monthlyMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="sp-panel">
      <div className="sp-header">
        <div className="sp-title">
          <button type="button" className="sp-btn-back" onClick={onBack} title="Back">←</button>
          <span className="sp-title-icon">📊</span>
          Spend History
        </div>
        <div className="sp-header-actions">
          <button
            type="button"
            className={`sp-window-btn${window30 === 30 ? " sp-window-btn--active" : ""}`}
            onClick={() => setWindow30(30)}
          >30d</button>
          <button
            type="button"
            className={`sp-window-btn${window30 === 90 ? " sp-window-btn--active" : ""}`}
            onClick={() => setWindow30(90)}
          >90d</button>
        </div>
      </div>

      <div className="sp-body sp-body--history">
        {loading && (
          <div className="sp-loading">
            <span className="sp-spinner sp-spinner--lg" />
            <span>Loading history…</span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* All-time summary */}
            <div className="sp-alltime">
              <div className="sp-alltime-value">{fmt(data.allTimeTotal)}</div>
              <div className="sp-alltime-label">
                all-time spend
                {data.since && <span className="sp-alltime-since"> since {fmtDate(data.since)}</span>}
              </div>
            </div>

            {/* Bar chart */}
            {chartEntries.length > 0 && chartEntries.some((e) => e.totalUSD > 0) ? (
              <div className="sp-chart">
                <div className="sp-chart-bars">
                  {chartEntries.map((e) => {
                    const pct = (e.totalUSD / maxUSD) * 100;
                    return (
                      <div key={e.date} className="sp-bar-col" title={`${fmtDate(e.date)}: ${fmt(e.totalUSD)}`}>
                        <div
                          className="sp-bar-fill"
                          style={{ height: `${Math.max(pct, e.totalUSD > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="sp-chart-labels">
                  {/* Show first + last label only */}
                  <span>{chartEntries[0] ? fmtDate(chartEntries[0].date) : ""}</span>
                  <span>{chartEntries[chartEntries.length - 1] ? fmtDate(chartEntries[chartEntries.length - 1].date) : ""}</span>
                </div>
              </div>
            ) : (
              <div className="sp-history-empty">
                No spend data yet — history accumulates as you use your keys.
              </div>
            )}

            {/* Monthly table */}
            {months.length > 0 && (
              <div className="sp-monthly">
                <div className="sp-monthly-title">Monthly totals</div>
                <div className="sp-monthly-rows">
                  {months.map(([ym, usd]) => (
                    <div key={ym} className="sp-monthly-row">
                      <span className="sp-monthly-month">{fmtMonth(ym)}</span>
                      <span className="sp-monthly-usd">{fmt(usd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !data && (
          <div className="sp-history-empty">
            No history data available.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function SpendTrackerPanel({
  onClose,
  embedded = false,
}: {
  onClose?: () => void;
  embedded?: boolean;
}): JSX.Element {
  const [view, setView] = useState<"main" | "history">("main");
  const [snapshot, setSnapshot] = useState<SpendSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customProviders, setCustomProviders] = useState<CustomSpendProvider[]>(loadCustomProviders);
  const [storedKeys, setStoredKeys] = useState<ApiKeyMeta[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  if (view === "history") {
    return <HistoryView onBack={() => setView("main")} />;
  }

  // Load stored keys for the Add form dropdown
  useEffect(() => {
    window.glass.apiKeyList().then((r) => setStoredKeys(r.keys ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async (force = false): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const snap = force
        ? await window.glass.spendRefresh()
        : await window.glass.spendGet();
      setSnapshot(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spend data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const handleRefresh = useCallback(() => { void load(true); }, [load]);

  function handleAddCustom(p: CustomSpendProvider): void {
    const updated = [...customProviders, p];
    setCustomProviders(updated);
    saveCustomProviders(updated);
    setShowAddForm(false);
  }

  function handleDeleteCustom(id: string): void {
    const updated = customProviders.filter((p) => p.id !== id);
    setCustomProviders(updated);
    saveCustomProviders(updated);
  }

  const totalToday = snapshot?.totalTodayUSD;
  const totalMonth = snapshot?.totalMonthUSD;
  const refreshedAt = snapshot?.refreshedAt;

  return (
    <div className={`sp-panel${embedded ? " sp-panel--embedded" : ""}`}>
      {!embedded ? (
        <div className="sp-header">
          <div className="sp-title">
            <span className="sp-title-icon">💸</span>
            AI Spend
          </div>
          <div className="sp-header-actions">
            <button
              type="button"
              className="sp-btn-history"
              onClick={() => setView("history")}
              title="View spend history"
            >
              📊
            </button>
            <button
              type="button"
              className="sp-btn-refresh"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh"
            >
              {loading ? <span className="sp-spinner" /> : "↺"}
            </button>
            {onClose ? (
              <button type="button" className="sp-btn-close" onClick={onClose} aria-label="Close">✕</button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="sp-toolbar sp-toolbar--embedded">
          <button
            type="button"
            className="sp-btn-history"
            onClick={() => setView("history")}
            title="View spend history"
          >
            📊 History
          </button>
          <button
            type="button"
            className="sp-btn-refresh"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh"
          >
            {loading ? <span className="sp-spinner" /> : "↺ Refresh"}
          </button>
        </div>
      )}

      {/* Totals bar */}
      {snapshot && (totalToday != null || totalMonth != null) && (
        <div className="sp-totals">
          {totalToday != null && (
            <div className="sp-total-item">
              <span className="sp-total-label">Today</span>
              <span className="sp-total-value">{fmt(totalToday)}</span>
            </div>
          )}
          {totalMonth != null && (
            <div className="sp-total-item">
              <span className="sp-total-label">This period</span>
              <span className="sp-total-value">{fmt(totalMonth)}</span>
            </div>
          )}
          {refreshedAt && <span className="sp-totals-age">{fmtAge(refreshedAt)}</span>}
        </div>
      )}

      {/* Body */}
      <div className="sp-body">
        {!snapshot && loading && (
          <div className="sp-loading">
            <span className="sp-spinner sp-spinner--lg" />
            <span>Fetching provider data…</span>
          </div>
        )}

        {error && <div className="sp-error">{error}</div>}

        {snapshot && (
          <div className="sp-providers">
            {snapshot.providers.map((p) => (
              <ProviderRow key={p.service} provider={p} />
            ))}
            {customProviders.map((p) => (
              <CustomProviderRow key={p.id} provider={p} onDelete={handleDeleteCustom} />
            ))}
          </div>
        )}

        {/* Add custom provider */}
        {showAddForm ? (
          <AddProviderForm
            storedKeys={storedKeys}
            onSave={handleAddCustom}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            type="button"
            className="sp-btn-add"
            onClick={() => setShowAddForm(true)}
          >
            <span className="sp-btn-add-icon">+</span>
            Add custom provider
          </button>
        )}
      </div>

      <div className="sp-footer">
        Any key in API Keys tab appears here · live data where billing API exists · refreshes every 15 min
      </div>
    </div>
  );
}
