import { useVoiceMode } from "../useVoiceMode.ts";

/**
 * Voice Mode status surface — shown only while the loop is active.
 * Start is the mic button on {@link CommandBar} (not a separate row above the input).
 */
export function VoiceModePanel(): JSX.Element | null {
  const voice = useVoiceMode();
  const { state } = voice;

  if (!state.active && state.status !== "error") {
    return null;
  }

  return (
    <div
      className={`voice-mode voice-mode--active voice-mode--${state.status}`}
      data-testid="glass-voice-mode-active"
    >
      <div className="voice-mode__header">
        <span className="voice-mode__badge" data-testid="glass-voice-mode-badge">
          <span className="voice-mode__pulse" aria-hidden="true" />
          Voice Mode Active
        </span>
        <span className="voice-mode__status" data-testid="glass-voice-mode-status">
          {voice.statusLabel}
        </span>
      </div>

      {state.status === "error" ? (
        <p className="voice-mode__error" data-testid="glass-voice-mode-error">
          {state.error ?? "Voice Mode error."}
        </p>
      ) : voice.liveTranscript ? (
        <p className="voice-mode__transcript" data-testid="glass-voice-mode-transcript">
          {voice.liveTranscript}
        </p>
      ) : null}

      {state.answerPreview ? (
        <p className="voice-mode__preview" data-testid="glass-voice-mode-preview">
          {state.answerPreview}
        </p>
      ) : null}

      <div className="voice-mode__actions">
        {state.active ? (
          <button
            type="button"
            data-testid="glass-voice-mode-cancel"
            className="command-mini"
            onClick={voice.cancel}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          data-testid="glass-voice-mode-stop"
          className="command-mini command-mini--danger"
          onClick={voice.stop}
        >
          Stop Everything
        </button>
      </div>
    </div>
  );
}
