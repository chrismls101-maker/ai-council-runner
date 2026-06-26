import { useEffect, useState } from "react";
import { send } from "../useGlassState.ts";
import type { GlassState } from "../../shared/ipc.ts";
import {
  formatDisplayTargetLabel,
  GLASS_HOTKEY_PRESETS,
  type GlassDisplayTarget,
  type GlassHotkeyPreset,
  type GlassUserSettings,
} from "../../shared/glassSettings.ts";
import { displayAgentOutputFolder } from "../../shared/agentOutputFolder.ts";
import {
  buildPanelStatusCards,
  type PanelStatusCard,
} from "../../shared/panelStatusGrid.ts";

const IS_DEV = process.env.NODE_ENV !== "production";

// ---------- Profile editor ----------

const PERSONA_LABELS: Record<NonNullable<GlassState["persona"]>, string> = {
  developer: "Builder",
  sales: "Closer",
  operator: "Operator",
  writer: "Creator",
  general: "Explorer",
};

export function ProfileEditor({ state }: { state: GlassState }): JSX.Element {
  const profile = state.glassUserProfile;
  const persona = state.persona;
  const [draft, setDraft] = useState({
    name: profile?.name ?? "",
    usualWork: profile?.usualWork ?? "",
    currentFocus: profile?.currentFocus ?? "",
  });
  const [saved, setSaved] = useState(false);

  // Sync from state when profile changes externally
  useEffect(() => {
    setDraft({
      name: profile?.name ?? "",
      usualWork: profile?.usualWork ?? "",
      currentFocus: profile?.currentFocus ?? "",
    });
  }, [profile?.name, profile?.usualWork, profile?.currentFocus]);

  const handleSave = (): void => {
    send({ type: "update-glass-profile", profile: { ...draft, updatedAt: new Date().toISOString() } });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const dirty =
    draft.name !== (profile?.name ?? "") ||
    draft.usualWork !== (profile?.usualWork ?? "") ||
    draft.currentFocus !== (profile?.currentFocus ?? "");

  return (
    <section className="panel-profile-editor" data-testid="glass-panel-profile-section">
      <p className="section-title">Your profile</p>
      <p className="hint">
        IIVO uses these to calibrate responses to your work and context.
      </p>
      <div className="panel-profile-fields">
        <label className="panel-profile-field">
          <span className="panel-profile-label">Name</span>
          <input
            type="text"
            className="panel-profile-input"
            value={draft.name}
            onChange={(e) => { setDraft((d) => ({ ...d, name: e.target.value })); setSaved(false); }}
            placeholder="Your name"
            autoComplete="off"
            data-testid="glass-panel-profile-name"
          />
        </label>
        <label className="panel-profile-field">
          <span className="panel-profile-label">Usual work</span>
          <input
            type="text"
            className="panel-profile-input"
            value={draft.usualWork}
            onChange={(e) => { setDraft((d) => ({ ...d, usualWork: e.target.value })); setSaved(false); }}
            placeholder="e.g. product strategy, engineering, sales"
            autoComplete="off"
            data-testid="glass-panel-profile-work"
          />
        </label>
        <label className="panel-profile-field">
          <span className="panel-profile-label">Current focus</span>
          <input
            type="text"
            className="panel-profile-input"
            value={draft.currentFocus}
            onChange={(e) => { setDraft((d) => ({ ...d, currentFocus: e.target.value })); setSaved(false); }}
            placeholder="What are you working on right now?"
            autoComplete="off"
            data-testid="glass-panel-profile-focus"
          />
        </label>
      </div>
      <div className="panel-profile-actions">
        <button
          type="button"
          className="gbtn gbtn--primary"
          onClick={handleSave}
          disabled={!dirty && !saved}
          data-testid="glass-panel-profile-save"
        >
          Save profile
        </button>
        {saved ? (
          <span className="panel-profile-saved hint" data-testid="glass-panel-profile-saved">
            ✓ Saved
          </span>
        ) : null}
      </div>
      <div className="panel-profile-persona" data-testid="glass-panel-persona-section">
        <p className="panel-profile-label">Persona</p>
        <p className="hint panel-profile-persona-value" data-testid="glass-panel-persona-value">
          {persona ? PERSONA_LABELS[persona] : "Not set — run calibration to load your power stack."}
        </p>
        <button
          type="button"
          className="gbtn panel-profile-recalibrate"
          onClick={() => send({ type: "glass-onboarding-recalibrate" })}
          data-testid="glass-panel-recalibrate-persona"
        >
          Recalibrate persona
        </button>
        <p className="hint panel-profile-recalibrate-hint">
          Re-run the Sorting Hat to update your power stack and persona fit.
        </p>
      </div>
    </section>
  );
}

// ---------- Status / health grid (connection health — no setup UI) ----------
export function StatusGrid({ state }: { state: GlassState }): JSX.Element {
  const diag = state.operationDiagnostics;

  const cards = buildPanelStatusCards({
    sessionStatus: state.session?.status ?? null,
    lastError: state.lastError,
    sttStatus: state.stt.status,
    sttEndpoint: state.stt.endpoint,
    captureStatus: diag.captureStatus,
    capturing: state.privacy.capturing,
    systemAudioStatus: state.systemAudioStatus,
    systemAudioDetail: state.systemAudioDetail,
    windowContextStatus: state.windowContext.status,
    listening: state.privacy.listening,
    screenContext: state.screenContextStatus,
    visualAskPayload: state.visualAskPayloadDiagnostics,
    visualAskDiagnostics: state.visualAskDiagnostics,
    setupCapabilities: state.setupCapabilities,
    transcriptionMode: state.transcriptionMode,
  });

  return (
    <div className="status-grid status-grid--dashboard" data-testid="glass-panel-status-grid">
      <div className="summary-box status-grid__cells">
        {cards.map((card) => (
          <StatusGridCell key={card.key} card={card} />
        ))}
      </div>
      {diag.displayInfo ? (
        <p className="hint panel__display-diag">{diag.displayInfo}</p>
      ) : null}
    </div>
  );
}

export function StatusGridCell({ card }: { card: PanelStatusCard }): JSX.Element {
  return (
    <div
      className="status-grid__cell"
      data-testid={`glass-panel-status-${card.key}`}
    >
      <div className="status-grid__cell-head">
        <span className={`status-dot status-dot--${card.level}`} aria-hidden="true" />
        <strong>{card.label}</strong>
      </div>
      <div>{card.status}</div>
      {card.detail ? <div className="status-grid__detail">{card.detail}</div> : null}
    </div>
  );
}

export function AgentSettings({ state }: { state: GlassState }): JSX.Element {
  const outputFolder = displayAgentOutputFolder(state.glassSettings);
  const workspace = state.glassSettings.agentCodeWorkspaceRoot?.trim();
  const indexState = state.indexState;
  const indexLabel = (() => {
    if (!workspace) return "Set a project folder first";
    if (indexState?.status === "indexing" && indexState.progress) {
      const p = indexState.progress;
      if (p.phase === "pulling") {
        return p.detail ? `Pulling model — ${p.detail}` : "Pulling embedding model…";
      }
      if (p.total > 0) {
        return `Indexing (${p.indexed}/${p.total} embedded)`;
      }
      return "Indexing…";
    }
    if (indexState?.status === "ready" && indexState.fileCount != null) {
      return `Ready — ${indexState.fileCount} files`;
    }
    if (indexState?.status === "error") return indexState.error ?? "Index error";
    if (state.ollamaAvailable === false) return "Ollama not running";
    return "Not indexed";
  })();

  const patchCoderSettings = (
    patch: Partial<Pick<
      GlassUserSettings,
      | "indexEnabled"
      | "indexAutoOnOpen"
      | "screenContextEnabled"
      | "voiceCoderEnabled"
      | "coderAutoVerify"
      | "coderAutoReview"
    >>,
  ): void => {
    send({ type: "set-glass-coder-settings", patch });
  };

  const memoryStatus = state.projectMemoryState?.status;

  return (
    <div className="summary-box panel__settings" data-testid="glass-panel-agent-settings">
      <p className="section-title">Glass Agents</p>
      <p className="hint">
        Agent reports save to your output folder. For Code Analyst, the project folder is where it
        starts browsing your code (usually your repo root).
      </p>
      <label className="panel__settings-row">
        <span>Output folder</span>
        <button
          type="button"
          className="gbtn gbtn--ghost panel__agent-path-btn"
          onClick={() => void window.glass.agentPickOutputFolder()}
        >
          {outputFolder}
        </button>
      </label>
      <label className="panel__settings-row">
        <span>Code project folder</span>
        <button
          type="button"
          className="gbtn gbtn--ghost panel__agent-path-btn"
          onClick={() => void window.glass.agentPickWorkspaceRoot()}
        >
          {workspace || "Choose folder…"}
        </button>
      </label>

      <p className="section-title panel__settings-subtitle">Codebase index</p>
      <p className="hint">
        Uses Ollama ({`nomic-embed-text`}) running locally — free, offline.
        {state.ollamaAvailable === false
          ? " Start Ollama to enable semantic search; Glass Coder falls back to file search."
          : ""}
      </p>
      <p className="hint">
        Screen-aware context captures your display and sends a screenshot to Claude Haiku
        to detect the active editor file. Requires Screen Recording permission and an Anthropic API key.
      </p>
      <label className="panel__settings-row">
        <span>Index status</span>
        <span className="panel__settings-value">{indexLabel}</span>
      </label>
      <div className="panel__settings-row panel__settings-row--actions">
        <button
          type="button"
          className="gbtn gbtn--ghost"
          disabled={!workspace || indexState?.status === "indexing"}
          onClick={() => workspace && void window.glass.indexStart(workspace)}
        >
          Index now
        </button>
      </div>
      <div className="panel__settings-row panel__settings-row--actions">
        <div>
          <div className="panel__settings-row-label">Project Memory</div>
          <p className="hint">
            Generates <code>GLASS_CONTEXT.md</code> in your project folder (not part of the Glass app).
            Glass Coder reads that file on every run. Re-generate when architecture changes.
          </p>
        </div>
        <button
          type="button"
          className="gbtn gbtn--ghost"
          disabled={!workspace}
          onClick={() => {
            if (memoryStatus === "generating") {
              window.glass.cancelProjectMemory();
            } else {
              void window.glass.generateProjectMemory();
            }
          }}
        >
          {memoryStatus === "generating"
            ? "Cancel"
            : memoryStatus === "done"
              ? "Regenerate"
              : "Generate"}
        </button>
      </div>
      {memoryStatus === "generating" ? (
        <p className="hint">Generating GLASS_CONTEXT.md in your project folder…</p>
      ) : null}
      {memoryStatus === "done" ? (
        <p className="hint">✓ GLASS_CONTEXT.md saved in your project folder</p>
      ) : null}
      {memoryStatus === "error" ? (
        <p className="hint panel__settings-error">
          ✗ {state.projectMemoryState?.error ?? "Generation failed"}
        </p>
      ) : null}
      <label className="panel__settings-row panel__settings-row--checkbox">
        <input
          type="checkbox"
          checked={state.glassSettings.indexEnabled !== false}
          onChange={(e) => patchCoderSettings({ indexEnabled: e.target.checked })}
        />
        <span>Enable semantic index</span>
      </label>
      <label className="panel__settings-row panel__settings-row--checkbox">
        <input
          type="checkbox"
          checked={state.glassSettings.indexAutoOnOpen !== false}
          onChange={(e) => patchCoderSettings({ indexAutoOnOpen: e.target.checked })}
        />
        <span>Auto-index on project open</span>
      </label>
      <label className="panel__settings-row panel__settings-row--checkbox">
        <input
          type="checkbox"
          checked={state.glassSettings.screenContextEnabled !== false}
          onChange={(e) => patchCoderSettings({ screenContextEnabled: e.target.checked })}
        />
        <span>Screen-aware context</span>
      </label>
      <label className="panel__settings-row panel__settings-row--checkbox">
        <input
          type="checkbox"
          checked={state.glassSettings.voiceCoderEnabled !== false}
          onChange={(e) => patchCoderSettings({ voiceCoderEnabled: e.target.checked })}
        />
        <span>Voice → Glass Coder</span>
      </label>
      <label className="panel__settings-row panel__settings-row--checkbox">
        <input
          type="checkbox"
          checked={state.glassSettings.coderAutoVerify !== false}
          onChange={(e) => patchCoderSettings({ coderAutoVerify: e.target.checked })}
        />
        <span>Auto-verify after apply</span>
      </label>
      <label className="panel__settings-row panel__settings-row--checkbox">
        <input
          type="checkbox"
          checked={state.glassSettings.coderAutoReview !== false}
          onChange={(e) => patchCoderSettings({ coderAutoReview: e.target.checked })}
        />
        <span>Auto-review after verify</span>
      </label>
    </div>
  );
}

export function GlassLayoutSettings({ state }: { state: GlassState }): JSX.Element {
  const settings = state.glassSettings;
  const connected = state.connectedDisplays.length
    ? state.connectedDisplays
    : state.availableDisplayIds.map((id, index) => ({
        id,
        label: `Display ${index + 1}`,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        workArea: { x: 0, y: 0, width: 0, height: 0 },
        scaleFactor: 1,
        isPrimary: index === 0,
        cursorInside: false,
      }));

  const hotkeyOptions = (Object.keys(GLASS_HOTKEY_PRESETS) as GlassHotkeyPreset[]).map((preset) => ({
    preset,
    label: GLASS_HOTKEY_PRESETS[preset].label,
  }));

  const displayOptions: { target: GlassDisplayTarget; label: string; disabled?: boolean }[] = [
    { target: "primary", label: "Primary Display" },
    ...connected
      .filter((display) => !display.isPrimary)
      .map((display) => ({
        target: display.id as GlassDisplayTarget,
        label: display.label,
      })),
    { target: "follow_mouse", label: "Follow Mouse" },
    {
      target: "all_displays",
      label: "All Displays Overlay (coming soon)",
      disabled: true,
    },
  ];

  const activeDisplay =
    connected.find((d) => d.cursorInside)?.label ??
    connected.find((d) =>
      typeof settings.displayTarget === "number" ? d.id === settings.displayTarget : d.isPrimary,
    )?.label ??
    formatDisplayTargetLabel(settings.displayTarget, state.availableDisplayIds);

  return (
    <div className="summary-box panel__settings">
      <p className="section-title">Glass layout</p>
      <p className="hint">
        Glass is on {formatDisplayTargetLabel(settings.displayTarget, state.availableDisplayIds)}.
        {connected.length > 1 ? ` Cursor on ${activeDisplay}.` : ""} Command bar hotkey:{" "}
        {state.operationDiagnostics.hotkeyStatus ?? "—"}
      </p>
      <label className="panel__settings-row">
        <span>Command bar hotkey</span>
        <select
          value={settings.hotkeyPreset}
          onChange={(e) =>
            send({ type: "set-glass-hotkey", preset: e.target.value as GlassHotkeyPreset })
          }
        >
          {hotkeyOptions.map((opt) => (
            <option key={opt.preset} value={opt.preset}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="panel__settings-row">
        <span>Glass Display</span>
        <select
          data-testid="glass-display-select"
          value={
            typeof settings.displayTarget === "number"
              ? String(settings.displayTarget)
              : settings.displayTarget
          }
          onChange={(e) => {
            const value = e.target.value;
            if (value === "all_displays") return;
            const target: GlassDisplayTarget =
              value === "primary" || value === "follow_mouse" ? value : Number(value);
            send({ type: "set-glass-display", target });
          }}
        >
          {displayOptions.map((opt) => (
            <option
              key={String(opt.target)}
              value={typeof opt.target === "number" ? String(opt.target) : opt.target}
              disabled={opt.disabled}
            >
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {connected.length > 1 ? (
        <p className="hint panel__display-list">
          {connected.length} connected displays — select HDMI / external display to move Glass off
          the MacBook screen.
        </p>
      ) : null}
      <button type="button" className="gbtn gbtn--ghost" onClick={() => send({ type: "refresh-glass-layout" })}>
        Refresh display layout
      </button>
      <p className="section-title panel__settings-dock">Dock</p>
      <label className="panel__settings-row panel__settings-row--check">
        <input
          type="checkbox"
          data-testid="glass-dock-lock-toggle"
          checked={settings.chromeLayoutLocked !== false}
          onChange={(e) => send({ type: "set-chrome-layout-locked", locked: e.target.checked })}
        />
        <span>Lock dock position</span>
      </label>
      <p className="hint">
        Uncheck to drag the dock to a new spot, then re-lock it.
      </p>
      <label className="panel__settings-row">
        <span>Dock placement</span>
        <select
          data-testid="glass-dock-placement-select"
          value={settings.dockPlacement ?? "left-rail"}
          onChange={(e) =>
            send({
              type: "set-dock-placement",
              placement: e.target.value as "top" | "left-rail",
            })
          }
        >
          <option value="left-rail">Left icon rail</option>
          <option value="top">Top pill</option>
        </select>
      </label>
      {(settings.dockPlacement ?? "left-rail") === "top" ? (
        <label className="panel__settings-row">
          <span>Dock orientation</span>
          <select
            data-testid="glass-dock-orientation-select"
            value={settings.dockOrientation ?? "horizontal"}
            onChange={(e) =>
              send({
                type: "set-dock-orientation",
                orientation: e.target.value as "horizontal" | "vertical",
              })
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </label>
      ) : null}
      <p className="section-title panel__settings-privacy">Screen capture privacy</p>
      <label className="panel__settings-row panel__settings-row--check">
        <input
          type="checkbox"
          checked={settings.saveVisualAsksToSession !== false}
          onChange={(e) => send({ type: "set-save-visual-asks-to-session", enabled: e.target.checked })}
        />
        <span>Save visual asks to session</span>
      </label>
      <label className="panel__settings-row panel__settings-row--check">
        <input
          type="checkbox"
          checked={settings.autoUploadCapturesToContext === true}
          onChange={(e) =>
            send({ type: "set-auto-upload-captures-to-context", enabled: e.target.checked })
          }
        />
        <span>Auto-upload captures to IIVO Context</span>
      </label>
      <p className="hint">
        Visual asks always send the image to IIVO for that answer only. Context Bridge upload
        happens when you Open in IIVO, Save screen, or enable auto-upload above.
      </p>
    </div>
  );
}

export function ServerUrlEditor({ state }: { state: GlassState }): JSX.Element {
  const [apiUrl, setApiUrl] = useState(state.iivoApiUrl);
  const [webUrl, setWebUrl] = useState(state.iivoWebUrl);
  const [saved, setSaved] = useState(false);

  // Sync from state on external change (e.g. another window, IPC round-trip).
  useEffect(() => {
    setApiUrl(state.iivoApiUrl);
    setWebUrl(state.iivoWebUrl);
  }, [state.iivoApiUrl, state.iivoWebUrl]);

  const dirty = apiUrl !== state.iivoApiUrl || webUrl !== state.iivoWebUrl;

  const handleSave = () => {
    send({ type: "set-glass-server-urls", apiUrl, webUrl });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="summary-box panel__settings panel__server-urls" data-testid="glass-panel-server-url-editor">
      <p className="section-title">Server URLs</p>
      <p className="hint">
        Override the default IIVO API and web app URLs (e.g. for a self-hosted instance).
        Leave blank to use the built-in defaults.
      </p>
      <label className="panel__settings-row">
        <span>API URL</span>
        <input
          type="text"
          className="panel__settings-input"
          data-testid="glass-panel-server-url-api"
          placeholder="https://api.iivo.ai"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <label className="panel__settings-row">
        <span>Web URL</span>
        <input
          type="text"
          className="panel__settings-input"
          data-testid="glass-panel-server-url-web"
          placeholder="https://app.iivo.ai"
          value={webUrl}
          onChange={(e) => setWebUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        className="gbtn gbtn--ghost"
        data-testid="glass-panel-server-url-save"
        disabled={!dirty}
        onClick={handleSave}
      >
        {saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
