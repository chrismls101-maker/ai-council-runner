import { useCallback, useEffect, useRef, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ChromeRepositionOverlay } from "../ChromeRepositionOverlay.tsx";
import { ensureCommandBarClickable, useChromeLockToggle } from "../useChromeLockToggle.ts";
import { useChromeWindowDrag } from "../useChromeWindowDrag.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { VoiceModePanel } from "./VoiceModePanel.tsx";
import { CommandMicIcon } from "./CommandMicIcon.tsx";
import { CommandSendIcon, CommandStopIcon } from "./CommandSendIcon.tsx";
import { CommandTranslateIcon } from "./CommandTranslateIcon.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import type { TranscriptionMode } from "../../shared/audioCaptureTypes.ts";
import { useVoiceMode } from "../useVoiceMode.ts";
import {
  prepareGlassTextContextMenu,
  prepareGlassTextPointerDown,
  syncGlassClickThrough,
} from "../glassTextInteraction.ts";
import {
  micPermissionDeniedMessage,
  shouldShowMicPermissionDenied,
} from "../../shared/commandBarMic.ts";
import { formatListeningDuration } from "../../shared/audioChunks.ts";
import { buildTranslateStartPatch } from "../../shared/liveTranslateConfig.ts";
import { liveTranslateLanguagePairLabel } from "../../shared/liveTranslateTypes.ts";
import type { LiveTranslateTargetLanguage } from "../../shared/liveTranslateTypes.ts";

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
  const stackRef = useRef<HTMLDivElement | null>(null);
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

  const translateRuntime = state.liveTranslate;
  const translateActive = translateRuntime?.active && translateRuntime.config.enabled;
  const translateTarget: LiveTranslateTargetLanguage =
    translateRuntime?.config.targetLanguage ?? "es";
  const translatePairLabel = translateActive
    ? liveTranslateLanguagePairLabel(
        translateRuntime.config.sourceLanguage,
        translateRuntime.config.targetLanguage,
        translateRuntime.detectedSourceLanguage,
      )
    : undefined;
  const translateStatusLabel = translateActive ? `Live Translate · ${translatePairLabel}` : undefined;

  const toggleTranslate = useCallback(() => {
    if (translateActive) {
      send({ type: "translate-stop" });
      return;
    }
    send({
      type: "translate-set-config",
      patch: buildTranslateStartPatch("media", translateTarget),
    });
    send({ type: "translate-start", targetLanguage: translateTarget });
    if (!systemListening) {
      tx.setMode("system_audio");
      void tx.startSystemAudioListening();
    }
  }, [translateActive, translateTarget, systemListening, tx]);

  useEffect(() => {
    syncGlassClickThrough(true);
  }, []);

  const updateIgnore = useCallback(() => {
    const interactive = focusedRef.current || hoverCountRef.current > 0;
    syncGlassClickThrough(!interactive);
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
      syncGlassClickThrough(false);
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
      updateIgnore();
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
  useChromeWindowDrag(!chromeLocked, stackRef);

  useEffect(() => {
    if (!chromeLocked) {
      ensureCommandBarClickable();
      return () => {
        syncGlassClickThrough(true);
      };
    }
  }, [chromeLocked]);

  useEffect(() => {
    const node = stackRef.current;
    if (!node) return;

    const report = (): void => {
      const heightPx = Math.ceil(node.getBoundingClientRect().height);
      send({ type: "report-command-bar-stack-height", heightPx });
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  const hasAccessories = Boolean(screenContextLine || voiceActive || showSecondary || translateActive);

  return (
    <div className="command-root">
      <div
        ref={stackRef}
        className={`command-bar-stack${!chromeLocked ? " command-bar-stack--unlocked" : ""}`}
        data-testid="glass-command-bar-stack"
        onMouseEnter={chromeLocked ? enterInteractive : undefined}
        onMouseLeave={chromeLocked ? leaveInteractive : undefined}
      >
        {!chromeLocked ? <ChromeRepositionOverlay /> : null}

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

            {translateActive && translateStatusLabel ? (
              <div
                className="command-bar-accessory command-bar__translate-status"
                data-testid="glass-command-translate-status"
              >
                <span className="command-bar__translate-status-dot" aria-hidden="true" />
                <span className="command-bar__translate-status-label">{translateStatusLabel}</span>
                <button
                  type="button"
                  className="command-bar__translate-status-stop"
                  data-testid="glass-command-translate-stop"
                  onClick={() => send({ type: "translate-stop" })}
                >
                  Stop
                </button>
              </div>
            ) : null}

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

            <div
              className="command-input-stack"
              onPointerDownCapture={prepareGlassTextPointerDown}
            >
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
                onContextMenu={prepareGlassTextContextMenu}
                onFocus={() => {
                  focusedRef.current = true;
                  syncGlassClickThrough(false);
                }}
                onBlur={() => {
                  focusedRef.current = false;
                  updateIgnore();
                }}
              />
            </div>

            <div className="command-bar__trailing composer-trailing">
              <GlassHoverTooltip label={translateActive ? "Stop Translate" : "Translate"}>
                <button
                  type="button"
                  data-testid="glass-command-translate"
                  className={`command-translate-btn${translateActive ? " command-translate-btn--active" : ""}`}
                  aria-label={translateActive ? "Stop Live Translate" : "Start Live Translate"}
                  aria-pressed={translateActive}
                  onClick={toggleTranslate}
                  onPointerDown={ensureCommandBarClickable}
                  onMouseEnter={ensureCommandBarClickable}
                >
                  <CommandTranslateIcon />
                </button>
              </GlassHoverTooltip>

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

              <GlassHoverTooltip label={chromeLocked ? "Unlock layout" : "Lock layout"}>
                <button
                  type="button"
                  data-testid="glass-command-chrome-lock"
                  className={`command-chrome-lock composer-icon-btn${chromeLocked ? " command-chrome-lock--locked" : " command-chrome-lock--unlocked"}`}
                  aria-label={chromeLocked ? "Unlock layout" : "Lock layout"}
                  onPointerDown={ensureCommandBarClickable}
                  onMouseEnter={ensureCommandBarClickable}
                  onClick={toggleChromeLock}
                >
                  {chromeLocked ? "🔒" : "🔓"}
                </button>
              </GlassHoverTooltip>
            </div>
          </div>

          <span className="composer-led-rim ui-led-line" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
