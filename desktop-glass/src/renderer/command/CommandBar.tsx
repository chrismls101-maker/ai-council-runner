import { useCallback, useEffect, useRef, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ChromeRepositionOverlay } from "../ChromeRepositionOverlay.tsx";
import { ensureCommandBarClickable, useChromeLockToggle } from "../useChromeLockToggle.ts";
import { GlassPowersPalette } from "./GlassPowersPalette.tsx";
import { useChromeWindowDrag } from "../useChromeWindowDrag.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { VoiceModePanel } from "./VoiceModePanel.tsx";
import { GlassLensPanel, type GlassLensPageState } from "./GlassLensPanel.tsx";
import { CommandMicIcon } from "./CommandMicIcon.tsx";
import { CommandSendIcon, CommandStopIcon } from "./CommandSendIcon.tsx";
import { CommandTranslateIcon } from "./CommandTranslateIcon.tsx";
import { CommandLensIcon } from "./CommandLensIcon.tsx";
import { CommandDesignIcon } from "./CommandDesignIcon.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { GlassAwarenessStrip } from "./GlassAwarenessStrip.tsx";
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
import { buildTranslateStartPatch, DEFAULT_LIVE_TRANSLATE_CONFIG } from "../../shared/liveTranslateConfig.ts";
import type { LiveTranslateTargetLanguage } from "../../shared/liveTranslateTypes.ts";
import type { GlassLensContext } from "../../shared/glassLensContext.ts";
import { lensContextHostname } from "../../shared/glassLensContext.ts";

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
  const [lensOpen, setLensOpen] = useState(false);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensScreenshotLoading, setLensScreenshotLoading] = useState(false);
  const [lensPage, setLensPage] = useState<GlassLensPageState | null>(null);
  const [lensPreviewScreenshot, setLensPreviewScreenshot] = useState("");
  const [lensContext, setLensContext] = useState<GlassLensContext | null>(null);
  const [lensPlaceholder, setLensPlaceholder] = useState<string | null>(null);
  const [translateElapsedMs, setTranslateElapsedMs] = useState(0);
  const focusedRef = useRef(false);
  const micInputTouchedRef = useRef(false);
  const wasListeningRef = useRef(false);

  const translateRuntime = state.liveTranslate;
  const translateActive = translateRuntime?.active && translateRuntime.config.enabled;

  const listening = tx.status === "listening";
  const countdownActive = (state.listenCountdownSeconds ?? 0) > 0;
  const listenElapsedMs = Math.max(state.stt?.listeningElapsedMs ?? 0, 0);
  const transcribing = state.stt?.transcribing === true;
  const listenCopilotActive =
    state.copilot?.active === true && state.copilot.config.sessionType === "video_learning";
  // Listen capture runs in the panel window; command bar shares main-process state.
  const captureConfirmed =
    listening ||
    transcribing ||
    (listenCopilotActive && state.privacy.listening && listenElapsedMs >= 500);
  const listeningDesynced =
    !captureConfirmed &&
    state.privacy.listening &&
    !countdownActive &&
    !translateActive &&
    !listenCopilotActive;
  const listenDurationLabel = formatListeningDuration(
    listening ? Math.max(listenElapsedMs, 0) : listenElapsedMs,
  );
  const buildingContext = state.copilot?.listenBuildingContext === true;
  const micListening = listening && tx.isMicrophoneCapture;
  const systemListening = listening && tx.isSystemAudioCapture;
  const askPending = state.askStatus === "pending" || state.askStatus === "streaming";
  const screenLooking = state.screenContextStatus?.kind === "looking";
  const micDenied = shouldShowMicPermissionDenied({
    micPermission: state.micPermission,
    lastError: tx.lastError,
  });

  const translateTarget: LiveTranslateTargetLanguage =
    translateRuntime?.config.targetLanguage ?? DEFAULT_LIVE_TRANSLATE_CONFIG.targetLanguage;
  const translateDurationLabel = formatListeningDuration(translateElapsedMs);

  useEffect(() => {
    if (!translateActive) {
      setTranslateElapsedMs(0);
      return;
    }
    const startedAt = translateRuntime?.lastUpdatedAt
      ? Date.parse(translateRuntime.lastUpdatedAt)
      : Date.now();
    const tick = (): void => {
      setTranslateElapsedMs(Math.max(0, Date.now() - startedAt));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [translateActive, translateRuntime?.lastUpdatedAt]);

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
      // Pass forTranslate=true so startChunkRecorder picks the right chunk size/path
      // before the IPC state round-trip completes.
      void tx.startSystemAudioListening(true);
    }
  }, [translateActive, translateTarget, systemListening, tx]);

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
    let value = (micListening ? tx.commandBarListenText : text).trim();
    if (!value && lensContext) {
      value = lensContext.screenshot.trim()
        ? "What should I know about this screenshot?"
        : "What should I know about this page?";
    }
    if (!value || askPending) return;
    if (listening) {
      send({ type: "pause" });
    }
    send({
      type: "submit-command",
      text: value,
      ...(lensContext ? { lensContext } : {}),
    });
    setText("");
    setLensContext(null);
    setLensPlaceholder(null);
    setLensOpen(false);
    setLensPage(null);
    setLensPreviewScreenshot("");
    micInputTouchedRef.current = false;
  }, [text, askPending, listening, micListening, tx.commandBarListenText, lensContext]);

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

  const clearLensState = useCallback((): void => {
    setLensOpen(false);
    setLensContext(null);
    setLensPage(null);
    setLensPreviewScreenshot("");
    setLensPlaceholder(null);
  }, []);

  const focusLensInput = useCallback((placeholder: string): void => {
    setLensPlaceholder(placeholder);
    inputRef.current?.focus();
  }, []);

  const handleLensClick = useCallback(async (): Promise<void> => {
    if (lensLoading) return;
    ensureCommandBarClickable();
    setLensLoading(true);
    try {
      const result = await window.glass.captureLens();
      if (result.error || !result.url.trim()) {
        clearLensState();
        return;
      }
      setLensPage({
        url: result.url,
        title: result.title,
        text: result.text,
      });
      setLensPreviewScreenshot("");
      setLensOpen(true);
    } finally {
      setLensLoading(false);
    }
  }, [lensLoading, clearLensState]);

  const handleTakeLensScreenshot = useCallback(async (): Promise<void> => {
    if (lensScreenshotLoading) return;
    setLensScreenshotLoading(true);
    try {
      const result = await window.glass.captureLensScreenshot();
      if (result.screenshot) {
        setLensPreviewScreenshot(result.screenshot);
      }
    } finally {
      setLensScreenshotLoading(false);
    }
  }, [lensScreenshotLoading]);

  const handleAskAboutLensPage = useCallback((): void => {
    if (!lensPage) return;
    setLensContext({
      url: lensPage.url,
      title: lensPage.title,
      text: lensPage.text,
      screenshot: "",
    });
    setLensOpen(false);
    focusLensInput("Ask about this page…");
  }, [lensPage, focusLensInput]);

  const handleAskAboutLensScreenshot = useCallback((): void => {
    if (!lensPage || !lensPreviewScreenshot.trim()) return;
    setLensContext({
      url: lensPage.url,
      title: lensPage.title,
      text: lensPage.text,
      screenshot: lensPreviewScreenshot,
    });
    setLensOpen(false);
    focusLensInput("Ask about this screenshot…");
  }, [lensPage, lensPreviewScreenshot, focusLensInput]);

  const handleLensAttachedBack = useCallback((): void => {
    if (!lensPage) return;
    setLensContext(null);
    setLensPlaceholder(null);
    setLensOpen(true);
  }, [lensPage]);

  const chromeLocked = state.glassSettings.chromeLayoutLocked !== false;
  const toggleChromeLock = useChromeLockToggle();
  useChromeWindowDrag(!chromeLocked, stackRef);

  useEffect(() => {
    const unsubscribe = window.glass.onCommandBarFocus(() => {
      syncGlassClickThrough(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.glass.onCommandBarPrefill((prefillText: string) => {
      syncGlassClickThrough(false);
      setText(prefillText);
      // Put cursor at end so user can edit or just press Enter
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(prefillText.length, prefillText.length);
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!chromeLocked) {
      ensureCommandBarClickable();
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
  const sessionStatus = state.session?.status;
  const sessionLive = sessionStatus === "active" || sessionStatus === "paused";
  const showSessionPill = sessionLive;
  const showListenPill =
    !translateActive && (countdownActive || listening || state.privacy.listening);
  const showSecondary =
    listeningDesynced ||
    (!voiceActive &&
      (!showListenPill && (showSources || (micDenied && !listenCopilotActive))));

  const screenContextLine =
    state.visualAskRetention?.usedForAnswer ? (
      <>
        {state.visualAskRetention.label}
        {state.visualAskRetention.detail ? ` · ${state.visualAskRetention.detail}` : ""}
      </>
    ) : state.screenContextStatus &&
        state.screenContextStatus.kind !== "none" &&
        state.screenContextStatus.kind !== "captured" &&
        state.screenContextStatus.kind !== "ready" ? (
      state.screenContextStatus.label
    ) : null;

  const hasAccessories = Boolean(
    state.workingContext ||
      state.activeApp ||
      screenContextLine ||
      voiceActive ||
      showSecondary ||
      lensOpen ||
      (lensContext && !lensOpen),
  );

  return (
    <div className="command-root">
      {/* Powers palette — renders above the command stack when ⌘⇧P is pressed */}
      <GlassPowersPalette />

      <div
        ref={stackRef}
        className={`command-bar-stack${!chromeLocked ? " command-bar-stack--unlocked" : ""}`}
        data-testid="glass-command-bar-stack"
      >
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

            {lensOpen && lensPage ? (
              <GlassLensPanel
                page={lensPage}
                screenshot={lensPreviewScreenshot}
                pageLoading={lensLoading}
                screenshotLoading={lensScreenshotLoading}
                onTakeScreenshot={() => void handleTakeLensScreenshot()}
                onAskAboutPage={handleAskAboutLensPage}
                onAskAboutScreenshot={handleAskAboutLensScreenshot}
                onDismiss={clearLensState}
              />
            ) : null}

            {lensContext && !lensOpen ? (
              <div
                className="command-bar-accessory command-bar__lens-attached"
                data-testid="glass-command-lens-attached"
              >
                <button
                  type="button"
                  className="command-bar__lens-attached-back"
                  data-testid="glass-command-lens-attached-back"
                  aria-label="Back to Lens panel"
                  onClick={handleLensAttachedBack}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="command-bar__lens-attached-label"
                  data-testid="glass-command-lens-attached-reopen"
                  aria-label={`Reopen Lens panel for ${lensContextHostname(lensContext.url)}`}
                  onClick={handleLensAttachedBack}
                >
                  <span data-testid="glass-command-lens-attached-label">
                    Page: {lensContextHostname(lensContext.url)}
                  </span>
                </button>
                <button
                  type="button"
                  className="command-bar__lens-attached-dismiss"
                  data-testid="glass-command-lens-attached-dismiss"
                  aria-label="Remove page context"
                  onClick={clearLensState}
                >
                  ×
                </button>
              </div>
            ) : null}

            {showSecondary ? (
              <div
                className="command-bar-accessory command-bar__secondary"
                data-testid="glass-command-bar-secondary"
              >
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
                ) : !micDenied || listenCopilotActive ? (
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
            <GlassAwarenessStrip />
          </div>
        ) : null}

        <div className="command-bar-hud" data-testid="glass-command-bar-hud">
          {showSessionPill || showListenPill ? (
            <div className="command-bar-hud__pills" data-testid="glass-command-bar-pills">
              {showSessionPill ? (
                <div
                  className="command-bar-pill command-bar-pill--session"
                  data-testid="glass-command-session-status"
                >
                  <span className="command-bar-pill__pulse" aria-hidden="true" />
                  <span className="command-bar-pill__label">
                    Session {sessionStatus === "active" ? "active" : "paused"}
                  </span>
                </div>
              ) : null}
              {countdownActive ? (
                <div className="command-bar-pill command-bar-pill--listen" data-testid="glass-command-countdown-status">
                  <span className="command-bar-pill__pulse" aria-hidden="true" />
                  <span className="command-bar-pill__label">
                    Listen {state.listenCountdownSeconds}s
                  </span>
                </div>
              ) : null}
              {!countdownActive && (listening || state.privacy.listening) ? (
                <div className="command-bar-pill command-bar-pill--listen" data-testid="glass-command-listen-status">
                  <span className="command-bar-pill__pulse" aria-hidden="true" />
                  <span className="command-bar-pill__label">
                    {buildingContext
                      ? "Listening…"
                      : `${tx.listeningDuration || listenDurationLabel}${tx.transcribing ? " · STT" : ""}`}
                  </span>
                  <button
                    type="button"
                    data-testid="glass-command-stop-listening"
                    className="command-bar-pill__action command-bar-pill__action--danger"
                    onClick={() => {
                      send({ type: listening ? "pause" : "stop-everything" });
                    }}
                  >
                    Stop
                  </button>
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
          onPointerDownCapture={prepareGlassTextPointerDown}
        >
          {!chromeLocked ? <ChromeRepositionOverlay /> : null}
          {!chromeLocked ? (
            <div className="command-bar__drag" aria-hidden="true">
              <span className="command-bar__drag-grip" />
            </div>
          ) : null}
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
                  translateActive
                    ? "Translating…"
                    : transcribing
                      ? "Transcribing…"
                      : micListening
                        ? "Listening… speak into your microphone"
                        : systemListening
                          ? "Listening… system audio"
                          : screenLooking
                            ? "Looking…"
                            : askPending
                              ? "IIVO is thinking…"
                              : lensPlaceholder ?? (state.workingContext ? `Watching: ${state.workingContext}` : "Ask IIVO while you work…")
                }
                disabled={askPending || (transcribing && !translateActive)}
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
                }}
                onBlur={() => {
                  focusedRef.current = false;
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

              <GlassHoverTooltip label="Design to Code — capture screen, generate component">
                <button
                  type="button"
                  data-testid="glass-command-design"
                  className="command-design-btn"
                  aria-label="Design to Code"
                  onClick={() => send({ type: "design-capture" })}
                  onPointerDown={ensureCommandBarClickable}
                  onMouseEnter={ensureCommandBarClickable}
                >
                  <CommandDesignIcon />
                </button>
              </GlassHoverTooltip>

              <GlassHoverTooltip label={lensOpen ? "Close Lens" : "Capture page with Lens"}>
                <button
                  type="button"
                  data-testid={lensLoading ? "glass-command-lens-loading" : "glass-command-lens"}
                  className={`command-lens-btn${lensOpen ? " command-lens-btn--active" : ""}`}
                  aria-label={lensOpen ? "Close Lens panel" : "Capture page with IIVO Lens"}
                  aria-pressed={lensOpen}
                  disabled={lensLoading}
                  onClick={() => {
                    if (lensOpen) {
                      clearLensState();
                      return;
                    }
                    void handleLensClick();
                  }}
                  onPointerDown={ensureCommandBarClickable}
                  onMouseEnter={ensureCommandBarClickable}
                >
                  <CommandLensIcon />
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
                  disabled={
                    !(micListening ? tx.commandBarListenText : text).trim() && !lensContext
                  }
                  aria-label="Send to IIVO"
                >
                  <CommandSendIcon />
                </button>
              )}

              <GlassHoverTooltip label={chromeLocked ? "Unlock layout" : "Lock layout"}>
                <button
                  type="button"
                  data-testid="glass-command-chrome-lock"
                  data-chrome-no-drag
                  className={`command-chrome-lock composer-icon-btn${chromeLocked ? " command-chrome-lock--locked" : " command-chrome-lock--unlocked"}`}
                  aria-label={chromeLocked ? "Unlock layout" : "Lock layout"}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    ensureCommandBarClickable();
                  }}
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
    </div>
  );
}
