/**
 * SortingHatScreen
 * ----------------
 * Full-screen first-launch onboarding. The particle swarm fills the canvas.
 * IIVO speaks to the user, asks name + one question, then completes onboarding.
 *
 * Phase machine:
 *   manifesting      → swarm appearing, no input
 *   waiting-name     → collecting user's name
 *   waiting-answer-1 → Q1 posed, awaiting user text
 *   handoff          → voice bridge to activation screen
 *   done             → fade out, call onComplete
 */

import { useEffect, useRef, useState, useCallback, useMemo, type MutableRefObject } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import SwarmScene from "./swarm/SwarmScene.tsx";
import { playIivoTtsFromBase64, applyIivoTtsPlayback, decodeMp3Base64, IIVO_TTS_PLAYBACK_RATE } from "../../shared/iivoVoiceSpec.ts";
import {
  SORTING_HAT_PAUSE_BEFORE_NAME_MS,
  SORTING_HAT_PAUSE_BEFORE_INPUT_MS,
  SORTING_HAT_POST_MANIFEST_PAUSE_MS,
  SORTING_HAT_AFTER_LANGUAGE_PICKER_PAUSE_MS,
  SORTING_HAT_POST_PICKER_MANIFEST_MS,
  SORTING_HAT_PAUSE_BEFORE_ACTIVATION_MS,
  SORTING_HAT_TTS_GUARD_MS,
} from "./sortingHatTiming.ts";
import { ModeController } from "./swarm/ModeController.ts";
import { VoiceController } from "./swarm/VoiceController.ts";
import { PresenceStateMachine } from "./swarm/PresenceStateMachine.ts";
import { MODES } from "./swarm/manifestations.ts";
import type { GlassUiLocale } from "../../shared/glassLocale.ts";
import { extractOnboardingName, getSortingHatCopy } from "../../shared/sortingHatCopy.ts";
import { useSortingHatVoiceInput } from "./useSortingHatVoiceInput.ts";
import { createSpeechQueue } from "./sortingHatSpeechQueue.ts";
import { OverlayGlassFrame } from "../shared/OverlayGlassFrame.tsx";
import "../shared/overlayGlassFrame.css";
import "./SortingHatScreen.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OnboardingPhase =
  | "manifesting"
  | "waiting-name"
  | "waiting-answer-1"
  | "handoff"
  | "done";

// ---------------------------------------------------------------------------
// Controller singletons — created once per mount
// ---------------------------------------------------------------------------

function useSwarmControllers() {
  const controllerRef = useRef<ModeController | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const presenceRef = useRef<PresenceStateMachine | null>(null);

  if (!controllerRef.current) controllerRef.current = new ModeController(MODES.substrate);
  if (!voiceRef.current) voiceRef.current = new VoiceController();
  if (!presenceRef.current) presenceRef.current = new PresenceStateMachine();

  return {
    controller: controllerRef.current,
    voice: voiceRef.current,
    presence: presenceRef.current,
  };
}

// ---------------------------------------------------------------------------
// Onboarding click-through — desktop passthrough, interactive zones receive clicks
// ---------------------------------------------------------------------------

function useOnboardingClickThrough(): void {
  useEffect(() => {
    const setPassthrough = (ignore: boolean): void => {
      window.glass?.setIgnoreMouse?.(ignore);
    };

    const onMove = (event: MouseEvent): void => {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const interactive = hit?.closest("[data-onboarding-interactive]");
      setPassthrough(!interactive);
    };

    const onLeave = (): void => setPassthrough(true);

    setPassthrough(true);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      setPassthrough(true);
    };
  }, []);
}

function bindOnboardingInteractiveSurface(el: HTMLElement | null): void {
  if (!el || el.dataset.onboardingInteractiveBound === "1") return;
  el.dataset.onboardingInteractiveBound = "1";
  el.addEventListener("pointerenter", () => window.glass?.setIgnoreMouse?.(false));
  el.addEventListener("pointerleave", () => window.glass?.setIgnoreMouse?.(true));
}

function useOnboardingInteractiveRef<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    bindOnboardingInteractiveSurface(el);
  }, []);
}

// ---------------------------------------------------------------------------
// TTS playback hook — watches glassState.ttsAudio
// ---------------------------------------------------------------------------

const TTS_WAIT_MS = SORTING_HAT_TTS_GUARD_MS;

