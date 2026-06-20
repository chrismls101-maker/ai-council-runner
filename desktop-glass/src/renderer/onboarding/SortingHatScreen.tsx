/**
 * SortingHatScreen
 * ----------------
 * Full-screen first-launch onboarding. The particle swarm fills the canvas.
 * IIVO speaks to the user, asks 1-2 questions, detects persona via Claude,
 * does a dramatic reveal, then writes the result via glass-onboarding-complete.
 *
 * Phase machine:
 *   manifesting      → swarm appearing, no input
 *   waiting-name     → collecting user's name
 *   waiting-answer-1 → Q1 posed, awaiting user text
 *   processing       → Claude classifying persona
 *   waiting-answer-2 → optional Q2
 *   qa               → persona stored; user can ask about Glass or type continue
 *   qa-thinking      → IIVO answering a Glass question
 *   revealing        → dramatic persona reveal
 *   done             → fade out, call onComplete
 */

import { useEffect, useRef, useState, useCallback, useMemo, type MutableRefObject } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import SwarmScene from "./swarm/SwarmScene.tsx";
import { playIivoTtsFromBase64, applyIivoTtsPlayback, decodeMp3Base64, IIVO_TTS_PLAYBACK_RATE } from "../../shared/iivoVoiceSpec.ts";
import {
  SORTING_HAT_PAUSE_AFTER_LINE_MS,
  SORTING_HAT_PAUSE_BEFORE_NAME_MS,
  SORTING_HAT_PAUSE_BEFORE_INPUT_MS,
  SORTING_HAT_POST_MANIFEST_PAUSE_MS,
  SORTING_HAT_AFTER_LANGUAGE_PICKER_PAUSE_MS,
  SORTING_HAT_POST_PICKER_MANIFEST_MS,
  SORTING_HAT_TTS_GUARD_MS,
} from "./sortingHatTiming.ts";
import { ModeController } from "./swarm/ModeController.ts";
import { VoiceController } from "./swarm/VoiceController.ts";
import { PresenceStateMachine } from "./swarm/PresenceStateMachine.ts";
import { MODES } from "./swarm/manifestations.ts";
import { answerGlassOnboardingQuestion } from "../../shared/glassOnboardingQa.ts";
import type { GlassUiLocale } from "../../shared/glassLocale.ts";
import {
  buildPersonaPrompt,
  extractOnboardingName,
  getSortingHatCopy,
  inferPersonaFromAnswers,
  looksLikeOnboardingDone,
  powerStackSpeech,
  type PersonaId,
  type SortingHatCopy,
} from "../../shared/sortingHatCopy.ts";
import { PowerStackPaletteScreen } from "./PowerStackPaletteScreen.tsx";
import { useSortingHatVoiceInput } from "./useSortingHatVoiceInput.ts";
import { createSpeechQueue } from "./sortingHatSpeechQueue.ts";
import { OverlayGlassFrame } from "../shared/OverlayGlassFrame.tsx";
import "../shared/overlayGlassFrame.css";
import "./SortingHatScreen.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OnboardingPhase =
  | "manifesting"       // swarm appearing, intro lines playing
  | "waiting-name"      // asking for the user's name
  | "waiting-answer-1"  // persona Q1 asked, waiting for user
  | "processing"        // IIVO thinking (no input)
  | "waiting-answer-2"  // Q2 asked, waiting for user (optional)
  | "qa"                // persona determined; user can ask questions about Glass
  | "qa-thinking"       // IIVO answering a Glass question
  | "revealing"         // dramatic reveal in progress
  | "done";             // fade out

