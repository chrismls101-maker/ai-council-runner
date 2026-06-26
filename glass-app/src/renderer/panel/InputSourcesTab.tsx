import { useCallback, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import { send } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { ListeningControls } from "../components/ListeningControls.tsx";
import { MicLiveMeter } from "./MicLiveMeter.tsx";
import { PanelSection } from "./PanelSection.tsx";

export function InputSourcesTab({ state }: { state: GlassState }): JSX.Element {
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