/** Premium fallback: silence + log. Never macOS robot speech. */
function failTtsSilently(reason: string, onEnd?: () => void): void {
  console.warn(`[SortingHat] TTS skipped (${reason}) — no voice playback`);
  window.speechSynthesis?.cancel();
  onEnd?.();
}

function useTtsPlayback(
  presence: PresenceStateMachine,
  voice: VoiceController,
  activeLineRef: MutableRefObject<string | null>,
  fallbackTimerRef: MutableRefObject<number | null>,
  onLineDoneRef: MutableRefObject<(() => void) | null>,
  onPlayStartRef: MutableRefObject<(() => void) | null>,
  audioCtxRef: MutableRefObject<AudioContext | null>,
  stopActiveTtsRef: MutableRefObject<(() => void) | null>,
): void {
  const state = useGlassState();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const webAudioStopRef = useRef<(() => void) | null>(null);
  const lastPlayedTtsIdRef = useRef<string | null>(null);

  const stopPlayback = useCallback((): void => {
    webAudioStopRef.current?.();
    webAudioStopRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    if (activeLineRef.current) {
      activeLineRef.current = null;
      const cb = onLineDoneRef.current;
      onLineDoneRef.current = null;
      cb?.();
    }
  }, [activeLineRef, fallbackTimerRef, onLineDoneRef]);

  useEffect(() => {
    stopActiveTtsRef.current = stopPlayback;
    return () => {
      if (stopActiveTtsRef.current === stopPlayback) {
        stopActiveTtsRef.current = null;
      }
    };
  }, [stopActiveTtsRef, stopPlayback]);

  useEffect(() => {
    const ttsAudio = state.ttsAudio;
    if (!ttsAudio) return;
    if (lastPlayedTtsIdRef.current === ttsAudio.id) return;
    lastPlayedTtsIdRef.current = ttsAudio.id;

    if (!ttsAudio.data) {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      failTtsSilently("no audio data from main process", () => {
        activeLineRef.current = null;
        const cb = onLineDoneRef.current;
        onLineDoneRef.current = null;
        cb?.();
      });
      return;
    }

    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();

    webAudioStopRef.current?.();
    webAudioStopRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    let cancelled = false;

    const handleDone = (): void => {
      activeLineRef.current = null;
      const cb = onLineDoneRef.current;
      onLineDoneRef.current = null;
      cb?.();
    };

    const runHtmlFallback = (): void => {
      const objectUrl = URL.createObjectURL(decodeMp3Base64(ttsAudio.data));
      objectUrlRef.current = objectUrl;
      const audio = new Audio();
      audio.src = objectUrl;
      audio.volume = 1;
      audioRef.current = audio;
      audio.onended = handleDone;

      const startHtml = (): void => {
        if (cancelled) return;
        applyIivoTtsPlayback(audio);
        onPlayStartRef.current?.();
        onPlayStartRef.current = null;
        void audio.play().then(() => {
          console.log("[SortingHat] ElevenLabs HTML fallback playing");
        }).catch((err) => {
          console.warn("[SortingHat] HTML fallback play failed", err);
          failTtsSilently("playback blocked", handleDone);
        });
      };

      audio.addEventListener("canplaythrough", startHtml, { once: true });
      audio.addEventListener("error", () => {
        if (cancelled) return;
        failTtsSilently("audio load failed", handleDone);
      }, { once: true });
      audio.load();
    };

    void (async () => {
      try {
        const { ctx, input: fxInput } = voice.getFxContext();
        audioCtxRef.current = ctx;
        await playIivoTtsFromBase64(ttsAudio.data, ctx, () => {
          console.log(
            `[SortingHat] ElevenLabs WebAudio rate=${IIVO_TTS_PLAYBACK_RATE} (pitch drop + FX)`,
          );
          onPlayStartRef.current?.();
          onPlayStartRef.current = null;
        }, fxInput, webAudioStopRef);
        if (!cancelled) handleDone();
      } catch (err) {
        console.warn("[SortingHat] WebAudio TTS failed, trying HTML fallback", err);
        if (!cancelled) runHtmlFallback();
      }
    })();

    return () => {
      cancelled = true;
      webAudioStopRef.current?.();
      webAudioStopRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      audioRef.current = null;
    };
  }, [state.ttsAudio, activeLineRef, fallbackTimerRef, onLineDoneRef, onPlayStartRef, audioCtxRef, stopActiveTtsRef]);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SortingHatScreenProps {
  locale: GlassUiLocale;
  /** User already saw boot + language picker — skip long pre-speech delay. */
  afterLanguagePicker?: boolean;
  onComplete: () => void;
}

export function SortingHatScreen({
  locale,
  afterLanguagePicker = true,
  onComplete,
}: SortingHatScreenProps): JSX.Element {
  const { controller, voice, presence } = useSwarmControllers();

  const state = useGlassState();
  const copy = useMemo(() => getSortingHatCopy(locale), [locale]);

  const [phase, setPhase] = useState<OnboardingPhase>("manifesting");
  const [iivoText, setIivoText] = useState("");
  const [textVisible, setTextVisible] = useState(false);
  const [inputVisible, setInputVisible] = useState(false);
  const [draft, setDraft] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [screenOpacity, setScreenOpacity] = useState(1);

  const phaseRef = useRef<OnboardingPhase>("manifesting");
  phaseRef.current = phase;

  const inputRef = useRef<HTMLInputElement>(null);
  const activeLineRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const speechChainRef = useRef(0);
  const onLineDoneRef = useRef<(() => void) | null>(null);
  const onPlayStartRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopActiveTtsRef = useRef<(() => void) | null>(null);
  const pendingWaitResolveRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bindInteractive = useOnboardingInteractiveRef<HTMLElement>();

  useOnboardingClickThrough();

  const scheduleAfterLine = useCallback(
    (pauseMs: number, maxWaitMs: number, cb: () => void): void => {
      let fired = false;
      const guardTimer = window.setTimeout(() => {
        if (fired) return;
        fired = true;
        onLineDoneRef.current = null;
        cb();
      }, maxWaitMs);
      onLineDoneRef.current = () => {
        if (fired) return;
        fired = true;
        window.clearTimeout(guardTimer);
        window.setTimeout(cb, pauseMs);
      };
    },
    [],
  );

  const waitForLineDone = useCallback(
    (pauseMs: number, maxWaitMs: number): Promise<void> =>
      new Promise((resolve) => {
        pendingWaitResolveRef.current = resolve;
        scheduleAfterLine(pauseMs, maxWaitMs, () => {
          pendingWaitResolveRef.current = null;
          resolve();
        });
      }),
    [scheduleAfterLine],
  );

  useTtsPlayback(
    presence,
    voice,
    activeLineRef,
    fallbackTimerRef,
    onLineDoneRef,
    onPlayStartRef,
    audioCtxRef,
    stopActiveTtsRef,
  );

  useEffect(() => {
    void voice.resumeContext();
  }, [voice]);

  const hidePromptText = useCallback((): void => {
    setTextVisible(false);
    setIivoText("");
  }, []);

  const showText = useCallback((text: string): void => {
    setIivoText(text);
    setTextVisible(false);
    window.requestAnimationFrame(() => setTextVisible(true));
  }, []);

  const speakLine = useCallback(
    (text: string, opts?: { visible?: boolean; onStart?: () => void }): void => {
      const showOnScreen = opts?.visible !== false;
      const onStart = opts?.onStart;
      presence.set("speaking");
      controller.setModeInstant(MODES.waveform);
      activeLineRef.current = text;
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
      }
      send({ type: "glass-tts", text });
      fallbackTimerRef.current = window.setTimeout(() => {
        if (activeLineRef.current !== text) return;
        activeLineRef.current = null;
        failTtsSilently("ElevenLabs audio never arrived", () => {
          onLineDoneRef.current?.();
          onLineDoneRef.current = null;
        });
      }, TTS_WAIT_MS);
      if (showOnScreen) {
        hidePromptText();
        onPlayStartRef.current = () => {
          showText(text);
          onStart?.();
        };
      } else {
        onPlayStartRef.current = onStart ?? null;
      }
    },
    [controller, presence, showText, hidePromptText],
  );

  const speechQueue = useMemo(
    () => createSpeechQueue(speakLine, waitForLineDone, speechChainRef),
    [speakLine, waitForLineDone],
  );

  const cancelPendingSpeech = useCallback((): void => {
    speechQueue.cancel();
    stopActiveTtsRef.current?.();
    pendingWaitResolveRef.current?.();
    pendingWaitResolveRef.current = null;
    onLineDoneRef.current = null;
    onPlayStartRef.current = null;
    activeLineRef.current = null;
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, [speechQueue]);

  const showInput = useCallback((): void => {
    setInputVisible(true);
    window.setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const goToListening = useCallback((): void => {
    presence.set("listening");
    controller.setModeInstant(MODES.aperture);
    setInputVisible(true);
    window.setTimeout(() => inputRef.current?.focus(), 200);
  }, [controller, presence]);

  const finishOnboarding = useCallback((opts?: { skipped?: boolean }): void => {
    cancelPendingSpeech();
    setInputVisible(false);
    setPhase("done");
    presence.set("dissolving");
    controller.setMode(MODES.streams);
    window.setTimeout(() => setScreenOpacity(0), 400);
    window.setTimeout(() => {
      if (opts?.skipped) {
        send({ type: "glass-onboarding-skip" });
      } else {
        send({ type: "glass-onboarding-complete", persona: "general" });
      }
      onComplete();
    }, 400 + 700);
  }, [cancelPendingSpeech, controller, presence, onComplete]);

  const beginActivationHandoff = useCallback(
    (opts?: { skipped?: boolean }): void => {
      if (phaseRef.current === "handoff" || phaseRef.current === "done") return;

      if (state.e2eFastOnboarding) {
        finishOnboarding(opts);
        return;
      }

      cancelPendingSpeech();
      setInputVisible(false);
      setPhase("handoff");
      hidePromptText();

      const chainId = speechChainRef.current;
      void speechQueue
        .speak(copy.activationHandoffLine, {
          visible: true,
          pauseAfterMs: SORTING_HAT_PAUSE_BEFORE_ACTIVATION_MS,
        })
        .then(() => {
          if (speechChainRef.current !== chainId) return;
          finishOnboarding(opts);
        });
    },
    [
      cancelPendingSpeech,
      copy.activationHandoffLine,
      finishOnboarding,
      hidePromptText,
      speechQueue,
      state.e2eFastOnboarding,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const track = (id: number): number => { timers.push(id); return id; };

    const startSpeechSequence = (): void => {
      if (cancelled) return;
      void voice.resumeContext().then(() => {
        if (cancelled) return;
        const chainId = speechChainRef.current;
        void speechQueue
          .script([
            { text: copy.welcomeLine, visible: false },
            {
              text: copy.glassIntroLine,
              visible: true,
              pauseAfterMs: SORTING_HAT_PAUSE_BEFORE_NAME_MS,
            },
            {
              text: copy.nameQuestionLine,
              visible: true,
              pauseAfterMs: SORTING_HAT_PAUSE_BEFORE_INPUT_MS,
            },
          ])
          .then(() => {
            if (cancelled || speechChainRef.current !== chainId || phaseRef.current !== "manifesting") return;
            setPhase("waiting-name");
            goToListening();
          });
      });
    };

    if (afterLanguagePicker) {
      controller.setModeInstant(MODES.substrate);
      presence.set("manifesting");
      track(
        window.setTimeout(() => {
          if (cancelled) return;
          controller.setMode(MODES.aperture);
          presence.set("listening");
          track(window.setTimeout(startSpeechSequence, SORTING_HAT_AFTER_LANGUAGE_PICKER_PAUSE_MS));
        }, SORTING_HAT_POST_PICKER_MANIFEST_MS),
      );
    } else {
      controller.setModeInstant(MODES.aperture);
      presence.set("listening");
      const delayMs = state.e2eFastOnboarding ? 150 : SORTING_HAT_POST_MANIFEST_PAUSE_MS;
      track(window.setTimeout(startSpeechSequence, delayMs));
    }

    return () => {
      cancelled = true;
      onLineDoneRef.current = null;
      timers.forEach((id) => window.clearTimeout(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, afterLanguagePicker]);

  const handleSubmit = useCallback((overrideText?: string): void => {
    const trimmed = (overrideText ?? draft).trim();
    if (!trimmed) return;
    const currentPhase = phaseRef.current;

    if (currentPhase === "waiting-name") {
      const firstName = extractOnboardingName(trimmed, locale);
      setPersonaName(trimmed);
      setDraft("");
      setInputVisible(false);

      send({
        type: "update-glass-profile",
        profile: { name: trimmed, usualWork: "", currentFocus: "" },
      });

      setPhase("manifesting");
      const ack = copy.niceToMeetYou(firstName);
      const chainId = speechChainRef.current;
      void speechQueue
        .speak(ack, { visible: false, pauseAfterMs: 400 })
        .then(() => {
          if (speechChainRef.current !== chainId) return;
          setPhase("waiting-answer-1");
          showText(copy.q1Line);
          showInput();
          return speechQueue.script([
            { text: copy.q1Line, visible: true },
            { text: copy.q1HelpLine, visible: false },
          ]);
        })
        .then(() => {
          if (speechChainRef.current !== chainId) return;
          goToListening();
        });
      return;
    }

    if (currentPhase === "waiting-answer-1") {
      setDraft("");
      send({
        type: "update-glass-profile",
        profile: {
          name: personaName || state.glassUserProfile?.name || "",
          usualWork: trimmed,
          currentFocus: state.glassUserProfile?.currentFocus ?? "",
        },
      });
      beginActivationHandoff();
    }
  }, [draft, personaName, locale, copy, goToListening, showInput, showText, speechQueue, beginActivationHandoff, state.glassUserProfile]);

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  const voiceInput = useSortingHatVoiceInput({
    locale,
    phase,
    enabled: inputVisible && phase !== "manifesting" && phase !== "handoff" && phase !== "done",
    onDraft: setDraft,
    onAutoSubmit: (text) => handleSubmitRef.current(text),
  });

  const inputDisplayValue = voiceInput.interimText || draft;

  const handleSkip = useCallback((): void => {
    beginActivationHandoff({ skipped: true });
  }, [beginActivationHandoff]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === "Enter" && draft.trim()) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      }
    },
    [draft, handleSubmit, handleSkip],
  );

  return (
    <div
      ref={rootRef}
      className="sorting-hat"
      data-testid="sorting-hat-screen"
      style={{ opacity: screenOpacity, transition: "opacity 0.7s ease" }}
    >
      <div className="sorting-hat__veil" aria-hidden="true" />

      <OverlayGlassFrame className="sorting-hat__frame" />

      <div className="sorting-hat__swarm">
        <SwarmScene
          controller={controller}
          voice={voice}
          presence={presence}
          transparentOverlay
        />
      </div>

      <div
        className={[
          "sorting-hat__text",
          textVisible && iivoText ? "sorting-hat__text--visible" : "",
          phase === "waiting-answer-1" ? "sorting-hat__text--q1" : "",
          phase === "handoff" ? "sorting-hat__text--handoff" : "",
        ].filter(Boolean).join(" ")}
        aria-live="polite"
        aria-atomic="true"
      >
        {iivoText}
      </div>

      <div
        className={`sorting-hat__disclaimer${
          phase === "waiting-answer-1" && textVisible && iivoText
            ? " sorting-hat__disclaimer--visible"
            : ""
        }`}
        aria-live="polite"
      >
        {copy.q1Disclaimer}
      </div>

      <div
        className={`sorting-hat__input-row${inputVisible && phase !== "manifesting" && phase !== "handoff" && phase !== "done" ? " sorting-hat__input-row--visible" : ""}`}
        ref={bindInteractive}
        data-onboarding-interactive=""
        onPointerDown={ensureOverlayInteractive}
      >
        <input
          ref={inputRef}
          type="text"
          className="sorting-hat__input"
          data-testid="sorting-hat-input"
          placeholder={
            phase === "waiting-name"
              ? copy.placeholderName
              : copy.placeholderAnswer
          }
          value={inputDisplayValue}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPointerDown={ensureOverlayInteractive}
          autoComplete="off"
          aria-label={copy.inputAriaLabel}
          disabled={phase === "manifesting" || phase === "handoff" || phase === "done"}
        />
        <button
          type="button"
          className="sorting-hat__submit"
          data-testid="sorting-hat-submit"
          onClick={() => handleSubmit()}
          onPointerDown={ensureOverlayInteractive}
          disabled={!inputDisplayValue.trim() || phase === "manifesting" || phase === "done"}
        >
          {copy.continueButton}
        </button>
        {voiceInput.listening ? (
          <p className="sorting-hat__voice-hint" aria-live="polite">
            {copy.voiceListeningHint}
          </p>
        ) : null}
      </div>

      {phase !== "done" && phase !== "handoff" && (
        <button
          type="button"
          className="sorting-hat__skip"
          data-testid="sorting-hat-skip"
          ref={bindInteractive}
          data-onboarding-interactive=""
          onClick={handleSkip}
          onPointerDown={ensureOverlayInteractive}
          aria-label={copy.skipAriaLabel}
        >
          {copy.skipButton}
        </button>
      )}
    </div>
  );
}