interface PersonaResult {
  persona: PersonaId;
  confidence: number;
  reveal: string;
  /** Spoken after reveal — what their power stack does for them (2–3 sentences). */
  powerStack?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Brief pause after substrate build + flash before intro voice.
 */
const REVEAL_HOLD_MS = 4_000;

function personaResultFromAnswersOrFallback(
  answers: string[],
  parsed: PersonaResult | { followUp: string } | null,
  copy: SortingHatCopy,
): PersonaResult | { followUp: string } | null {
  if (parsed) return parsed;
  return inferPersonaFromAnswers(answers, copy);
}

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
// Persona detection via ask-iivo-direct
// ---------------------------------------------------------------------------

function parsePersonaResult(raw: string): PersonaResult | { followUp: string } | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      persona?: string;
      confidence?: number;
      reveal?: string;
      powerStack?: string;
    };
    if (
      typeof parsed.persona === "string" &&
      typeof parsed.confidence === "number" &&
      typeof parsed.reveal === "string"
    ) {
      if (parsed.confidence === 0) {
        return { followUp: parsed.reveal };
      }
      const validPersonas: PersonaId[] = ["developer", "sales", "operator", "writer", "general"];
      const persona = validPersonas.includes(parsed.persona as PersonaId)
        ? (parsed.persona as PersonaId)
        : "general";
      return {
        persona,
        confidence: parsed.confidence,
        reveal: parsed.reveal,
        powerStack: typeof parsed.powerStack === "string" ? parsed.powerStack : undefined,
      };
    }
  } catch {
    // fall through
  }
  return null;
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
        // Route TTS through VoiceController's chorus+reverb FX chain (same ctx as the swarm).
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

  // Glass state — must be declared before any callbacks that reference it
  const state = useGlassState();
  const copy = useMemo(() => getSortingHatCopy(locale), [locale]);

  const [phase, setPhase] = useState<OnboardingPhase>("manifesting");
  const [iivoText, setIivoText] = useState("");
  const [textVisible, setTextVisible] = useState(false);
  const [inputVisible, setInputVisible] = useState(false);
  const [draft, setDraft] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [screenOpacity, setScreenOpacity] = useState(1);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteReveal, setPaletteReveal] = useState({ title: "", tagline: "" });
  const pendingPersonaRef = useRef<PersonaId | null>(null);
  const pendingRevealRef = useRef<PersonaResult | null>(null);

  // Track phase in a ref to avoid stale closures in async callbacks
  const phaseRef = useRef<OnboardingPhase>("manifesting");
  phaseRef.current = phase;

  // Track processed feed items and feed-length-at-ask-time
  const processedFeedIdRef = useRef<string | null>(null);
  const feedLengthAtAskRef = useRef<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const activeLineRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const processingTimerRef = useRef<number | null>(null);
  const qaThinkingTimerRef = useRef<number | null>(null);
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

  // TTS playback
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

  // Unlock audio on mount (Electron usually allows this once the window is focused).
  useEffect(() => {
    void voice.resumeContext();
  }, [voice]);

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

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

  /** Cancel pending TTS chains, timers, and stale line callbacks. */
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
    if (qaThinkingTimerRef.current) {
      window.clearTimeout(qaThinkingTimerRef.current);
      qaThinkingTimerRef.current = null;
    }
    if (processingTimerRef.current) {
      window.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
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

  const goToThinking = useCallback((): void => {
    presence.set("thinking");
    controller.setModeInstant(MODES.reasoning);
    setInputVisible(false);
    setTextVisible(false);
  }, [controller, presence]);

  // ------------------------------------------------------------------
  // QA gate — stores persona result, opens question window before reveal
  // ------------------------------------------------------------------

  const enterQa = useCallback(
    (result: PersonaResult): void => {
      if (phaseRef.current !== "processing") return;
      pendingRevealRef.current = result;
      cancelPendingSpeech();
      setPhase("qa");
      hidePromptText();
      setInputVisible(false);
      const chainId = speechChainRef.current;
      void speechQueue
        .speak(copy.qaGateLine, {
          visible: false,
          pauseAfterMs: SORTING_HAT_PAUSE_BEFORE_INPUT_MS,
        })
        .then(() => {
          if (speechChainRef.current !== chainId || phaseRef.current !== "qa") return;
          hidePromptText();
          goToListening();
        });
    },
    [speechQueue, goToListening, cancelPendingSpeech, hidePromptText, copy],
  );

  const runQaAnswerSequence = useCallback(
    (answer: string): void => {
      cancelPendingSpeech();
      const chainId = speechChainRef.current;
      hidePromptText();
      setPhase("qa-thinking");
      goToThinking();

      void speechQueue
        .script([
          { text: answer, visible: false },
          {
            text: copy.qaNudgeLine,
            visible: false,
            pauseAfterMs: SORTING_HAT_PAUSE_BEFORE_INPUT_MS,
          },
        ])
        .then(() => {
          if (speechChainRef.current !== chainId || phaseRef.current !== "qa-thinking") return;
          hidePromptText();
          setPhase("qa");
          goToListening();
        });
    },
    [speechQueue, goToThinking, goToListening, cancelPendingSpeech, hidePromptText, copy],
  );

  // ------------------------------------------------------------------
  // Reveal — declared before useEffect that calls it
  // ------------------------------------------------------------------

  const doReveal = useCallback(
    (result: PersonaResult): void => {
      cancelPendingSpeech();
      hidePromptText();
      setInputVisible(false);
      setPhase("revealing");

      const revealText =
        result.reveal && result.reveal.trim().length > 0
          ? result.reveal
          : copy.personaRevealFallbacks[result.persona];
      const chainId = speechChainRef.current;

      const finishReveal = (): void => {
        setPhase("done");
        presence.set("dissolving");
        controller.setMode(MODES.streams);
        window.setTimeout(() => setScreenOpacity(0), 400);
        window.setTimeout(() => {
          send({ type: "glass-onboarding-complete", persona: result.persona });
          onComplete();
        }, 400 + 700);
      };

      if (result.persona === "developer") {
        pendingPersonaRef.current = result.persona;
        void speechQueue
          .script([
            { text: revealText, visible: false },
            {
              text: copy.builderPaletteIntroLine,
              visible: false,
              pauseAfterMs: SORTING_HAT_PAUSE_BEFORE_INPUT_MS,
            },
          ])
          .then(() => {
            if (speechChainRef.current !== chainId || phaseRef.current !== "revealing") return;
            const [titleLine, ...rest] = revealText.split(/(?<=[.!?])\s+/);
            setPaletteReveal({
              title: titleLine.trim() || copy.paletteRevealTitle,
              tagline: rest.join(" ").trim() || copy.paletteRevealTagline,
            });
            setPhase("done");
            presence.set("listening");
            controller.setModeInstant(MODES.aperture);
            setShowPalette(true);
          });
        return;
      }

      const stackText = powerStackSpeech(result, copy);
      void speechQueue
        .script([
          { text: revealText, visible: false },
          { text: stackText, visible: false, pauseAfterMs: REVEAL_HOLD_MS },
        ])
        .then(() => {
          if (speechChainRef.current !== chainId || phaseRef.current !== "revealing") return;
          finishReveal();
        });
    },
    [controller, presence, speechQueue, cancelPendingSpeech, hidePromptText, onComplete, copy],
  );

  const proceedToReveal = useCallback((): void => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    pendingRevealRef.current = null;
    doReveal(pending);
  }, [doReveal]);

  // Called when user clicks "Enter Glass" on the palette
  const handlePaletteEnter = useCallback(() => {
    const persona = pendingPersonaRef.current ?? "developer";
    setShowPalette(false);
    presence.set("dissolving");
    controller.setMode(MODES.streams);
    window.setTimeout(() => setScreenOpacity(0), 400);
    window.setTimeout(() => {
      send({ type: "glass-onboarding-complete", persona });
      onComplete();
    }, 400 + 700);
  }, [controller, presence, onComplete]);

  // ------------------------------------------------------------------
  // Lifecycle: manifesting → Q1
  // Lines chain sequentially: each fires only after the previous TTS finishes
  // (via onLineDoneRef callback). A per-line timeout guards against TTS failure.
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // Watch commandFeed for Claude's response.
  // Feed items with kind "response" or "error" are completed AI turns.
  // We snapshot the feed length at submission time and only look at newer items.
  // ------------------------------------------------------------------

  useEffect(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase !== "processing") return;

    const feed = state.commandFeed;
    if (!feed || feed.length === 0) return;

    // Only consider items that appeared after we sent the ask
    const newItems = feed.slice(feedLengthAtAskRef.current);
    // Find the most recent response or error item we haven't processed
    const responseItem = [...newItems].reverse().find(
      (item) =>
        (item.kind === "response" || item.kind === "error") &&
        item.id !== processedFeedIdRef.current,
    );
    if (!responseItem) return;

    if (processingTimerRef.current) {
      window.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }

    processedFeedIdRef.current = responseItem.id;

    const rawText = responseItem.fullBody ?? responseItem.body ?? "";
    const parsed =
      responseItem.kind === "error"
        ? null
        : parsePersonaResult(rawText);
    const result = personaResultFromAnswersOrFallback(answers, parsed, copy);

    if (!result) {
      enterQa({ persona: "general", confidence: 0.5, reveal: copy.personaRevealFallbacks.general });
      return;
    }

    if ("followUp" in result && answers.length < 2) {
      const followUpText = result.followUp;
      setPhase("waiting-answer-2");
      const chainId = speechChainRef.current;
      void speechQueue
        .speak(followUpText, {
          pauseAfterMs: SORTING_HAT_PAUSE_BEFORE_INPUT_MS,
        })
        .then(() => {
          if (speechChainRef.current !== chainId || phaseRef.current !== "waiting-answer-2") return;
          goToListening();
        });
    } else if ("followUp" in result) {
      // Hit the 2-question cap — use general
      enterQa({ persona: "general", confidence: 0.5, reveal: copy.personaRevealFallbacks.general });
    } else {
      enterQa(result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.commandFeed]);

  // ------------------------------------------------------------------
  // Submit handler
  // ------------------------------------------------------------------

  const handleSubmit = useCallback((overrideText?: string): void => {
    const trimmed = (overrideText ?? draft).trim();
    if (!trimmed) return;
    const currentPhase = phaseRef.current;

    // ── Name collection ────────────────────────────────────────────────
    if (currentPhase === "waiting-name") {
      const firstName = extractOnboardingName(trimmed, locale);
      setPersonaName(trimmed);
      setDraft("");
      setInputVisible(false);

      // Persist name to GlassUserProfile immediately so greeting works
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

    // ── QA gate — user asking questions about Glass or saying "continue" ──
    if (currentPhase === "qa" || currentPhase === "qa-thinking") {
      setDraft("");
      if (looksLikeOnboardingDone(trimmed, locale)) {
        proceedToReveal();
        return;
      }
      if (currentPhase === "qa-thinking") return;
      runQaAnswerSequence(answerGlassOnboardingQuestion(trimmed, locale));
      return;
    }

    // ── Persona answers ────────────────────────────────────────────────
    if (
      currentPhase !== "waiting-answer-1" &&
      currentPhase !== "waiting-answer-2"
    ) {
      return;
    }

    const nextAnswers = [...answers, trimmed];
    setAnswers(nextAnswers);
    setDraft("");

    // Persist persona answers into the user profile for context personalization.
    if (currentPhase === "waiting-answer-1") {
      send({
        type: "update-glass-profile",
        profile: {
          name: personaName || state.glassUserProfile?.name || "",
          usualWork: trimmed,
          currentFocus: state.glassUserProfile?.currentFocus ?? "",
        },
      });
    } else {
      send({
        type: "update-glass-profile",
        profile: {
          name: personaName || state.glassUserProfile?.name || "",
          usualWork: nextAnswers[0] ?? state.glassUserProfile?.usualWork ?? "",
          currentFocus: trimmed,
        },
      });
    }

    goToThinking();
    setPhase("processing");

    const localPersona = inferPersonaFromAnswers(nextAnswers, copy);
    if (localPersona) {
      if (processingTimerRef.current) {
        window.clearTimeout(processingTimerRef.current);
      }
      processingTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== "processing") return;
        enterQa(localPersona);
      }, 700);
      return;
    }

    if (processingTimerRef.current) {
      window.clearTimeout(processingTimerRef.current);
    }
    processingTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== "processing") return;
      const fallback =
        inferPersonaFromAnswers(answers, copy) ??
        { persona: "general" as const, confidence: 0.5, reveal: copy.personaRevealFallbacks.general };
      enterQa(fallback);
    }, 45_000);

    // Snapshot the current feed length so we only look at items that arrive
    // after we fire the ask.
    feedLengthAtAskRef.current = state.commandFeed.length;

    // Build prompt and send to Claude via ask-iivo-direct.
    // The response will appear as a new "response" kind item in commandFeed.
    const prompt = buildPersonaPrompt(nextAnswers, locale);
    send({ type: "ask-iivo-direct", text: prompt });
  }, [draft, answers, personaName, locale, copy, goToThinking, goToListening, showInput, showText, speechQueue, runQaAnswerSequence, proceedToReveal, enterQa, state.commandFeed.length, state.glassUserProfile]);

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  const voiceInput = useSortingHatVoiceInput({
    locale,
    phase,
    enabled:
      inputVisible &&
      phase !== "processing" &&
      phase !== "qa-thinking" &&
      phase !== "revealing" &&
      phase !== "done",
    onDraft: setDraft,
    onAutoSubmit: (text) => handleSubmitRef.current(text),
  });

  const inputDisplayValue = voiceInput.interimText || draft;

  // ------------------------------------------------------------------
  // Skip
  // ------------------------------------------------------------------

  const handleSkip = useCallback((): void => {
    send({ type: "glass-onboarding-skip" });
    setScreenOpacity(0);
    window.setTimeout(onComplete, 700);
  }, [onComplete]);

  // ------------------------------------------------------------------
  // Key handler for input
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div
      ref={rootRef}
      className="sorting-hat"
      data-testid="sorting-hat-screen"
      style={{ opacity: screenOpacity, transition: "opacity 0.7s ease" }}
    >
      {/* Light frosted veil — desktop still visible, not fully bare */}
      <div className="sorting-hat__veil" aria-hidden="true" />

      {/* Screen-edge brackets */}
      <OverlayGlassFrame className="sorting-hat__frame" />

      {/* Particle swarm — full framed area */}
      <div className="sorting-hat__swarm">
        <SwarmScene
          controller={controller}
          voice={voice}
          presence={presence}
          transparentOverlay
        />
      </div>

      {/* IIVO text — Q1 phase gets a card-style treatment */}
      <div
        className={[
          "sorting-hat__text",
          textVisible && iivoText ? "sorting-hat__text--visible" : "",
          (phase === "waiting-answer-1" || phase === "waiting-answer-2") ? "sorting-hat__text--q1" : "",
        ].filter(Boolean).join(" ")}
        aria-live="polite"
        aria-atomic="true"
      >
        {iivoText}
      </div>

      {/* Disclaimer — fades in with the Q1 prompt card */}
      <div
        className={`sorting-hat__disclaimer${
          (phase === "waiting-answer-1" || phase === "waiting-answer-2") && textVisible && iivoText
            ? " sorting-hat__disclaimer--visible"
            : ""
        }`}
        aria-live="polite"
      >
        {copy.q1Disclaimer}
      </div>

      {/* Input row — only visible when waiting */}
      <div
        className={`sorting-hat__input-row${inputVisible && phase !== "manifesting" && phase !== "processing" && phase !== "qa-thinking" && phase !== "revealing" && phase !== "done" ? " sorting-hat__input-row--visible" : ""}`}
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
              : phase === "qa"
                ? copy.placeholderQa
                : copy.placeholderAnswer
          }
          value={inputDisplayValue}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPointerDown={ensureOverlayInteractive}
          autoComplete="off"
          aria-label={copy.inputAriaLabel}
          disabled={phase === "manifesting" || phase === "processing" || phase === "qa-thinking" || phase === "revealing" || phase === "done"}
        />
        <button
          type="button"
          className="sorting-hat__submit"
          data-testid="sorting-hat-submit"
          onClick={() => handleSubmit()}
          onPointerDown={ensureOverlayInteractive}
          disabled={!inputDisplayValue.trim() || phase === "manifesting" || phase === "processing" || phase === "qa-thinking" || phase === "revealing" || phase === "done"}
        >
          {copy.continueButton}
        </button>
        {voiceInput.listening ? (
          <p className="sorting-hat__voice-hint" aria-live="polite">
            {copy.voiceListeningHint}
          </p>
        ) : null}
      </div>

      {/* Skip button — always visible until done */}
      {phase !== "done" && (
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

      {/* Power Stack Palette — shown for Builder persona after reveal */}
      {showPalette && (
        <PowerStackPaletteScreen
          onEnterGlass={handlePaletteEnter}
          copy={copy}
          revealTitle={paletteReveal.title || copy.paletteRevealTitle}
          revealTagline={paletteReveal.tagline || copy.paletteRevealTagline}
        />
      )}
    </div>
  );
}
