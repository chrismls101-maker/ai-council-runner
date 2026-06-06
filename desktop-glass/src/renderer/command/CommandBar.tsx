import { useCallback, useEffect, useRef, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ChromeRepositionOverlay } from "../ChromeRepositionOverlay.tsx";
import { ensureCommandBarClickable, useChromeLockToggle } from "../useChromeLockToggle.ts";
import { useChromeWindowDrag } from "../useChromeWindowDrag.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { VoiceModePanel } from "./VoiceModePanel.tsx";
import { CommandMicIcon } from "./CommandMicIcon.tsx";
import { CommandSendIcon, CommandStopIcon } from "./CommandSendIcon.tsx";
import type { TranscriptionMode } from "../../shared/audioCaptureTypes.ts";
import { useVoiceMode } from "../useVoiceMode.ts";
import {
  micPermissionDeniedMessage,
  shouldShowMicPermissionDenied,
} from "../../shared/commandBarMic.ts";
import { formatListeningDuration } from "../../shared/audioChunks.ts";

/**
 * Bottom-centered Glass command bar. Direct ask renders inline on the overlay;
 * Context Bridge handoff remains available from response card actions.
 *
 * Accessory strips (voice, listen status, screen context) sit above the main
 * composer pill so the bar stays a single-row capsule instead of stacking into
 * an oval blob.
 */
