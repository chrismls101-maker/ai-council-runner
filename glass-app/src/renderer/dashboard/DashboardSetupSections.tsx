import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AudioLines,
  ChevronDown,
  Download,
  Eye,
  LayoutPanelLeft,
  Mic,
  Monitor,
  Server,
  Stethoscope,
  Volume2,
} from "lucide-react";
import type { GlassCommand } from "../../shared/ipc.ts";
import type { GlassState } from "../../shared/ipc.ts";
import type { GlassCapabilityRow, GlassSetupActionType } from "../../shared/glassCapabilities.ts";
import { DUPLICATE_APP_WARNING } from "../../shared/glassPackagingVariant.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { connectIivoGlass, isIivoGlassConnected, resolveConnectBlockerMessage } from "../panel/connectIivoGlass.ts";
import { SettingsChoiceCard, SettingsChoiceGrid } from "../settings/SettingsChoiceCard.tsx";
import { StatusGrid } from "../panel/PanelSetupSections.tsx";
import { ApiKeyManagerPanel } from "../builder/ApiKeyManagerPanel.tsx";

type CardStatus = "ok" | "warn" | "idle" | "error";

const CAPABILITY_ORDER: GlassCapabilityRow["id"][] = [
  "server",
  "screenRecording",
  "microphone",
  "systemAudio",
  "vision",
  "stt",
  "windowCapture",
];

function severityToStatus(severity: GlassCapabilityRow["severity"]): CardStatus {
  if (severity === "ok") return "ok";
  if (severity === "warn") return "warn";
  if (severity === "error") return "error";
  return "idle";
}

function sendSetupAction(action: GlassSetupActionType): void {
  if (action === "run-setup-check") {
    send({ type: "run-setup-check", forceCaptureProbe: true });
    return;
  }
  send({ type: action } as GlassCommand);
}

function labelForCapability(id: GlassCapabilityRow["id"]): string {
  switch (id) {
    case "screenRecording":
      return "Screen";
    case "windowCapture":
      return "Windows";
    case "microphone":
      return "Microphone";
    case "systemAudio":
      return "System audio";
    case "vision":
      return "Vision";
    case "stt":
      return "Speech";
    case "server":
      return "Server";
    default:
      return id;
  }
}

function iconForCapability(id: GlassCapabilityRow["id"]): ReactNode {
  const props = { size: 28, strokeWidth: 1.75 };
  switch (id) {
    case "screenRecording":
      return <Monitor {...props} />;
    case "windowCapture":
      return <LayoutPanelLeft {...props} />;
    case "microphone":
      return <Mic {...props} />;
    case "systemAudio":
      return <Volume2 {...props} />;
    case "vision":
      return <Eye {...props} />;
    case "stt":
      return <AudioLines {...props} />;
    case "server":
      return <Server {...props} />;
    default:
      return <Monitor {...props} />;
  }
}

function capabilityPriority(id: GlassCapabilityRow["id"]): number {
  const idx = CAPABILITY_ORDER.indexOf(id);
  return idx === -1 ? 99 : idx;
}

function sortCapabilities(rows: GlassCapabilityRow[]): GlassCapabilityRow[] {
  return [...rows].sort((a, b) => {
    const severityRank = (s: GlassCapabilityRow["severity"]) =>
      s === "error" ? 0 : s === "warn" ? 1 : s === "idle" ? 2 : 3;
    const diff = severityRank(a.severity) - severityRank(b.severity);
    if (diff !== 0) return diff;
    return capabilityPriority(a.id) - capabilityPriority(b.id);
  });
}

function primaryAction(row: GlassCapabilityRow): GlassSetupActionType | undefined {
  if (row.actions?.length) return row.actions[0]!.command;
  return row.actionCommand;
}

