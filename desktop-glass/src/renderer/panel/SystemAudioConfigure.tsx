import { useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import {
  BLACKHOLE_SETUP_INSTRUCTIONS,
} from "../../shared/virtualAudioCapture.ts";
import {
  buildSystemAudioSourceOptions,
  NATIVE_SYSTEM_AUDIO_SOURCE_VALUE,
  resolveSelectedDeviceLabel,
  resolveSystemAudioConfigureHint,
  resolveSystemAudioRowStatus,
  resolveSystemAudioSignalStatus,
  ROUTING_AUDIO_HELP_LINK,
  SYSTEM_AUDIO_SOURCE_LABEL,
} from "../../shared/systemAudioUi.ts";

function severityClass(status: string): string {
  if (status === "Ready" || status.endsWith("selected")) return "status-dot status-dot--ok";
  if (status === "BlackHole detected") return "status-dot status-dot--warn";
  if (/unavailable|needed|failed|error/i.test(status)) return "status-dot status-dot--warn";
  return "status-dot status-dot--idle";
}

export function SystemAudioConfigure(): JSX.Element {
  const state = useGlassState();
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const virtualDevices = state.virtualAudioDevices ?? [];
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

  return (
    <div className="system-audio-config" data-testid="glass-system-audio-configure">
      <div className="system-audio-config__row">
        <span className={severityClass(statusLabel)} aria-hidden="true" />
        <div className="system-audio-config__summary">
          <strong>System Audio</strong>
          <span className="system-audio-config__status">{statusLabel}</span>
          {hint && !expanded ? (
            <span className="hint system-audio-config__hint">{hint}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="gbtn gbtn--small"
          data-testid="glass-system-audio-configure-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          Configure
        </button>
      </div>

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

          {hint ? <p className="hint system-audio-config__hint">{hint}</p> : null}

          <dl className="system-audio-config__meta">
            <div>
              <dt>Selected device</dt>
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
              data-testid="glass-detect-audio-devices"
              onClick={() => send({ type: "detect-audio-devices" })}
            >
              Detect Audio Devices
            </button>
            <button
              type="button"
              className="gbtn gbtn--small"
              data-testid="glass-test-system-audio"
              onClick={() => send({ type: "test-system-audio" })}
            >
              Test System Audio
            </button>
          </div>

          <button
            type="button"
            className="system-audio-config__help-link"
            data-testid="glass-system-audio-routing-help"
            onClick={() => setShowHelp((open) => !open)}
          >
            {ROUTING_AUDIO_HELP_LINK}
          </button>
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
    </div>
  );
}
