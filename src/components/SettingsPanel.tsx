import { useState } from "react";
import Collapsible from "./Collapsible";
import ProviderDisclosureTable from "./ProviderDisclosureTable";
import PublicReadinessChecklist from "./PublicReadinessChecklist";
import RoutingTestMatrix from "./RoutingTestMatrix";
import UsageCreditsPanel from "./UsageCreditsPanel";
import {
  DATA_USE_STATEMENT,
  SENSITIVE_DATA_GUIDANCE,
} from "../constants/providerDisclosure";
import { BETA_STORAGE_NOTE, BETA_WORKSPACE_LABEL } from "../constants/publicMessages";
import type { RoutingTestCase } from "../constants/routingTestMatrix";
import { downloadJson } from "../utils/downloadJson";
import { withIivoWordmark } from "../utils/brandText";
import { resetOnboarding } from "../utils/onboarding";
import { memoryDisplayTitle } from "../types/memory";
import type { AppSettings } from "../types/settings";
import type { Memory } from "../types/memory";

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  selectedMemoryIds: string[];
  onSelectedMemoryIdsChange: (ids: string[]) => void;
  allMemories: Memory[];
  onOpenMemoryVault: () => void;
  onRefreshMemories: () => void;
  onRefreshHistory: () => void;
  onFeedback: (message: string) => void;
  onRunRoutingTest?: (test: RoutingTestCase) => void;
  onUsageChange?: (usage: import("../types/usage").UsageSummaryResponse) => void;
  onResetOnboarding?: () => void;
  onClearSelectedPreset?: () => void;
  selectedPresetId?: string;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`settings-toggle-row${disabled ? " is-disabled" : ""}`}>
      <div className="settings-toggle-copy">
        <strong>{label}</strong>
        <span className="muted">{description}</span>
      </div>
      <div className="settings-toggle-control">
        <span className="settings-toggle-state">{checked ? "On" : "Off"}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    </label>
  );
}

async function postAudit(eventType: string, metadata?: string): Promise<void> {
  try {
    await fetch("/api/audit/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, metadata }),
    });
  } catch {
    /* audit must not block settings */
  }
}

