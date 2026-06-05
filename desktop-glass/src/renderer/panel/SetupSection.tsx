import { useCallback } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import type { GlassCommand } from "../../shared/ipc.ts";
import type { GlassCapabilityRow, GlassSetupActionType } from "../../shared/glassCapabilities.ts";
import { mapPermissionsApiToMic } from "../../shared/glassCapabilities.ts";
import { formatVirtualAudioDeviceOption } from "../../shared/virtualAudioDevices.ts";
import { BLACKHOLE_NOT_DETECTED_GUIDANCE } from "../../shared/virtualAudioCapture.ts";
import { reportVirtualAudioDevices } from "./virtualAudioScan.ts";

function severityClass(severity: GlassCapabilityRow["severity"]): string {
  return `status-dot status-dot--${severity}`;
}

function sendSetupAction(action: GlassSetupActionType): void {
  send({ type: action } as GlassCommand);
}

async function queryMicPermissionWithoutPrompt(): Promise<void> {
  if (!navigator.permissions?.query) return;
  try {
    const result = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    send({
      type: "report-mic-permission",
      status: mapPermissionsApiToMic(result.state),
    });
  } catch {
    /* Permissions API unavailable */
  }
}

export function SetupSection(): JSX.Element {
  const state = useGlassState();
  const rows = state.setupCapabilities ?? [];

  const runSetupCheck = useCallback(async () => {
    await queryMicPermissionWithoutPrompt();
    await reportVirtualAudioDevices();
    send({ type: "run-setup-check" });
  }, []);

  return (
    <div className="setup-section" data-testid="glass-panel-setup">
      <div className="setup-section__head">
        <p className="section-title">Setup</p>
        <div className="setup-section__head-actions">
          <button type="button" className="gbtn gbtn--small" onClick={() => void runSetupCheck()}>
            Run Setup Check
          </button>
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
      <VirtualAudioDevicePanel />
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

function VirtualAudioDevicePanel(): JSX.Element | null {
  const state = useGlassState();
  if (state.systemAudioStatus !== "requires_virtual_device") return null;

  const devices = state.virtualAudioDevices ?? [];
  const selectedId = state.selectedVirtualAudioDeviceId ?? "";

  if (devices.length === 0) {
    return (
      <div
        className="setup-section__virtual-audio"
        data-testid="glass-virtual-audio-setup"
      >
        <p className="setup-section__virtual-audio-title">Virtual audio setup</p>
        <p className="hint setup-section__virtual-audio-hint">{BLACKHOLE_NOT_DETECTED_GUIDANCE}</p>
        <button
          type="button"
          className="gbtn gbtn--small"
          data-testid="glass-detect-audio-devices"
          onClick={() => send({ type: "detect-audio-devices" })}
        >
          Detect Audio Devices
        </button>
      </div>
    );
  }

  return (
    <div
      className="setup-section__virtual-audio"
      data-testid="glass-virtual-audio-selector"
    >
      <p className="setup-section__virtual-audio-title">Virtual audio device</p>
      <p className="hint setup-section__virtual-audio-hint">
        {devices.some((d) => d.kind === "blackhole")
          ? "BlackHole detected — select it for system audio."
          : "Virtual audio device detected — select it for system audio."}
      </p>
      <label className="setup-section__virtual-audio-label">
        <span className="sr-only">Virtual audio input</span>
        <select
          className="setup-section__virtual-audio-select"
          data-testid="glass-virtual-audio-select"
          value={selectedId}
          onChange={(e) => {
            send({ type: "set-selected-virtual-audio-device", deviceId: e.target.value });
          }}
        >
          <option value="">Choose a device…</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {formatVirtualAudioDeviceOption(device)}
            </option>
          ))}
        </select>
      </label>
      <div className="setup-section__virtual-audio-actions">
        <button
          type="button"
          className="gbtn gbtn--small"
          data-testid="glass-detect-audio-devices"
          onClick={() => send({ type: "detect-audio-devices" })}
        >
          Detect Audio Devices
        </button>
        <button
          type="button"
          className="gbtn gbtn--small"
          data-testid="glass-test-blackhole"
          onClick={() => send({ type: "test-blackhole" })}
        >
          Test BlackHole
        </button>
      </div>
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
