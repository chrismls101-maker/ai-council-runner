import { useCallback, useEffect, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import type { GlassCommand } from "../../shared/ipc.ts";
import type { GlassCapabilityRow, GlassSetupActionType } from "../../shared/glassCapabilities.ts";
import { connectIivoGlass, isIivoGlassConnected } from "./connectIivoGlass.ts";

function severityClass(severity: GlassCapabilityRow["severity"]): string {
  return `status-dot status-dot--${severity}`;
}

function sendSetupAction(action: GlassSetupActionType): void {
  send({ type: action } as GlassCommand);
}

export function SetupSection(): JSX.Element {
  const state = useGlassState();
  const rows = (state.setupCapabilities ?? []).filter((row) => row.id !== "systemAudio");
  const [connecting, setConnecting] = useState(false);
  const connected = isIivoGlassConnected({
    setupCheckSummary: state.setupCheckSummary,
    setupCapabilities: state.setupCapabilities,
    systemAudioStatus: state.systemAudioStatus,
  });

  useEffect(() => {
    if (connecting && connected) setConnecting(false);
  }, [connecting, connected]);

  useEffect(() => {
    if (!connecting) return;
    const timer = window.setTimeout(() => setConnecting(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [connecting]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    await connectIivoGlass();
  }, []);

  const connectLabel = connecting
    ? "CONNECTING IIVO GLASS…"
    : connected
      ? "IIVO GLASS CONNECTED"
      : "CONNECT IIVO GLASS";

  return (
    <div className="setup-section" data-testid="glass-panel-setup">
      <div className="setup-section__connect-row">
        <button
          type="button"
          className={`gbtn gbtn--connect-glass${connected ? " gbtn--connect-glass--connected" : " gbtn--primary"}${connecting ? " gbtn--connect-glass--busy" : ""}`}
          data-testid="glass-run-setup-check"
          data-connected={connected ? "true" : "false"}
          aria-pressed={connected}
          disabled={connecting}
          onClick={() => void handleConnect()}
        >
          <span
            className={`connect-glass__dot ${connected ? "connect-glass__dot--on" : "connect-glass__dot--off"}`}
            aria-hidden="true"
          />
          <span className="connect-glass__label">{connectLabel}</span>
        </button>
      </div>
      <div className="setup-section__head">
        <p className="section-title">Setup</p>
        <div className="setup-section__head-actions">
          <button
            type="button"
            className="gbtn gbtn--small"
            data-testid="glass-run-capture-diagnostics"
            onClick={() => send({ type: "run-capture-diagnostics" })}
          >
            Run Capture Diagnostics
          </button>
        </div>
      </div>
      <AppIdentityPanel />
      <SystemUpdatePanel />
      {state.duplicateAppWarning ? (
        <p className="setup-section__warning" data-testid="glass-duplicate-app-warning">
          {state.duplicateAppWarning}
        </p>
      ) : null}
      {state.setupCheckSummary ? (
        <p className="hint setup-section__summary">{state.setupCheckSummary}</p>
      ) : null}
      {state.captureDiagnosticsReport ? (
        <pre
          className="setup-section__diagnostics"
          data-testid="glass-capture-diagnostics-report"
        >
          {state.captureDiagnosticsReport.lines.join("\n")}
        </pre>
      ) : null}
      <ul className="setup-section__rows">
        {rows.map((row) => (
          <li key={row.id} className="setup-section__row" data-testid={`glass-setup-row-${row.id}`}>
            <span className={severityClass(row.severity)} aria-hidden="true" />
            <div className="setup-section__row-text">
              <strong>{labelForCapability(row.id)}</strong>
              <span className="setup-section__status">{row.label}</span>
              {row.detail ? <span className="setup-section__detail">{row.detail}</span> : null}
            </div>
            {row.actions?.length ? (
              <div className="setup-section__actions">
                {row.actions.map((action) => (
                  <button
                    key={action.command}
                    type="button"
                    className="gbtn gbtn--small"
                    data-testid={`glass-setup-action-${row.id}-${action.command}`}
                    onClick={() => sendSetupAction(action.command)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : row.actionLabel && row.actionCommand ? (
              <button
                type="button"
                className="gbtn gbtn--small"
                data-testid={`glass-setup-action-${row.id}`}
                onClick={() => sendSetupAction(row.actionCommand!)}
              >
                {row.actionLabel}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppIdentityPanel(): JSX.Element | null {
  const state = useGlassState();
  const id = state.appIdentityReport;
  if (!id) return null;
  return (
    <div className="setup-section__identity" data-testid="glass-app-identity">
      <p className="setup-section__identity-title">Running app</p>
      <ul className="setup-section__identity-list">
        <li>
          <strong>Mode:</strong> {id.runningMode} · <strong>Build:</strong> {id.packagingVariantLabel}
        </li>
        <li>
          <strong>Bundle id:</strong> {id.bundleIdentifier ?? "(unknown)"} (expected {id.expectedBundleId})
        </li>
        <li>
          <strong>App path:</strong> <span className="setup-section__path">{id.bundlePath ?? id.execPath}</span>
        </li>
        <li>
          <strong>Privacy list:</strong> {id.privacySettingsLabel}
        </li>
      </ul>
      {state.duplicateAppBundles && state.duplicateAppBundles.length > 1 ? (
        <div className="setup-section__duplicate-bundles" data-testid="glass-duplicate-app-list">
          <strong>Other IIVO Glass.app copies found:</strong>
          <ul>
            {state.duplicateAppBundles.map((bundle) => (
              <li key={bundle.path} className="setup-section__path">
                {bundle.path}
                {bundle.path === id.bundlePath ? " (running)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SystemUpdatePanel(): JSX.Element {
  const { appUpdate, appIdentityReport } = useGlassState();
  const isDev = appIdentityReport?.runningMode === "dev";
  const updateReady =
    appUpdate.phase === "available" ||
    appUpdate.phase === "downloading" ||
    appUpdate.phase === "installing";
  const updateDismissed = appUpdate.phase === "dismissed";

  let status = `v${appUpdate.currentVersion} — up to date`;
  if (appUpdate.phase === "checking") status = "Checking for updates…";
  else if (appUpdate.phase === "downloading") {
    status =
      appUpdate.downloadPercent != null && appUpdate.downloadPercent > 0
        ? `Downloading v${appUpdate.latestVersion ?? "update"}… ${Math.round(appUpdate.downloadPercent)}%`
        : `Downloading v${appUpdate.latestVersion ?? "update"}…`;
  } else if (appUpdate.phase === "installing") {
    status = `Installing v${appUpdate.latestVersion ?? "update"}…`;
  } else if (updateReady && appUpdate.latestVersion) {
    status = `Update available: v${appUpdate.latestVersion}`;
  } else if (updateDismissed && appUpdate.latestVersion) {
    status = `v${appUpdate.latestVersion} ready (dismissed)`;
  } else if (appUpdate.latestVersion && appUpdate.latestVersion !== appUpdate.currentVersion) {
    status = `Latest published: v${appUpdate.latestVersion}`;
  } else if (appUpdate.checkedAt && appUpdate.phase === "idle" && !appUpdate.error) {
    const when = new Date(appUpdate.checkedAt);
    const time = Number.isNaN(when.getTime()) ? null : when.toLocaleTimeString();
    status = time
      ? `v${appUpdate.currentVersion} — up to date (checked ${time})`
      : `v${appUpdate.currentVersion} — up to date`;
  }

  return (
    <div className="setup-section__update" data-testid="glass-setup-system-update">
      <p className="setup-section__identity-title">System update</p>
      {isDev ? (
        <p className="hint setup-section__dev-hint" data-testid="glass-dev-mode-hint">
          Dev build — run <code>npm run glass:dev</code> while coding. Renderer hot-reloads; restart
          dev only when main-process code changes. No DMG rebuild needed on your machine.
        </p>
      ) : (
        <p className="hint setup-section__update-hint" data-testid="glass-packaged-update-hint">
          Installed app — new versions download from GitHub and install when you tap{" "}
          <strong>Update now</strong>. You never need to download or rebuild a DMG yourself.
        </p>
      )}
      {appUpdate.error ? (
        <p className="hint setup-section__update-error" data-testid="glass-update-error-inline">
          {appUpdate.error}
        </p>
      ) : null}
      <p className="hint setup-section__update-status">{status}</p>
      <div className="setup-section__update-actions">
        <button
          type="button"
          className="gbtn gbtn--small"
          data-testid="glass-check-for-update"
          onClick={() => send({ type: "glass-update-check" })}
        >
          Check for updates
        </button>
        {updateReady ? (
          <button
            type="button"
            className="gbtn gbtn--small gbtn--primary"
            data-testid="glass-setup-apply-update"
            onClick={() => send({ type: "glass-update-apply" })}
          >
            Update now
          </button>
        ) : null}
        {updateDismissed ? (
          <button
            type="button"
            className="gbtn gbtn--small"
            data-testid="glass-setup-show-update"
            onClick={() => send({ type: "glass-update-check" })}
          >
            Show update prompt
          </button>
        ) : null}
      </div>
    </div>
  );
}

function labelForCapability(id: GlassCapabilityRow["id"]): string {
  switch (id) {
    case "screenRecording":
      return "Screen Capture";
    case "windowCapture":
      return "Window Capture";
    case "microphone":
      return "Microphone";
    case "systemAudio":
      return "System Audio";
    case "vision":
      return "Vision";
    case "stt":
      return "STT";
    case "server":
      return "Server";
    default:
      return id;
  }
}
