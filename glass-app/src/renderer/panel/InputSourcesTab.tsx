import { useCallback, useState } from "react";
import { ClipboardPaste, Mic, Speaker } from "lucide-react";
import type { GlassState } from "../../shared/ipc.ts";
import type { TranscriptionMode } from "../../shared/audioCaptureTypes.ts";
import { send } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { ListeningControls } from "../components/ListeningControls.tsx";
import { MicLiveMeter } from "./MicLiveMeter.tsx";
import { SettingsChoiceCard, SettingsChoiceGrid } from "../settings/SettingsChoiceCard.tsx";

const MODE_ICONS: Record<TranscriptionMode, JSX.Element> = {
  manual: <ClipboardPaste size={28} strokeWidth={1.75} />,
  microphone_web_speech: <Mic size={28} strokeWidth={1.75} />,
  microphone_media_recorder: <Mic size={28} strokeWidth={1.75} />,
  system_audio: <Speaker size={28} strokeWidth={1.75} />,
};

const MODE_DESCRIPTIONS: Record<TranscriptionMode, string> = {
  manual: "Paste or type transcript into the session yourself",
  microphone_web_speech: "Live transcription from your mic via Web Speech",
  microphone_media_recorder: "Record mic locally without live STT",
  system_audio: "Capture app and meeting audio routed through Glass",
};

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
    <div className="panel-tab-view panel-audio-tab glass-settings__context" data-testid="glass-panel-audio-tab">
      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Listening source</p>
        <p className="glass-settings__block-sub">Choose what Glass transcribes during a session.</p>
        <SettingsChoiceGrid>
          {tx.modeOptions.map((mode) => (
            <SettingsChoiceCard
              key={mode}
              icon={MODE_ICONS[mode]}
              label={tx.modeLabels[mode]}
              description={MODE_DESCRIPTIONS[mode]}
              selected={tx.selectedMode === mode}
              status={tx.selectedMode === mode && tx.status === "listening" ? "ok" : "idle"}
              testId={`glass-audio-mode-${mode}`}
              onClick={() => tx.setMode(mode)}
            />
          ))}
        </SettingsChoiceGrid>
        <p className="glass-settings__block-hint">
          STT: {tx.sttProviderLabel} · {tx.sttStatusMessage}
        </p>
        {tx.micPathLabel ? <p className="glass-settings__block-hint">{tx.micPathLabel}</p> : null}
        {tx.systemAudioHint ? <p className="glass-settings__block-hint">{tx.systemAudioHint}</p> : null}
        <ListeningControls compact={false} />
      </section>

      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Microphone</p>
        <p className="glass-settings__block-sub">
          Command bar dictation and live session listening.
        </p>
        <div className="glass-settings__audio-actions">
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
      </section>

      <section className="glass-settings__block glass-settings__block--compact">
        <p className="glass-settings__block-label">Command bar microphone</p>
        <label className="glass-settings__toggle-card">
          <input
            type="checkbox"
            checked={settings.micAutoSendAfterSilence === true}
            onChange={(e) =>
              send({ type: "set-mic-auto-send-after-silence", enabled: e.target.checked })
            }
          />
          <span>
            <strong>Auto-send after silence (mic)</strong>
            <small>Review transcribed text before Ask unless this is on</small>
          </span>
        </label>
        <p className="glass-settings__block-hint">
          Default is off: use the mic on the command bar, review transcribed text, then press Ask.
          System audio stays separate (right-click the mic button).
        </p>
      </section>
    </div>
  );
}
