import { useCallback, useEffect, useRef, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ChromeRepositionOverlay } from "../ChromeRepositionOverlay.tsx";
import { ensureCommandBarClickable, useChromeLockToggle } from "../useChromeLockToggle.ts";
import { useChromeWindowDrag } from "../useChromeWindowDrag.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import type { TranscriptionMode } from "../../shared/audioCaptureTypes.ts";
import {
  micPermissionDeniedMessage,
  shouldShowMicPermissionDenied,
} from "../../shared/commandBarMic.ts";

/**
 * Bottom-centered Glass command bar. Direct ask renders inline on the overlay;
 * Context Bridge handoff remains available from response card actions.
 */
export function CommandBar(): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [showSources, setShowSources] = useState(false);
  const focusedRef = useRef(false);
  const hoverCountRef = useRef(0);
  const micInputTouchedRef = useRef(false);
  const wasListeningRef = useRef(false);

  const listening = state.privacy.listening || tx.status === "listening";
  const micListening = listening && tx.isMicrophoneCapture;
  const systemListening = listening && tx.isSystemAudioCapture;
  const transcribing = state.stt?.transcribing === true;
  const askPending = state.askStatus === "pending";
  const screenLooking = state.screenContextStatus?.kind === "looking";
  const micDenied = shouldShowMicPermissionDenied({
    micPermission: state.micPermission,
    lastError: tx.lastError,
  });

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

  useEffect(() => {
    if (!micListening) {
      micInputTouchedRef.current = false;
      return;
    }
    if (micInputTouchedRef.current) return;
    setText(tx.commandBarListenText);
  }, [micListening, tx.commandBarListenText]);

  useEffect(() => {
    if (wasListeningRef.current && !listening && tx.commandBarListenText.trim()) {
      setText(tx.commandBarListenText);
    }
    wasListeningRef.current = listening;
  }, [listening, tx.commandBarListenText]);

  const submit = useCallback(() => {
    const value = (micListening ? tx.commandBarListenText : text).trim();
    if (!value || askPending) return;
    if (listening) {
      send({ type: "pause" });
    }
    send({ type: "submit-command", text: value });
    setText("");
    micInputTouchedRef.current = false;
  }, [text, askPending, listening, micListening, tx.commandBarListenText]);

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
    micInputTouchedRef.current = false;
    void tx.startMicrophoneListening(text);
  };

  const handleVoiceContext = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    if (listening) return;
    setShowSources((v) => !v);
  };

  const pickSource = (mode: TranscriptionMode): void => {
    setShowSources(false);
    micInputTouchedRef.current = false;
    if (mode === "system_audio") {
      tx.startSystemAudioListening();
      return;
    }
    void tx.startMicrophoneListening(text);
  };

  const statusTone = listening
    ? "listen"
    : askPending
      ? "send"
      : state.askStatus === "error" || state.lastError
        ? "error"
        : "idle";

  const chromeLocked = state.glassSettings.chromeLayoutLocked !== false;
  const toggleChromeLock = useChromeLockToggle(chromeLocked);
  useChromeWindowDrag(!chromeLocked, dragSurfaceRef);

  useEffect(() => {
    if (!chromeLocked) {
      ensureCommandBarClickable();
      return () => {
        window.glass.setIgnoreMouse(true);
      };
    }
  }, [chromeLocked]);

  const inputValue = micListening && !micInputTouchedRef.current ? tx.commandBarListenText : text;
  const showSecondary = listening || showSources || micDenied;

  return (
    <div className="command-root">
      <div
        data-testid="glass-command-bar"
        className={`command-bar${listening ? " command-bar--listening" : ""}${askPending ? " command-bar--pending" : ""}${!chromeLocked ? " command-bar--unlocked" : ""}`}
        onMouseEnter={chromeLocked ? enterInteractive : undefined}
        onMouseLeave={chromeLocked ? leaveInteractive : undefined}
        aria-label={
          chromeLocked ? undefined : "Layout unlocked — hold and drag to move, then lock when done"
        }
      >
        {!chromeLocked ? <ChromeRepositionOverlay surfaceRef={dragSurfaceRef} /> : null}

        <div className="command-bar__row">
          <button
            type="button"
            data-testid="glass-command-listen"
            className={`command-voice${listening ? " command-voice--active" : ""}`}
            onClick={handleVoiceClick}
            onContextMenu={handleVoiceContext}
            title={
              listening
                ? "Stop listening"
                : "Start microphone (right-click for system audio)"
            }
            aria-label={listening ? "Stop listening" : "Start microphone"}
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
            data-testid="glass-command-input"
            className="command-input"
            type="text"
            value={inputValue}
            placeholder={
              transcribing
                ? "Transcribing…"
                : micListening
                ? "Listening… speak into your microphone"
                : systemListening
                  ? "Listening… system audio"
                : screenLooking
                  ? "Looking…"
                  : askPending
                    ? "IIVO is thinking…"
                    : "Ask IIVO while you work…"
            }
            disabled={askPending || transcribing}
            onChange={(e) => {
              const next = e.target.value;
              micInputTouchedRef.current = true;
              setText(next);
              if (micListening) {
                tx.setMicInputOverride(next);
              }
            }}
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
            data-testid={askPending ? "glass-command-cancel" : "glass-command-submit"}
            className="command-ask"
            onClick={askPending ? () => send({ type: "cancel-glass-ask" }) : submit}
            disabled={!askPending && !(micListening ? tx.commandBarListenText : text).trim()}
          >
            {askPending ? (
              <>Cancel</>
            ) : (
              <>
                Ask <span aria-hidden="true">↑</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="glass-command-chrome-lock"
            className={`command-chrome-lock${chromeLocked ? " command-chrome-lock--locked" : " command-chrome-lock--unlocked"}`}
            title={chromeLocked ? "Unlock layout to move dock and bar" : "Lock layout in place"}
            aria-label={chromeLocked ? "Unlock layout" : "Lock layout"}
            onPointerDown={ensureCommandBarClickable}
            onMouseEnter={ensureCommandBarClickable}
            onClick={toggleChromeLock}
          >
            {chromeLocked ? "🔒" : "🔓"}
          </button>
        </div>

        {state.visualAskRetention?.usedForAnswer ? (
          <p className="command-bar__screen-context" data-testid="glass-visual-ask-retention">
            {state.visualAskRetention.label}
            {state.visualAskRetention.detail ? ` · ${state.visualAskRetention.detail}` : ""}
          </p>
        ) : state.screenContextStatus && state.screenContextStatus.kind !== "none" ? (
          <p className="command-bar__screen-context" data-testid="glass-command-screen-context">
            {state.screenContextStatus.label}
          </p>
        ) : null}

        {showSecondary ? (
          <div className="command-bar__secondary" data-testid="glass-command-bar-secondary">
            {micDenied && !listening ? (
              <>
                <span
                  className="command-listen-status command-listen-status--error"
                  data-testid="glass-command-mic-denied"
                >
                  {micPermissionDeniedMessage(tx.lastError)}
                </span>
                <button
                  type="button"
                  data-testid="glass-command-open-mic-settings"
                  className="command-mini"
                  onClick={() => send({ type: "open-microphone-settings" })}
                >
                  Open Microphone Settings
                </button>
                <button
                  type="button"
                  className="command-mini"
                  onClick={() => void tx.startMicrophoneListening(text)}
                >
                  Retry Mic
                </button>
              </>
            ) : null}
            {listening ? (
              <>
                <span className="command-listen-status">
                  <span className="command-listen-status__pulse" aria-hidden="true" />
                  Listening {tx.listeningDuration} ·{" "}
                  {systemListening ? "system audio" : "microphone"}
                  {tx.transcribing ? " · transcribing…" : ""}
                </span>
                <button
                  type="button"
                  data-testid="glass-command-stop-listening"
                  className="command-mini command-mini--danger"
                  onClick={() => send({ type: "pause" })}
                >
                  Stop Listening
                </button>
              </>
            ) : !micDenied ? (
              <>
                <span className="command-listen-status">Other sources (optional)</span>
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
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