function useConnectGlass(): {
  connecting: boolean;
  connected: boolean;
  connectHint: string | undefined;
  connectLabel: string;
  handleConnect: () => void;
} {
  const state = useGlassState();
  const [connecting, setConnecting] = useState(false);
  const [connectHint, setConnectHint] = useState<string | undefined>();
  const connected = isIivoGlassConnected({
    setupCheckSummary: state.setupCheckSummary,
    setupCapabilities: state.setupCapabilities,
    systemAudioStatus: state.systemAudioStatus,
  });

  useEffect(() => {
    if (connecting && connected) {
      setConnecting(false);
      setConnectHint(undefined);
    }
  }, [connecting, connected]);

  useEffect(() => {
    if (!connecting || connected) return;
    const blocker = resolveConnectBlockerMessage({
      setupCheckSummary: state.setupCheckSummary,
      setupCapabilities: state.setupCapabilities,
      systemAudioStatus: state.systemAudioStatus,
    });
    if (blocker) setConnectHint(blocker);
  }, [
    connecting,
    connected,
    state.setupCheckSummary,
    state.setupCapabilities,
    state.systemAudioStatus,
  ]);

  useEffect(() => {
    if (!connecting) return;
    const timer = window.setTimeout(() => {
      setConnecting(false);
      if (!connected) {
        setConnectHint(
          resolveConnectBlockerMessage({
            setupCheckSummary: state.setupCheckSummary,
            setupCapabilities: state.setupCapabilities,
            systemAudioStatus: state.systemAudioStatus,
          }) ??
            "Connect timed out — fix the items marked below, then try again.",
        );
      }
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [
    connecting,
    connected,
    state.setupCheckSummary,
    state.setupCapabilities,
    state.systemAudioStatus,
  ]);

  const handleConnect = useCallback(() => {
    setConnectHint(undefined);
    setConnecting(true);
    void connectIivoGlass();
  }, []);

  const connectLabel = connecting
    ? "CONNECTING IIVO GLASS…"
    : connected
      ? "IIVO GLASS CONNECTED"
      : "CONNECT IIVO GLASS";

  return { connecting, connected, connectHint, connectLabel, handleConnect };
}

/** Full-width hero CTA — pinned below the Setup page title. */
export function ConnectGlassHero(): JSX.Element {
  const { connecting, connected, connectHint, connectLabel, handleConnect } = useConnectGlass();

  return (
    <div className="glass-dashboard__setup-hero" data-testid="glass-setup-connect-hero">
      <button
        type="button"
        className={`gbtn gbtn--connect-glass${connected ? " gbtn--connect-glass--connected" : " gbtn--primary"}${connecting ? " gbtn--connect-glass--busy" : ""}`}
        data-testid="glass-run-setup-check"
        data-connected={connected ? "true" : "false"}
        aria-pressed={connected}
        disabled={connecting}
        onClick={handleConnect}
      >
        <span
          className={`connect-glass__dot ${connected ? "connect-glass__dot--on" : "connect-glass__dot--off"}`}
          aria-hidden="true"
        />
        <span className="connect-glass__label">{connectLabel}</span>
      </button>
      {connectHint && !connected ? (
        <p className="glass-dashboard__setup-connect-hint" data-testid="glass-connect-blocker-hint">
          {connectHint}
        </p>
      ) : null}
    </div>
  );
}

function PermissionsGrid(): JSX.Element {
  const state = useGlassState();
  const rows = useMemo(
    () => sortCapabilities(state.setupCapabilities ?? []),
    [state.setupCapabilities],
  );
  const needsAction = rows.filter((row) => row.severity !== "ok");

  return (
    <section className="glass-settings__block">
      <p className="glass-settings__block-label">Permissions</p>
      <p className="glass-settings__block-sub">
        {needsAction.length === 0
          ? "All required permissions are ready."
          : `${needsAction.length} item${needsAction.length === 1 ? "" : "s"} need attention.`}
      </p>
      <SettingsChoiceGrid className="glass-dashboard__setup-perm-grid">
        {rows.map((row) => {
          const action = primaryAction(row);
          return (
            <div key={row.id} className="glass-dashboard__setup-perm-wrap" data-testid={`glass-setup-row-${row.id}`}>
              <span className={`status-dot status-dot--${row.severity}`} aria-hidden="true" />
              <SettingsChoiceCard
                icon={iconForCapability(row.id)}
                label={labelForCapability(row.id)}
                description={row.label}
                selected={row.severity === "ok"}
                status={severityToStatus(row.severity)}
                onClick={
                  action && row.severity !== "ok"
                    ? () => sendSetupAction(action)
                    : undefined
                }
              />
            </div>
          );
        })}
      </SettingsChoiceGrid>
      {needsAction.length > 0 ? (
        <div className="glass-dashboard__setup-fix-list">
          {needsAction.map((row) => (
            <div key={row.id} className="glass-dashboard__setup-fix-row">
              <span className="glass-dashboard__setup-fix-label">{labelForCapability(row.id)}</span>
              {row.detail ? (
                <span className="glass-dashboard__setup-fix-detail">{row.detail}</span>
              ) : null}
              <div className="glass-dashboard__setup-fix-actions">
                {row.actions?.length
                  ? row.actions.map((action) => (
                      <button
                        key={action.command}
                        type="button"
                        className="gbtn gbtn--small"
                        data-testid={`glass-setup-action-${row.id}-${action.command}`}
                        onClick={() => sendSetupAction(action.command)}
                      >
                        {action.label}
                      </button>
                    ))
                  : row.actionLabel && row.actionCommand ? (
                      <button
                        type="button"
                        className="gbtn gbtn--small"
                        data-testid={`glass-setup-action-${row.id}`}
                        onClick={() => sendSetupAction(row.actionCommand!)}
                      >
                        {row.actionLabel}
                      </button>
                    ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="gbtn gbtn--ghost glass-settings__inline-btn"
        data-testid="glass-run-capture-diagnostics"
        onClick={() => send({ type: "run-capture-diagnostics" })}
      >
        <Stethoscope size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: -2 }} />
        Run capture diagnostics
      </button>
      {state.captureDiagnosticsReport ? (
        <pre className="glass-dashboard__setup-diagnostics" data-testid="glass-capture-diagnostics-report">
          {state.captureDiagnosticsReport.lines.join("\n")}
        </pre>
      ) : null}
    </section>
  );
}

function SystemUpdateBlock(): JSX.Element {
  const { appUpdate, appIdentityReport } = useGlassState();
  const isDev = appIdentityReport?.runningMode === "dev";
  const updateReady =
    appUpdate.phase === "available" ||
    appUpdate.phase === "downloading" ||
    appUpdate.phase === "installing";
  const updateDismissed = appUpdate.phase === "dismissed";

  let status = `v${appUpdate.currentVersion} — up to date`;
  let cardStatus: CardStatus = "ok";
  if (appUpdate.phase === "checking") {
    status = "Checking for updates…";
    cardStatus = "idle";
  } else if (appUpdate.phase === "downloading") {
    status =
      appUpdate.downloadPercent != null && appUpdate.downloadPercent > 0
        ? `Downloading v${appUpdate.latestVersion ?? "update"}… ${Math.round(appUpdate.downloadPercent)}%`
        : `Downloading v${appUpdate.latestVersion ?? "update"}…`;
    cardStatus = "warn";
  } else if (appUpdate.phase === "installing") {
    status = `Installing v${appUpdate.latestVersion ?? "update"}…`;
    cardStatus = "warn";
  } else if (updateReady && appUpdate.latestVersion) {
    status = `v${appUpdate.latestVersion} available`;
    cardStatus = "warn";
  } else if (updateDismissed && appUpdate.latestVersion) {
    status = `v${appUpdate.latestVersion} ready to install`;
    cardStatus = "warn";
  } else if (appUpdate.error) {
    cardStatus = "error";
    status = "Update check failed";
  }

  return (
    <section className="glass-settings__block glass-settings__block--compact" data-testid="glass-setup-system-update">
      <p className="glass-settings__block-label">App version</p>
      <SettingsChoiceGrid className="glass-dashboard__setup-version-grid">
        <SettingsChoiceCard
          icon={<Download size={28} strokeWidth={1.75} />}
          label={isDev ? "Dev build" : "Glass"}
          description={status}
          selected={cardStatus === "ok"}
          status={cardStatus}
          testId="glass-setup-update-card"
        />
      </SettingsChoiceGrid>
      <div className="glass-settings__pill-row glass-dashboard__setup-version-actions">
        <button
          type="button"
          className="glass-settings__pill"
          data-testid="glass-check-for-update"
          onClick={() => send({ type: "glass-update-check" })}
        >
          Check for updates
        </button>
        {updateReady ? (
          <button
            type="button"
            className="glass-settings__pill glass-settings__pill--active"
            data-testid="glass-setup-apply-update"
            onClick={() => send({ type: "glass-update-apply" })}
          >
            Update now
          </button>
        ) : null}
        {updateDismissed ? (
          <button
            type="button"
            className="glass-settings__pill"
            data-testid="glass-setup-show-update"
            onClick={() => send({ type: "glass-update-check" })}
          >
            Show update prompt
          </button>
        ) : null}
      </div>
      {isDev ? (
        <p className="glass-settings__block-hint" data-testid="glass-dev-mode-hint">
          Dev build — restart dev only when main-process code changes.
        </p>
      ) : (
        <p className="glass-settings__block-hint" data-testid="glass-packaged-update-hint">
          Packaged builds download from GitHub and install when you tap <strong>Update now</strong>.
        </p>
      )}
      {appUpdate.error ? (
        <p className="glass-settings__block-hint" data-testid="glass-update-error-inline">
          {appUpdate.error}
        </p>
      ) : null}
    </section>
  );
}

function DuplicateAppNotice(): JSX.Element | null {
  const state = useGlassState();
  if (!state.duplicateAppWarning && (state.duplicateAppBundles?.length ?? 0) <= 1) return null;

  return (
    <section className="glass-dashboard__setup-duplicate-notice" data-testid="glass-duplicate-app-warning">
      <p className="glass-dashboard__setup-duplicate-notice-title">Multiple Glass apps detected</p>
      <p className="glass-settings__block-hint">
        {DUPLICATE_APP_WARNING} Quit or delete extra copies in Applications or old{" "}
        <code>release/</code> folders — only keep the one you launch.
      </p>
      {state.duplicateAppBundles && state.duplicateAppBundles.length > 1 ? (
        <ul className="glass-dashboard__setup-duplicate-notice-list" data-testid="glass-duplicate-app-list">
          {state.duplicateAppBundles.map((bundle) => (
            <li key={bundle.path}>
              {bundle.path}
              {bundle.path === state.appIdentityReport?.bundlePath ? " (running)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AdvancedDetails(): JSX.Element | null {
  const state = useGlassState();
  const [open, setOpen] = useState(false);
  const id = state.appIdentityReport;
  if (!id) return null;

  return (
    <section className="glass-settings__block glass-settings__block--compact">
      <button
        type="button"
        className="glass-dashboard__setup-advanced-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="glass-settings__block-label">Advanced</span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`glass-dashboard__setup-advanced-chevron${open ? " glass-dashboard__setup-advanced-chevron--open" : ""}`}
        />
      </button>
      {open ? (
        <div className="glass-dashboard__setup-advanced-body" data-testid="glass-app-identity">
          <div className="glass-dashboard__setup-identity">
            <div className="glass-dashboard__setup-identity-row">
              <span className="glass-dashboard__setup-identity-key">Mode</span>
              <span>{id.runningMode}</span>
            </div>
            <div className="glass-dashboard__setup-identity-row">
              <span className="glass-dashboard__setup-identity-key">Build</span>
              <span>{id.packagingVariantLabel}</span>
            </div>
            <div className="glass-dashboard__setup-identity-row glass-dashboard__setup-identity-row--path">
              <span className="glass-dashboard__setup-identity-key">Path</span>
              <span>{id.bundlePath ?? id.execPath}</span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type DashboardSetupContentProps = {
  state: GlassState;
};

export function DashboardSetupContent({ state }: DashboardSetupContentProps): JSX.Element {
  return (
    <div className="glass-settings__context glass-dashboard__setup-content" data-testid="glass-panel-setup">
      <DuplicateAppNotice />

      {state.setupCheckSummary ? (
        <p className="glass-dashboard__setup-summary">{state.setupCheckSummary}</p>
      ) : null}

      <PermissionsGrid />

      {/* L3.2 — API Keys always visible in Glass Setup regardless of glass.strip.minimalPublic.
          The flag only hides the strip shortcut; the capability itself is always accessible here. */}
      <section className="glass-settings__block" data-testid="glass-setup-api-keys">
        <p className="glass-settings__block-label">API Keys</p>
        <p className="glass-settings__block-sub">Manage API keys for Claude, OpenAI, and other providers. Keys are stored securely in macOS Keychain.</p>
        <ApiKeyManagerPanel onClose={() => { /* no-op: inline section has no close action */ }} />
      </section>

      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Live session</p>
        <p className="glass-settings__block-sub">Server, capture, audio, and screen context right now.</p>
        <div className="glass-dashboard__setup-health-grid">
          <StatusGrid state={state} />
        </div>
      </section>

      <SystemUpdateBlock />
      <AdvancedDetails />
    </div>
  );
}