export function CommandBar(): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const voice = useVoiceMode();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [showSources, setShowSources] = useState(false);
  const focusedRef = useRef(false);
  const hoverCountRef = useRef(0);
  const micInputTouchedRef = useRef(false);
  const wasListeningRef = useRef(false);

  const listening = tx.status === "listening";
  const countdownActive = (state.listenCountdownSeconds ?? 0) > 0;
  const listeningDesynced = !listening && state.privacy.listening && !countdownActive;
  const listenElapsedMs = Math.max(state.stt?.listeningElapsedMs ?? 0, 0);
  const listenDurationLabel = formatListeningDuration(
    listening ? Math.max(listenElapsedMs, 0) : listenElapsedMs,
  );
  const buildingContext = state.copilot?.listenBuildingContext === true;
  const micListening = listening && tx.isMicrophoneCapture;
  const systemListening = listening && tx.isSystemAudioCapture;
  const transcribing = state.stt?.transcribing === true;
  const askPending = state.askStatus === "pending";
  const screenLooking = state.screenContextStatus?.kind === "looking";
  const micDenied = shouldShowMicPermissionDenied({
    micPermission: state.micPermission,
    lastError: tx.lastError,
  });
  const listenCopilotActive =
    state.copilot?.active === true && state.copilot.config.sessionType === "video_learning";

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

  const handleMicClick = (): void => {
    if (voice.state.active) {
      voice.stop();
      return;
    }
    if (listening) {
      send({ type: "pause" });
      return;
    }
    voice.start();
  };

  const handleVoiceContext = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    if (listening || voice.state.active) return;
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
  const voiceActive = voice.state.active || voice.state.status === "error";
  const micActive = voiceActive || micListening;
  const sessionListening = state.privacy.listening || listening;
  const showSecondary =
    countdownActive ||
    listeningDesynced ||
    (!voiceActive &&
      (sessionListening || listening || showSources || (micDenied && !listenCopilotActive)));

  const screenContextLine =
    state.visualAskRetention?.usedForAnswer ? (
      <>
        {state.visualAskRetention.label}
        {state.visualAskRetention.detail ? ` · ${state.visualAskRetention.detail}` : ""}
      </>
    ) : state.screenContextStatus && state.screenContextStatus.kind !== "none" ? (
      state.screenContextStatus.label
    ) : null;

  const hasAccessories = Boolean(screenContextLine || voiceActive || showSecondary);

  return (
    <div className="command-root">
      <div
        className={`command-bar-stack${!chromeLocked ? " command-bar-stack--unlocked" : ""}`}
        data-testid="glass-command-bar-stack"
        onMouseEnter={chromeLocked ? enterInteractive : undefined}
        onMouseLeave={chromeLocked ? leaveInteractive : undefined}
      >
        {!chromeLocked ? <ChromeRepositionOverlay surfaceRef={dragSurfaceRef} /> : null}

        {hasAccessories ? (
          <div className="command-bar-accessories" data-testid="glass-command-bar-accessories">
            {screenContextLine ? (
              <p
                className="command-bar-accessory command-bar__screen-context"
                data-testid={
                  state.visualAskRetention?.usedForAnswer
                    ? "glass-visual-ask-retention"
                    : "glass-command-screen-context"
                }
              >
                {screenContextLine}
              </p>
            ) : null}

            <VoiceModePanel />

            {showSecondary ? (
              <div
                className="command-bar-accessory command-bar__secondary"
                data-testid="glass-command-bar-secondary"
              >
                {countdownActive ? (
                  <span className="command-listen-status" data-testid="glass-command-countdown-status">
                    Listen starts in {state.listenCountdownSeconds}s…
                  </span>
                ) : null}
                {micDenied && !listening && !listenCopilotActive ? (
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
                {listeningDesynced ? (
                  <>
                    <span className="command-listen-status command-listen-status--error">
                      Audio capture did not start — open Glass panel and click Listen again.
                    </span>
                    <button
                      type="button"
                      className="command-mini command-mini--danger"
                      onClick={() => send({ type: "stop-everything" })}
                    >
                      Reset
                    </button>
                  </>
                ) : null}
                {listening || state.privacy.listening ? (
                  <>
                    <span className="command-listen-status" data-testid="glass-command-listen-status">
                      <span className="command-listen-status__pulse" aria-hidden="true" />
                      {buildingContext
                        ? "Listening… building context"
                        : `Listening ${tx.listeningDuration || listenDurationLabel} · ${systemListening || state.privacy.listening ? "system audio" : "microphone"}`}
                      {tx.transcribing ? " · transcribing…" : ""}
                    </span>
                    <button
                      type="button"
                      data-testid="glass-command-stop-listening"
                      className="command-mini command-mini--danger"
                      onClick={() => send({ type: listening ? "pause" : "stop-everything" })}
                    >
                      Stop Listening
                    </button>
                  </>
                ) : !micDenied || listenCopilotActive ? (
                  !countdownActive && !listening ? (
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
                  ) : null
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          data-testid="glass-command-bar"
          className={`command-bar composer-shell${listening || voiceActive ? " command-bar--listening" : ""}${askPending ? " command-bar--pending" : ""}${voiceActive ? " command-bar--voice" : ""}${!chromeLocked ? " command-bar--unlocked" : ""}`}
          aria-label={
            chromeLocked ? undefined : "Layout unlocked — hold and drag to move, then lock when done"
          }
        >
          <div className="command-bar__row composer-main">
            <button
              type="button"
              data-testid="glass-command-listen"
              className={`command-mic-btn composer-mic-btn${micActive ? " command-mic-btn--listening listening" : ""}`}
              onClick={handleMicClick}
              onContextMenu={handleVoiceContext}
              onPointerDown={ensureCommandBarClickable}
              onMouseEnter={ensureCommandBarClickable}
              title={
                voiceActive
                  ? "Stop Voice Mode"
                  : listening
                    ? "Stop listening"
                    : "Start Voice Mode (right-click for system audio)"
              }
              aria-label={
                voiceActive ? "Stop Voice Mode" : listening ? "Stop listening" : "Start Voice Mode"
              }
              aria-pressed={micActive}
            >
              <CommandMicIcon />
            </button>

            <div className="command-input-stack">
              <input
                ref={inputRef}
                data-testid="glass-command-input"
                className="command-input composer-textarea"
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
            </div>

            <div className="command-bar__trailing composer-trailing">
              {askPending ? (
                <button
                  type="button"
                  data-testid="glass-command-cancel"
                  className="composer-send-btn stop"
                  onClick={() => send({ type: "cancel-glass-ask" })}
                  aria-label="Cancel ask"
                >
                  <CommandStopIcon />
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="glass-command-submit"
                  className="composer-send-btn"
                  onClick={submit}
                  disabled={!(micListening ? tx.commandBarListenText : text).trim()}
                  aria-label="Send to IIVO"
                >
                  <CommandSendIcon />
                </button>
              )}

              <button
                type="button"
                data-testid="glass-command-chrome-lock"
                className={`command-chrome-lock composer-icon-btn${chromeLocked ? " command-chrome-lock--locked" : " command-chrome-lock--unlocked"}`}
                title={chromeLocked ? "Unlock layout to move dock and bar" : "Lock layout in place"}
                aria-label={chromeLocked ? "Unlock layout" : "Lock layout"}
                onPointerDown={ensureCommandBarClickable}
                onMouseEnter={ensureCommandBarClickable}
                onClick={toggleChromeLock}
              >
                {chromeLocked ? "🔒" : "🔓"}
              </button>
            </div>
          </div>

          <span className="composer-led-rim ui-led-line" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
