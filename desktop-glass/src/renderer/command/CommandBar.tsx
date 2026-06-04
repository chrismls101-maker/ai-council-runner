import { useCallback, useEffect, useRef, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import type { TranscriptionMode } from "../../shared/audioCaptureTypes.ts";

/**
 * Bottom-centered Glass command bar. Direct ask renders inline on the overlay;
 * Context Bridge handoff remains available from response card actions.
 */
export function CommandBar(): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [showSources, setShowSources] = useState(false);
  const focusedRef = useRef(false);
  const hoverCountRef = useRef(0);

  const listening = state.privacy.listening || tx.status === "listening";
  const askPending = state.askStatus === "pending";

  useEffect(() => {
    window.glass.setIgnoreMouse(true);
  }, []);

  const updateIgnore = useCallback(() => {
    const interactive = focusedRef.current || hoverCountRef.current > 0;
    window.glass.setIgnoreMouse(!interactive);
  }, []);

  const enterInteractive = useCallback(() => {
    hoverCountRef.current += 1;
    updateIgnore();
  }, [updateIgnore]);

  const leaveInteractive = useCallback(() => {
    hoverCountRef.current = Math.max(0, hoverCountRef.current - 1);
    updateIgnore();
  }, [updateIgnore]);

  useEffect(() => {
    const unsubscribe = window.glass.onCommandBarFocus(() => {
      window.glass.setIgnoreMouse(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return unsubscribe;
  }, []);

  const submit = useCallback(() => {
    const value = text.trim();
    if (!value || askPending) return;
    send({ type: "submit-command", text: value });
    setText("");
  }, [text, askPending]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      inputRef.current?.blur();
      focusedRef.current = false;
      setShowSources(false);
      send({ type: "command-bar-blur" });
      window.glass.setIgnoreMouse(true);
    }
  };

  const handleVoiceClick = (): void => {
    if (listening) {
      send({ type: "pause" });
      return;
    }
    if (tx.selectedMode === "manual") {
      tx.setMode("microphone_web_speech");
      tx.startListening();
      return;
    }
    tx.startListening();
  };

  const handleVoiceContext = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    if (listening) return;
    setShowSources((v) => !v);
  };

  const pickSource = (mode: TranscriptionMode): void => {
    tx.setMode(mode);
    setShowSources(false);
    tx.startListening();
  };

  const statusTone = listening
    ? "listen"
    : askPending
      ? "send"
      : state.askStatus === "error" || state.lastError
        ? "error"
        : "idle";

  return (
    <div className="command-root">
      <div
        className={`command-bar${listening ? " command-bar--listening" : ""}${askPending ? " command-bar--pending" : ""}`}
        onMouseEnter={enterInteractive}
        onMouseLeave={leaveInteractive}
      >
        <div className="command-bar__row">
          <button
            type="button"
            className={`command-voice${listening ? " command-voice--active" : ""}`}
            onClick={handleVoiceClick}
            onContextMenu={handleVoiceContext}
            title={
              listening
                ? "Stop listening"
                : "Start listening (Microphone). Right-click for source options."
            }
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            <span className="command-voice__bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </button>

          <input
            ref={inputRef}
            className="command-input"
            type="text"
            value={text}
            placeholder={askPending ? "IIVO is thinking…" : "Ask IIVO while you work…"}
            disabled={askPending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              focusedRef.current = true;
              window.glass.setIgnoreMouse(false);
            }}
            onBlur={() => {
              focusedRef.current = false;
              updateIgnore();
            }}
          />

          <span className={`command-dot command-dot--${statusTone}`} aria-hidden="true" />

          <button
            type="button"
            className="command-ask"
            onClick={askPending ? () => send({ type: "cancel-glass-ask" }) : submit}
            disabled={!askPending && !text.trim()}
          >
            {askPending ? (
              <>Cancel</>
            ) : (
              <>
                Ask <span aria-hidden="true">↑</span>
              </>
            )}
          </button>
        </div>

        {(showSources || listening) && (
          <div className="command-bar__secondary">
            {listening ? (
              <>
                <span className="command-listen-status">
                  <span className="command-listen-status__pulse" aria-hidden="true" />
                  Listening {tx.listeningDuration} ·{" "}
                  {tx.selectedMode === "system_audio" ? "system audio" : "microphone"}
                  {tx.transcribing ? " · transcribing…" : ""}
                </span>
                <button
                  type="button"
                  className="command-mini command-mini--danger"
                  onClick={() => send({ type: "pause" })}
                >
                  Stop Listening
                </button>
              </>
            ) : (
              <>
                <span className="command-listen-status">Listen with</span>
                <button
                  type="button"
                  className={`command-mini${tx.selectedMode === "microphone_web_speech" ? " command-mini--on" : ""}`}
                  onClick={() => pickSource("microphone_web_speech")}
                >
                  Microphone
                </button>
                <button
                  type="button"
                  className={`command-mini${tx.selectedMode === "system_audio" ? " command-mini--on" : ""}`}
                  onClick={() => pickSource("system_audio")}
                >
                  System Audio
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
