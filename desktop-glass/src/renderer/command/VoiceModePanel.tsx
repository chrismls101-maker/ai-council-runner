import { useVoiceMode } from "../useVoiceMode.ts";

/**
 * Explicit Voice Mode control surface for the command bar / overlay.
 *
 * - Mic only starts on the explicit "Start Voice Mode" action.
 * - When active, shows a visible "Voice Mode Active" badge, the current machine
 *   status (Listening… / Transcribing… / Looking… / Thinking… / Answering…),
 *   the live transcript, plus Cancel and Stop Everything.
 */
export function VoiceModePanel(): JSX.Element {
  const voice = useVoiceMode();
  const { state } = voice;

  if (!state.active && state.status !== "error") {
    return (
      <div className="voice-mode" data-testid="glass-voice-mode">
        <button
          type="button"
          data-testid="glass-voice-mode-start"
          className="voice-mode__start"
          onClick={voice.start}
          onMouseEnter={() => window.glass.setIgnoreMouse(false)}
          title="Start Voice Mode — mic starts only after you click"
        >
          🎙 Start Voice Mode
        </button>
      </div>
    );
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
