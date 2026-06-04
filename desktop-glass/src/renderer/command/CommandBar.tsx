import { useCallback, useEffect, useRef, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import type { TranscriptionMode } from "../../shared/audioCaptureTypes.ts";

/**
 * Bottom-centered Glass command bar. Lives in its own clickable window that
 * floats over the click-through overlay. Minimal by design: voice control,
 * a single question input, and Ask. No tabs / timeline / dashboards.
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

  // Keep the window click-through unless the pointer is over the bar or the
  // input is focused — so clicks outside the pill reach the app behind.
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
    if (!value) return;
    send({ type: "submit-command", text: value });
    setText("");
  }, [text]);

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

  const handleVoice = (): void => {
    if (listening) {
      send({ type: "pause" });
      return;
    }
    if (tx.selectedMode === "manual") {
      setShowSources((v) => !v);
      return;
    }
    tx.startListening();
  };

  const startWithMode = (mode: TranscriptionMode): void => {
    tx.setMode(mode);
    setShowSources(false);
    // setMode applies asynchronously; let the user press the mic again or the
    // explicit Start button below. We expose a Start control in the source row.
  };

  const statusTone = listening
    ? "listen"
    : state.privacy.status === "sending"
      ? "send"
      : state.lastError
        ? "error"
        : "idle";

  return (
    <div className="command-root">
      <div
        className={`command-bar${listening ? " command-bar--listening" : ""}`}
        onMouseEnter={enterInteractive}
        onMouseLeave={leaveInteractive}
      >
        <div className="command-bar__row">
          <button
            type="button"
            className={`command-voice${listening ? " command-voice--active" : ""}`}
            onClick={handleVoice}
            title={listening ? "Stop listening" : "Listen"}
            aria-label={listening ? "Stop listening" : "Listen"}
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
            placeholder="Ask IIVO while you work…"
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

          <button type="button" className="command-ask" onClick={submit} disabled={!text.trim()}>
            Ask <span aria-hidden="true">↑</span>
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
                  onClick={() => startWithMode("microphone_web_speech")}
                >
                  Microphone
                </button>
                <button
                  type="button"
                  className={`command-mini${tx.selectedMode === "system_audio" ? " command-mini--on" : ""}`}
                  onClick={() => startWithMode("system_audio")}
                >
                  System Audio
                </button>
                <button
                  type="button"
                  className="command-mini command-mini--primary"
                  onClick={() => tx.startListening()}
                  disabled={tx.selectedMode === "manual" || !tx.canListen}
                >
                  Start
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