export default function SettingsPanel({
  settings,
  onSettingsChange,
  selectedMemoryIds,
  onSelectedMemoryIdsChange,
  allMemories,
  onOpenMemoryVault,
  onRefreshMemories,
  onRefreshHistory,
  onFeedback,
  onRunRoutingTest,
  onUsageChange,
  onResetOnboarding,
  onClearSelectedPreset,
  selectedPresetId = "none",
}: SettingsPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const updateSettings = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    onSettingsChange(next);
    void postAudit("settings_updated", Object.keys(patch).join(", "));
  };

  const runExport = async (kind: "history" | "memory" | "audit") => {
    setBusy(`export-${kind}`);
    try {
      const res = await fetch(`/api/export/${kind}`, { method: "POST" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`iivo-${kind}-${stamp}.json`, data);
      onFeedback(`Exported ${kind.replace("_", " ")}`);
    } catch {
      onFeedback("Export failed");
    } finally {
      setBusy(null);
    }
  };

  const runDelete = async (
    kind: "history" | "memory" | "audit",
    confirmMessage: string,
  ) => {
    if (!window.confirm(confirmMessage)) return;
    setBusy(`delete-${kind}`);
    try {
      const path =
        kind === "history" ? "/api/history/all" : kind === "memory" ? "/api/memory/all" : "/api/audit";
      const res = await fetch(path, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (kind === "history") onRefreshHistory();
      if (kind === "memory") onRefreshMemories();
      onFeedback(
        kind === "history"
          ? "All run history deleted"
          : kind === "memory"
            ? "All memory deleted"
            : "Audit log deleted",
      );
    } catch {
      onFeedback("Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const showManualPicker =
    settings.useMemoryInResponses && !settings.autoIncludeRelevantMemory;

  return (
    <div className="settings-panel">
      <header className="panel-page-header">
        <h1>Settings</h1>
        <p className="panel-page-subtitle">
          {withIivoWordmark(
            "Control memory, data, and how IIVO uses your workspace information.",
            "settings-subtitle",
          )}
        </p>
        <p className="beta-workspace-label" data-testid="beta-workspace-label">
          {BETA_WORKSPACE_LABEL}
        </p>
        <p className="beta-storage-note muted">{BETA_STORAGE_NOTE}</p>
      </header>

      <UsageCreditsPanel onFeedback={onFeedback} onUsageChange={onUsageChange} />

      <section className="panel-section" data-testid="workspace-context-section">
        <h2>Workspace context</h2>
        <p className="settings-section-intro muted">
          Project presets inject scenario context into runs. Daily use should stay on{" "}
          <strong>No preset</strong> unless you are testing a specific product scenario.
        </p>
        <p className="settings-note muted" data-testid="settings-active-preset">
          Active preset:{" "}
          {selectedPresetId === "none"
            ? "No preset (neutral)"
            : selectedPresetId === "ai-front-desk-sales-test"
              ? "AI Front Desk Sales Test"
              : selectedPresetId}
        </p>
        {onClearSelectedPreset && (
          <button
            type="button"
            className="btn ghost small"
            data-testid="clear-selected-preset-btn"
            onClick={() => onClearSelectedPreset()}
          >
            Clear selected preset
          </button>
        )}
      </section>

      <section className="panel-section">
        <h2>Memory Settings</h2>
        <p className="settings-section-intro muted">
          {withIivoWordmark(
            "Memory helps IIVO reuse saved project facts, decisions, and outcomes when relevant. Turn memory off anytime, or edit, export, and delete entries from Memory Vault. IIVO should not assume old outcomes are proof unless marked worked.",
            "settings-memory-intro",
          )}
        </p>
        <div
          className={`memory-status-badge${settings.useMemoryInResponses ? " is-on" : " is-off"}`}
          data-testid="memory-status-badge"
        >
          Memory: {settings.useMemoryInResponses ? "On" : "Off"}
          {settings.useMemoryInResponses &&
            (settings.autoIncludeRelevantMemory ? " · Auto-include" : " · Manual selection")}
        </div>
        <div className="settings-toggle-list">
          <ToggleRow
            label="Use Memory in responses"
            description="When off, no memory is injected into runs."
            checked={settings.useMemoryInResponses}
            onChange={(v) => updateSettings({ useMemoryInResponses: v })}
          />
          <ToggleRow
            label="Auto-include relevant memory"
            description="When off, only manually selected memories are included."
            checked={settings.autoIncludeRelevantMemory}
            disabled={!settings.useMemoryInResponses}
            onChange={(v) => updateSettings({ autoIncludeRelevantMemory: v })}
          />
          {!settings.useMemoryInResponses && (
            <p className="settings-note muted">
              Memory is off. Saved memories will not be used in runs until turned back on.
            </p>
          )}
          {settings.useMemoryInResponses && !settings.autoIncludeRelevantMemory && (
            <p className="settings-note muted">
              Auto-include is off. Select memories below to include in the next run.
            </p>
          )}
          <ToggleRow
            label="Suggested Memory"
            description="Show memory suggestions after council runs."
            checked={settings.suggestedMemory}
            onChange={(v) => updateSettings({ suggestedMemory: v })}
          />
        </div>

        {showManualPicker && (
          <div className="settings-manual-memory">
            <h3>Memories to include</h3>
            {allMemories.length === 0 ? (
              <p className="muted">No memories saved yet.</p>
            ) : (
              <ul className="settings-memory-list">
                {allMemories.map((memory) => (
                  <li key={memory.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedMemoryIds.includes(memory.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onSelectedMemoryIdsChange([...selectedMemoryIds, memory.id]);
                          } else {
                            onSelectedMemoryIdsChange(
                              selectedMemoryIds.filter((id) => id !== memory.id),
                            );
                          }
                        }}
                      />
                      <span>{memoryDisplayTitle(memory)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button type="button" className="btn ghost small" onClick={onOpenMemoryVault}>
          Open Memory Vault
        </button>
      </section>

      <section className="panel-section">
        <h2>Data Controls</h2>
        <div className="settings-action-grid">
          <button
            type="button"
            className="btn ghost"
            disabled={busy !== null}
            onClick={() => runExport("history")}
          >
            {busy === "export-history" ? "Exporting…" : "Export run history"}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy !== null}
            onClick={() => runExport("memory")}
          >
            {busy === "export-memory" ? "Exporting…" : "Export memory"}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy !== null}
            onClick={() => runExport("audit")}
          >
            {busy === "export-audit" ? "Exporting…" : "Export audit log"}
          </button>
          <button
            type="button"
            className="btn danger ghost"
            disabled={busy !== null}
            onClick={() =>
              runDelete(
                "history",
                "Delete all run history? This cannot be undone.",
              )
            }
          >
            Delete all run history
          </button>
          <button
            type="button"
            className="btn danger ghost"
            disabled={busy !== null}
            onClick={() =>
              runDelete(
                "memory",
                "Delete all memory? IIVO will no longer use saved memory until new memories are added.",
              )
            }
          >
            Delete all memory
          </button>
          <button
            type="button"
            className="btn danger ghost"
            disabled={busy !== null}
            onClick={() =>
              runDelete("audit", "Delete audit log? This cannot be undone.")
            }
          >
            Delete audit log
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h2>Onboarding</h2>
        <p className="muted">Reset the first-run onboarding flow for testing.</p>
        <button
          type="button"
          className="btn ghost small"
          data-testid="reset-onboarding-btn"
          onClick={() => {
            resetOnboarding();
            onResetOnboarding?.();
            onFeedback("Onboarding reset — reload or start a new session to see it again.");
          }}
        >
          Reset onboarding
        </button>
      </section>

      <PublicReadinessChecklist />

      <section className="panel-section" data-testid="provider-disclosure-section">
        <h2>Provider Disclosure</h2>
        <ProviderDisclosureTable />
      </section>

      <section className="panel-section">
        <h2>Data Use</h2>
        <p className="panel-statement">{withIivoWordmark(DATA_USE_STATEMENT, "settings-data-use")}</p>
      </section>

      <section className="panel-section">
        <h2>Sensitive Data Guidance</h2>
        <p className="panel-guidance">{SENSITIVE_DATA_GUIDANCE}</p>
      </section>

      {onRunRoutingTest && (
        <section className="panel-section routing-test-section">
          <Collapsible title="Routing Test Matrix" badge="Dev">
            <RoutingTestMatrix onRunTest={onRunRoutingTest} />
          </Collapsible>
        </section>
      )}
    </div>
  );
}
