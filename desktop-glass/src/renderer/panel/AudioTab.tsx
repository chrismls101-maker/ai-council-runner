import { useCallback, useState } from "react";
import type { GlassCommand } from "../../shared/ipc.ts";
import type { GlassCapabilityRow, GlassSetupActionType } from "../../shared/glassCapabilities.ts";
import type { GlassState } from "../../shared/ipc.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { ListeningControls } from "../components/ListeningControls.tsx";
import { SystemAudioConfigure } from "./SystemAudioConfigure.tsx";
import { MicLiveMeter } from "./MicLiveMeter.tsx";
import { PanelSection } from "./PanelSection.tsx";

function sendSetupAction(action: GlassSetupActionType): void {
  send({ type: action } as GlassCommand);
}

function AudioCapabilityRow({ row }: { row: GlassCapabilityRow }): JSX.Element {
  return (
    <li className="setup-section__row" data-testid={`glass-setup-row-${row.id}`}>
      <div className="setup-section__row-head">
        <span className={`status-dot status-dot--${row.severity}`} aria-hidden="true" />
        <div className="setup-section__row-text">
          <strong>{row.id === "microphone" ? "Microphone" : "STT"}</strong>
          <span className="setup-section__status">{row.label}</span>
          {row.detail ? <span className="setup-section__detail">{row.detail}</span> : null}
        </div>
      </div>
      {row.actions?.length ? (
        <div className="setup-section__row-footer">
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
        <div className="setup-section__row-footer">
          <button
            type="button"
            className="gbtn gbtn--small"
            data-testid={`glass-setup-action-${row.id}`}
            onClick={() => sendSetupAction(row.actionCommand!)}
          >
            {row.actionLabel}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function AudioCapabilityRows({ ids }: { ids: Array<"microphone" | "stt"> }): JSX.Element | null {
  const state = useGlassState();
  const rows = (state.setupCapabilities ?? []).filter((row) =>
    ids.includes(row.id as "microphone" | "stt"),
  );
  if (rows.length === 0) return null;

  return (
    <PanelSection title="Audio permissions" description="Microphone and speech-to-text readiness.">
      <ul className="setup-section__rows setup-section__rows--grid">
        {rows.map((row) => (
          <AudioCapabilityRow key={row.id} row={row} />
        ))}
      </ul>
    </PanelSection>
  );
}

export function AudioTab({ state }: { state: GlassState }): JSX.Element {
  const settings = state.glassSettings;
  const tx = useTranscriptionContext();
  const [micTesting, setMicTesting] = useState(false);

  const startMicTest = useCallback(() => {
    setMicTesting(true);
    send({ type: "test-microphone" });
  }, []);

  const stopMicTest = useCallback(() => {
    setMicTesting(false);
  }, []);

  return (
    <div className="panel-tab-view panel-audio-tab" data-testid="glass-panel-audio-tab">
      <SystemAudioConfigure />

      <PanelSection
        title="Microphone"
        description="Command bar dictation and live session listening."
      >
        <div className="audio-tab__mic-actions">
          <button
            type="button"
            className="gbtn gbtn--primary"
            data-testid="glass-test-microphone-bar"
            disabled={micTesting}
            onClick={startMicTest}
          >
            {micTesting ? "Listening…" : "Test Microphone"}
          </button>
          {micTesting ? (
            <button type="button" className="gbtn gbtn--ghost gbtn--small" onClick={stopMicTest}>
              Stop meter
            </button>
          ) : null}
        </div>
        <MicLiveMeter active={micTesting} />
      </PanelSection>

      <AudioCapabilityRows ids={["microphone", "stt"]} />

      <PanelSection title="Listening source" description="Choose what Glass transcribes during a session.">
        <div className="filter-row">
          {tx.modeOptions.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`tab ${tx.selectedMode === mode ? "tab--active" : ""}`}
              data-testid={`glass-audio-mode-${mode}`}
              onClick={() => tx.setMode(mode)}
            >
              {tx.modeLabels[mode]}
            </button>
          ))}
        </div>
        <p className="hint">
          STT: {tx.sttProviderLabel} · {tx.sttStatusMessage}
        </p>
        {tx.micPathLabel ? <p className="hint">{tx.micPathLabel}</p> : null}
        {tx.systemAudioHint ? <p className="hint">{tx.systemAudioHint}</p> : null}
        <ListeningControls compact={false} />
      </PanelSection>

      <PanelSection
        title="Command bar microphone"
        description="How the command bar mic behaves after dictation."
      >
        <label className="panel__settings-row panel__settings-row--check">
          <input
            type="checkbox"
            checked={settings.micAutoSendAfterSilence === true}
            onChange={(e) =>
              send({ type: "set-mic-auto-send-after-silence", enabled: e.target.checked })
            }
          />
          <span>Auto-send after silence (mic)</span>
        </label>
        <p className="hint">
          Default is off: use the mic on the command bar, review transcribed text, then press Ask.
          System audio stays separate (right-click the mic button).
        </p>
      </PanelSection>
    </div>
  );
}
