import { useCallback, useEffect, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { BLACKHOLE_SETUP_INSTRUCTIONS } from "../../shared/virtualAudioCapture.ts";
import {
  buildSystemAudioSourceOptions,
  isSystemAudioConnected,
  NATIVE_SYSTEM_AUDIO_SOURCE_VALUE,
  resolveSelectedDeviceLabel,
  resolveSystemAudioConfigureHint,
  resolveSystemAudioRowStatus,
  resolveSystemAudioSignalStatus,
  ROUTING_AUDIO_HELP_LINK,
  SYSTEM_AUDIO_SOURCE_LABEL,
} from "../../shared/systemAudioUi.ts";
import { reportVirtualAudioDevices } from "./virtualAudioScan.ts";
import { PanelSection } from "./PanelSection.tsx";
import { SystemAudioLiveMeter } from "./SystemAudioLiveMeter.tsx";

function severityClass(status: string): string {
  if (status === "Ready" || status.endsWith("selected") || status === "BlackHole selected") {
    return "status-dot status-dot--ok";
  }
  if (status === "BlackHole detected") return "status-dot status-dot--warn";
  if (/unavailable|needed|failed|error/i.test(status)) return "status-dot status-dot--warn";
  return "status-dot status-dot--idle";
}

export function SystemAudioConfigure({ className }: { className?: string }): JSX.Element {
  const state = useGlassState();
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | undefined>();
  const [liveTesting, setLiveTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const virtualDevices = state.virtualAudioDevices ?? [];
  const connected = isSystemAudioConnected(state.systemAudioStatus);
  const statusLabel = resolveSystemAudioRowStatus({
    systemAudioStatus: state.systemAudioStatus,
    virtualDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
  });
  const hint = resolveSystemAudioConfigureHint({
    virtualDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
  });
  const sourceOptions = buildSystemAudioSourceOptions(virtualDevices);
  const selectedValue = state.selectedVirtualAudioDeviceId ?? NATIVE_SYSTEM_AUDIO_SOURCE_VALUE;
  const selectedLabel = resolveSelectedDeviceLabel({
    virtualDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
  });
  const signalStatus = resolveSystemAudioSignalStatus(state.systemAudioDetail);
  const sttRow = state.setupCapabilities?.find((row) => row.id === "stt");
  const signalClass =
    signalStatus === "Signal detected"
      ? "system-audio-config__signal--ok"
      : signalStatus === "No signal"
        ? "system-audio-config__signal--warn"
        : "system-audio-config__signal--idle";

  useEffect(() => {
    if (connecting && connected) setConnecting(false);
  }, [connecting, connected]);

  useEffect(() => {
    if (!connecting) return;
    const timer = window.setTimeout(() => setConnecting(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [connecting]);

  const handleLiveTestDone = useCallback(() => {
    setLiveTesting(false);
  }, []);

  const startLiveTest = useCallback(() => {
    setLiveTesting(true);
    send({ type: "clear-last-notice" });
  }, []);

  const stopMeter = useCallback(() => {
    setLiveTesting(false);
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    await reportVirtualAudioDevices();
    send({ type: "connect-system-audio" });
  }, []);

  const handleDetect = useCallback(async () => {
    setScanning(true);
    setScanMessage("Scanning audio inputs…");
    await reportVirtualAudioDevices();
    setScanning(false);
    setScanMessage("Scan complete — open More options to pick a device.");
  }, []);

  return (
    <PanelSection
      title="System audio (YouTube & apps)"
      description="Hears what plays on your Mac — not your microphone."
      className={`system-audio-config system-audio-config--horizontal${className ? ` ${className}` : ""}`}
      testId="glass-system-audio-configure"
    >
      <div className="system-audio-config__status-row">
        <span className={severityClass(statusLabel)} aria-hidden="true" />
        <div className="system-audio-config__summary">
          <strong>{statusLabel}</strong>
          <span className="system-audio-config__device">{selectedLabel}</span>
        </div>
        <span
          className={`system-audio-config__signal ${signalClass}`}
          data-testid="glass-system-audio-signal-badge"
        >
          Signal: {signalStatus}
        </span>
        <button
          type="button"
          className={`gbtn gbtn--primary system-audio-config__connect${connected ? " system-audio-config__connect--ok" : ""}`}
          data-testid="glass-connect-system-audio"
          disabled={connecting}
          onClick={() => void handleConnect()}
        >
          {connecting ? "Connecting…" : connected ? "Reconnect" : "Connect"}
        </button>
      </div>

      <div className="system-audio-config__actions-row">
        <button
          type="button"
          className="gbtn"
          data-testid="glass-test-system-audio-bar"
          disabled={liveTesting}
          onClick={startLiveTest}
        >
          {liveTesting ? "Testing…" : "Test System Audio"}
        </button>
        <button
          type="button"
          className="gbtn"
          data-testid="glass-detect-audio-devices"
          disabled={scanning}
          onClick={() => void handleDetect()}
        >
          {scanning ? "Detecting…" : "Detect Devices"}
        </button>
        <button
          type="button"
          className="gbtn gbtn--ghost system-audio-config__toggle"
          data-testid="glass-system-audio-configure-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Hide options" : "More options"}
        </button>
      </div>

      {hint ? <p className="hint system-audio-config__hint">{hint}</p> : null}
      {!connected && !connecting ? (
        <p className="hint system-audio-config__fallback" data-testid="glass-system-audio-connect-fallback">
          Tap <strong>Connect</strong> to route system audio. If levels stay flat, play audio and use{" "}
          <strong>Test System Audio</strong> for the live meter.
        </p>
      ) : null}
      {scanMessage ? (
        <p className="hint system-audio-config__scan" data-testid="glass-system-audio-scan-message">
          {scanMessage}
        </p>
      ) : null}

      {liveTesting ? (
        <div className="system-audio-config__meter-wrap">
          <SystemAudioLiveMeter
            deviceId={state.selectedVirtualAudioDeviceId}
            onDone={handleLiveTestDone}
            keepMonitoring
          />
          <button
            type="button"
            className="gbtn gbtn--ghost gbtn--small"
            data-testid="glass-stop-system-audio-meter"
            onClick={stopMeter}
          >
            Stop meter
          </button>
        </div>
      ) : null}

      {expanded ? (
        <div className="system-audio-config__drawer" data-testid="glass-system-audio-drawer">
          <label className="system-audio-config__field">
            <span className="system-audio-config__field-label">{SYSTEM_AUDIO_SOURCE_LABEL}</span>
            <select
              className="system-audio-config__select"
              data-testid="glass-system-audio-source-select"
              value={selectedValue}
              onChange={(e) => {
                send({
                  type: "set-selected-virtual-audio-device",
                  deviceId: e.target.value,
                });
              }}
            >
              {sourceOptions.map((option) => (
                <option key={option.value || "native"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <dl className="system-audio-config__meta">
            <div>
              <dt>Device</dt>
              <dd data-testid="glass-system-audio-selected-label">{selectedLabel}</dd>
            </div>
            <div>
              <dt>Signal</dt>
              <dd data-testid="glass-system-audio-signal-status">{signalStatus}</dd>
            </div>
            <div>
              <dt>STT</dt>
              <dd>{sttRow?.label ?? "Unknown"}</dd>
            </div>
          </dl>

          <div className="system-audio-config__actions">
            <button
              type="button"
              className="gbtn gbtn--small"
              data-testid="glass-test-system-audio"
              disabled={liveTesting}
              onClick={startLiveTest}
            >
              Test System Audio
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost system-audio-config__help-link"
              data-testid="glass-system-audio-routing-help"
              onClick={() => setShowHelp((open) => !open)}
            >
              {ROUTING_AUDIO_HELP_LINK}
            </button>
          </div>

          {showHelp ? (
            <pre
              className="system-audio-config__help"
              data-testid="glass-system-audio-routing-help-content"
            >
              {BLACKHOLE_SETUP_INSTRUCTIONS}
            </pre>
          ) : null}
        </div>
      ) : null}
    </PanelSection>
  );
}
