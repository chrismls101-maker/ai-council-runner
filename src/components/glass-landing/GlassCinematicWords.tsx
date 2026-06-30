import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";
import {
  ALETHEIA_CINEMA_BRIDGE_AFTER_LAYER,
  ALETHEIA_CINEMA_SCENE_LINES,
  ALETHEIA_CINEMA_FINALE_LINES,
  ALETHEIA_GLASS_LINE_1,
  ALETHEIA_GLASS_LINE_2,
  speakAletheiaLine,
  speakAletheiaSequence,
  prefetchAletheiaLines,
  stopAletheiaSpeak,
  unlockAletheiaAudio,
  type AletheiaSpeakOptions,
  type AletheiaVoiceProfile,
} from "./glassIntroAletheiaSpeak";
import {
  duckIntroMusic,
  duckIntroMusicForPresentation,
  fadeOutIntroMusic,
  resetIntroMusicPresentationDuck,
  restoreIntroMusic,
} from "./glassIntroBootSound";

export type BeatSpeakLine = AletheiaSpeakOptions & {
  /** Reveal this beat on screen immediately before this line is spoken. */
  revealBefore?: boolean;
};

export type CinematicBeat =
  | string
  | {
      display: string;
      speak?: string | BeatSpeakLine | readonly BeatSpeakLine[];
      tone?: AletheiaVoiceProfile;
    };

type CinematicScene =
  | { kind: "line"; text: string }
  | {
      kind: "beats";
      beats: readonly CinematicBeat[];
      holdScale?: number;
      outScale?: number;
      bridgeAfter?: {
        speak: string;
        tone?: AletheiaVoiceProfile;
        audioId?: string;
        /** Silence after scene fades, before bridge line. */
        prePauseMs?: number;
        pauseMs?: number;
      };
      interGapMs?: number;
      enterMs?: number;
      /** One word at a time — zoom toward viewer (Memory / Voice, or all beats). */
      focusZoom?: boolean;
      /** Every beat uses screen-forward zoom (Read / Listen / Build). */
      focusForwardAll?: boolean;
      /** Hold after last beat before fade-out (focus scenes stay tight). */
      postHoldMs?: number;
      /** Larger single-line hero phrases (Always on top / Always yours). */
      heroPhrase?: boolean;
    }
  | { kind: "finale"; text: string };

export const CINEMATIC_SCENES: readonly CinematicScene[] = [
  { kind: "line", text: "Not another tab." },
  {
    kind: "beats",
    beats: [
      {
        display: "Every window.",
        speak: { text: "Every window,", profile: "cinemaFelt", audioId: "every-window" },
      },
      {
        display: "One layer.",
        speak: { text: "One layer.", profile: "cinemaEmphasis", audioId: "one-layer", emphasis: 0.5 },
      },
    ],
    holdScale: 1.15,
    bridgeAfter: {
      speak: ALETHEIA_CINEMA_BRIDGE_AFTER_LAYER,
      tone: "cinemaEmphasis",
      audioId: "above-it-all",
      prePauseMs: 640,
      pauseMs: 880,
    },
  },
  {
    kind: "beats",
    focusZoom: true,
    beats: [
      {
        display: "Agents.",
        speak: [
          { text: "Agents...", profile: "cinemaSoft", audioId: "agents" },
          { text: "Orchestrated.", profile: "cinemaEmphasis", audioId: "orchestrated", emphasis: 0.85 },
        ],
      },
      {
        display: "Memory.",
        speak: [
          { text: "Memory...", profile: "cinemaSoft", audioId: "memory" },
          { text: "They can't match.", profile: "cinemaEmphasis", audioId: "memory-payoff", emphasis: 0.9 },
        ],
      },
      {
        display: "Voice.",
        speak: [
          { text: "Voice...", profile: "cinemaSoft", audioId: "voice" },
          { text: "Across your Mac.", profile: "cinemaEmphasis", audioId: "voice-payoff", emphasis: 0.85 },
        ],
      },
    ],
    enterMs: 640,
    postHoldMs: 180,
    interGapMs: 140,
  },
  {
    kind: "beats",
    focusZoom: true,
    focusForwardAll: true,
    beats: [
      {
        display: "Read.",
        speak: [
          { text: "I reed...", profile: "cinemaSoft", audioId: "read-1" },
          { text: "Every app. One understanding.", profile: "cinemaEmphasis", audioId: "read-2", emphasis: 0.9 },
        ],
      },
      {
        display: "Listen.",
        speak: [
          { text: "I listen...", profile: "cinemaSoft", audioId: "listen-1" },
          { text: "To what you allow. Carried forward.", profile: "cinemaEmphasis", audioId: "listen-2", emphasis: 0.85 },
        ],
      },
      {
        display: "Build.",
        speak: [
          { text: "I build.", profile: "cinemaFelt", audioId: "build-1", emphasis: 0.4 },
          { text: "Intelligence.", profile: "cinemaEmphasis", audioId: "build-2", emphasis: 0.95 },
          { text: "You own it.", profile: "cinemaEmphasis", audioId: "build-3", emphasis: 1 },
          { text: "I create it.", profile: "cinemaEmphasis", audioId: "build-4", emphasis: 0.9 },
          { text: "It is yours.", profile: "cinemaEmphasis", audioId: "build-5", emphasis: 1 },
          { text: "Intelligence that compounds.", profile: "cinemaEmphasis", audioId: "build-6", emphasis: 0.95 },
        ],
      },
    ],
    postHoldMs: 320,
    interGapMs: 140,
  },
  {
    kind: "beats",
    heroPhrase: true,
    beats: [
      {
        display: "Always on top.",
        speak: [
          { text: "Intelligence...", profile: "cinemaSoft", audioId: "intelligence" },
          {
            text: "Always on top.",
            profile: "cinemaEmphasis",
            audioId: "always-on-top",
            emphasis: 1,
            revealBefore: true,
          },
        ],
      },
    ],
    holdScale: 1.35,
    outScale: 1.15,
    interGapMs: 180,
  },
  {
    kind: "beats",
    heroPhrase: true,
    beats: [
      {
        display: "Always yours.",
        speak: [
          { text: "Glass...", profile: "cinemaSoft", audioId: "glass" },
          {
            text: "Always yours.",
            profile: "cinemaEmphasis",
            audioId: "always-yours",
            emphasis: 1,
            revealBefore: true,
          },
        ],
      },
    ],
    holdScale: 1.35,
    outScale: 1.15,
    interGapMs: 200,
  },
  { kind: "finale", text: "INTELLIGENT GLASS" },
] as const;

export const FINALE_PHRASE = CINEMATIC_SCENES[CINEMATIC_SCENES.length - 1].kind === "finale"
  ? (CINEMATIC_SCENES[CINEMATIC_SCENES.length - 1] as Extract<CinematicScene, { kind: "finale" }>).text
  : "INTELLIGENT GLASS";

export const FINALE_SUBTITLE =
  "The AI-Native Computing Layer Above Your MacOS — World Class Memory across every app you use.";

type Phase = "in" | "hold" | "out" | "finale" | "rest";

type GlassCinematicWordsProps = {
  scenes?: readonly CinematicScene[];
  phraseMs?: number;
  className?: string;
  fullscreen?: boolean;
  loop?: boolean;
  active?: boolean;
  startSceneIndex?: number;
  entryDelayMs?: number;
  aletheiaVoice?: boolean;
  onComplete?: () => void;
};

const CINEMA_FADE_IN_MS = 1150;
const CINEMA_FADE_OUT_MS = 900;
const CINEMA_BEAT_ENTER_MS = 520;
const CINEMA_DEFAULT_INTER_GAP_MS = 200;
const SCENE_HOLD_BASE_MS = 580;
const FINALE_REST_HOLD_MS = 1400;
const FOCUS_ZOOM_OUT_MS = 420;
const FOCUS_MOMENT_MS = 160;
const FOCUS_AGENTS_TAIL_MS = 320;
const PRESENTATION_BREATH_GAP_MS = 100;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isBeatSceneConfig(
  scene: CinematicScene,
): scene is Extract<CinematicScene, { kind: "beats" }> {
  return scene.kind === "beats";
}

function beatDisplay(beat: CinematicBeat): string {
  return typeof beat === "string" ? beat : beat.display;
}

function beatSpeakLines(beat: CinematicBeat): BeatSpeakLine[] {
  if (typeof beat === "string") {
    return [{ text: beat, profile: "cinema" }];
  }
  const defaultProfile = beat.tone ?? "cinemaFelt";
  if (Array.isArray(beat.speak)) {
    return beat.speak.map((line) =>
      typeof line === "string"
        ? { text: line, profile: defaultProfile }
        : { profile: defaultProfile, ...line },
    );
  }
  if (typeof beat.speak === "object" && beat.speak !== null && "text" in beat.speak) {
    return [{ profile: defaultProfile, ...beat.speak }];
  }
  if (beat.speak) {
    return [{ text: beat.speak, profile: defaultProfile }];
  }
  return [{ text: beat.display, profile: defaultProfile }];
}

function shouldRevealBeat(
  line: BeatSpeakLine,
  lineIndex: number,
  lines: BeatSpeakLine[],
): boolean {
  if (line.revealBefore === true) return true;
  if (line.revealBefore === false) return false;
  if (lines.length === 1) return true;
  if (lines.some((entry) => entry.revealBefore === true)) return false;
  return lineIndex === lines.length - 1;
}

function sceneFullText(scene: CinematicScene): string {
  if (scene.kind === "beats") return scene.beats.map(beatDisplay).join(" ");
  return scene.text;
}

function getSegmentClasses(
  beatIndex: number,
  isFocusZoom: boolean,
  focusedBeat: number | null,
  exitingBeat: number | null,
  focusMotion: "armed" | "in" | "out" | null,
  revealedBeats: number | null,
  focusForwardAll: boolean,
): string[] {
  if (isFocusZoom) {
    if (beatIndex === exitingBeat) {
      return ["glass-cinema-words__segment--focus-exiting", "glass-cinema-words__segment--focus-zoom-out"];
    }
    if (focusedBeat === null) {
      return ["glass-cinema-words__segment--focus-past"];
    }
    if (beatIndex === focusedBeat) {
      if (beatIndex === 0 && !focusForwardAll) {
        return ["glass-cinema-words__segment--focus-intro"];
      }
      if (focusMotion === "armed") return ["glass-cinema-words__segment--focus-armed"];
      if (focusMotion === "out") return ["glass-cinema-words__segment--focus-zoom-out"];
      return ["glass-cinema-words__segment--focus-zoom-in"];
    }
    if (beatIndex < focusedBeat) return ["glass-cinema-words__segment--focus-past"];
    return ["glass-cinema-words__segment--pending"];
  }

  const classes: string[] = [];
  if (revealedBeats === null || beatIndex > revealedBeats) {
    classes.push("glass-cinema-words__segment--pending");
  }
  if (revealedBeats !== null && beatIndex === revealedBeats) {
    classes.push("glass-cinema-words__segment--in");
  }
  if (revealedBeats !== null && beatIndex < revealedBeats) {
    classes.push("glass-cinema-words__segment--shown");
  }
  return classes;
}

export const CINEMATIC_PHRASES = CINEMATIC_SCENES.map((scene) => sceneFullText(scene)) as readonly string[];

function renderLineLayers(text: string): JSX.Element {
  return (
    <>
      <span className="glass-cinema-words__led" aria-hidden="true">
        {text}
      </span>
      <span className="glass-cinema-words__glass">{text}</span>
      <span className="glass-cinema-words__frost" aria-hidden="true">
        {text}
      </span>
      <span className="glass-cinema-words__shine" aria-hidden="true">
        {text}
      </span>
    </>
  );
}

export default function GlassCinematicWords({
  scenes = CINEMATIC_SCENES,
  phraseMs = 2000,
  className = "",
  fullscreen = false,
  loop = false,
  active = true,
  startSceneIndex = 0,
  entryDelayMs = 0,
  aletheiaVoice = false,
  onComplete,
}: GlassCinematicWordsProps): JSX.Element {
  const [started, setStarted] = useState(active && entryDelayMs === 0);
  const [index, setIndex] = useState(startSceneIndex);
  const [revealedBeats, setRevealedBeats] = useState<number | null>(null);
  const [focusedBeat, setFocusedBeat] = useState<number | null>(null);
  const [exitingBeat, setExitingBeat] = useState<number | null>(null);
  const [focusMotion, setFocusMotion] = useState<"armed" | "in" | "out" | null>(null);
  const [phase, setPhase] = useState<Phase>("in");
  const stageRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const sceneRunRef = useRef(0);
  const wasActiveRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const speakAletheiaRef = useRef<
    (input: string | AletheiaSpeakOptions, opts?: { beginPresentation?: boolean }) => Promise<void>
  >(() => Promise.resolve());

  const beginPresentationVoice = (): void => {
    if (!aletheiaVoice) return;
    duckIntroMusicForPresentation(0.3, 1400);
    document.documentElement.classList.add("glass-intro-aletheia-speaking");
  };

  const speakAletheia = async (
    input: string | AletheiaSpeakOptions,
    opts: { beginPresentation?: boolean } = {},
  ): Promise<void> => {
    if (!aletheiaVoice) return;
    if (opts.beginPresentation) beginPresentationVoice();

    const line = typeof input === "string" ? { text: input, profile: "cinema" as const } : input;
    if (!line.text.trim()) return;
    await speakAletheiaLine(line);
  };

  const speakBeatLines = async (
    beatIdx: number,
    lines: BeatSpeakLine[],
    opts: { beginPresentation?: boolean; onReveal?: () => void } = {},
  ): Promise<void> => {
    if (!aletheiaVoice) return;
    if (opts.beginPresentation) beginPresentationVoice();

    let revealed = false;
    const breathGap =
      lines.length > 4 ? 118 : lines.length > 1 ? PRESENTATION_BREATH_GAP_MS : 0;
    await speakAletheiaSequence(
      lines.map((line, lineIdx) => ({
        ...line,
        onStart: () => {
          if (!revealed && shouldRevealBeat(line, lineIdx, lines)) {
            opts.onReveal?.();
            setRevealedBeats(beatIdx);
            revealed = true;
          }
        },
      })),
      { breathGapMs: breathGap },
    );

    if (!revealed && lines.length > 0) {
      opts.onReveal?.();
      setRevealedBeats(beatIdx);
    }
  };

  speakAletheiaRef.current = speakAletheia;

  useEffect(() => {
    if (!active) {
      setStarted(false);
      return;
    }

    if (entryDelayMs <= 0) {
      setStarted(true);
      setIndex(startSceneIndex);
      setRevealedBeats(null);
      setFocusedBeat(null);
      setExitingBeat(null);
      setFocusMotion(null);
      setPhase("in");
      return;
    }

    setStarted(false);
    setRevealedBeats(null);
    setFocusedBeat(null);
    setExitingBeat(null);
    const timer = window.setTimeout(() => {
      setIndex(startSceneIndex);
      setRevealedBeats(null);
      setFocusedBeat(null);
      setExitingBeat(null);
      setFocusMotion(null);
      setPhase("in");
      setStarted(true);
    }, entryDelayMs);

    return () => window.clearTimeout(timer);
  }, [active, entryDelayMs, startSceneIndex]);

  const scene = started ? scenes[index] : undefined;
  const isBeatScene = scene?.kind === "beats";
  const isFocusZoomScene = scene?.kind === "beats" && scene.focusZoom === true;
  const focusForwardAll = scene?.kind === "beats" && scene.focusForwardAll === true;
  const isForwardActive =
    focusedBeat !== null && (focusForwardAll || focusedBeat > 0);
  const isFinalScene = scene?.kind === "finale";
  const isHeroPhrase = scene?.kind === "beats" && scene.heroPhrase === true;
  const beats = scene?.kind === "beats" ? scene.beats : [];

  useEffect(() => {
    if (!started || !aletheiaVoice) return;
    void unlockAletheiaAudio();
    restoreIntroMusic(1400);
    const unlock = (): void => {
      void unlockAletheiaAudio();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [started, aletheiaVoice]);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      return;
    }
    if (!wasActiveRef.current) return;
    stopAletheiaSpeak();
    resetIntroMusicPresentationDuck();
    document.documentElement.classList.remove("glass-intro-aletheia-speaking");
  }, [active]);

  useEffect(() => {
    if (!started || !scene) return;

    const runId = sceneRunRef.current + 1;
    sceneRunRef.current = runId;
    let cancelled = false;

    const isCurrentRun = (): boolean => !cancelled && sceneRunRef.current === runId;

    const runScene = async (): Promise<void> => {
      if (isFinalScene) {
        setPhase("finale");
        if (aletheiaVoice) {
          duckIntroMusic(0.36, 900);
          document.documentElement.classList.add("glass-intro-aletheia-speaking");
          try {
            await speakAletheiaSequence(
              [
                { ...ALETHEIA_CINEMA_FINALE_LINES[0], audioId: "intelligent-glass", emphasis: 0.95 },
                {
                  text: ALETHEIA_GLASS_LINE_1,
                  profile: "cinemaFinale",
                  audioId: "glass-welcome-1",
                  emphasis: 0.7,
                },
                {
                  text: ALETHEIA_GLASS_LINE_2,
                  profile: "cinemaFinale",
                  audioId: "glass-welcome-2",
                  emphasis: 1,
                  onStart: () => fadeOutIntroMusic(3600),
                },
              ],
              { breathGapMs: 120 },
            );
          } finally {
            document.documentElement.classList.remove("glass-intro-aletheia-speaking");
          }
          if (!isCurrentRun()) return;
          await delay(FINALE_REST_HOLD_MS);
        } else {
          await delay(3600);
        }
        if (!isCurrentRun()) return;
        setPhase("rest");
        onCompleteRef.current?.();
        return;
      }

      if (isBeatSceneConfig(scene)) {
        const enterMs = scene.enterMs ?? CINEMA_BEAT_ENTER_MS;
        const holdMs = Math.round(SCENE_HOLD_BASE_MS * (scene.holdScale ?? 1));
        const outMs = Math.round(CINEMA_FADE_OUT_MS * (scene.outScale ?? 1));
        const beatCount = scene.beats.length;
        if (aletheiaVoice) {
          beginPresentationVoice();
          if (scene.focusZoom) {
            prefetchAletheiaLines(beatSpeakLines(scene.beats[0]));
          } else {
            const openerLines = scene.beats.flatMap((beat) => beatSpeakLines(beat));
            prefetchAletheiaLines(openerLines);
          }
        }

        setRevealedBeats(null);
        setFocusedBeat(null);
        setExitingBeat(null);
        setPhase("in");
        await delay(enterMs);
        if (!isCurrentRun()) return;
        setPhase("hold");

        if (!scene.focusZoom && beatCount > 0) {
          setRevealedBeats(0);
        }

        if (scene.focusZoom) {
          const forwardAll = scene.focusForwardAll === true;
          const startBeat = forwardAll ? 0 : 1;

          const runForwardBeat = async (beatIdx: number): Promise<void> => {
            const lines = beatSpeakLines(scene.beats[beatIdx]);

            if (beatIdx > 0) setExitingBeat(beatIdx - 1);
            setFocusedBeat(beatIdx);
            setRevealedBeats(beatIdx);
            setFocusMotion("armed");
            await nextFrame();
            setFocusMotion("in");

            if (aletheiaVoice) {
              await speakBeatLines(beatIdx, lines);
            } else {
              await delay(Math.round(phraseMs * 0.35 * Math.max(lines.length, 1)));
            }
            if (!isCurrentRun()) return;

            await delay(FOCUS_MOMENT_MS + Math.max(0, lines.length - 1) * 125);
            if (!isCurrentRun()) return;

            if (aletheiaVoice && beatIdx + 1 < beatCount) {
              prefetchAletheiaLines(beatSpeakLines(scene.beats[beatIdx + 1]));
            }

            setFocusMotion("out");
            setExitingBeat(beatIdx);
            await delay(FOCUS_ZOOM_OUT_MS);
            if (!isCurrentRun()) return;
            setExitingBeat(null);
            setFocusMotion(null);
          };

          if (!forwardAll) {
            setFocusedBeat(0);
            setRevealedBeats(0);
            setFocusMotion(null);
            await nextFrame();

            if (aletheiaVoice) {
              await speakBeatLines(0, beatSpeakLines(scene.beats[0]));
            } else {
              await delay(Math.round(phraseMs * 0.45));
            }
            if (!isCurrentRun()) return;
            await delay(FOCUS_AGENTS_TAIL_MS);
            if (!isCurrentRun()) return;
            prefetchAletheiaLines(beatSpeakLines(scene.beats[1]));
          }

          for (let beatIdx = startBeat; beatIdx < beatCount; beatIdx += 1) {
            await runForwardBeat(beatIdx);
            if (!isCurrentRun()) return;
          }

          setFocusedBeat(null);
          setRevealedBeats(null);
          setExitingBeat(null);
          setFocusMotion(null);
        } else {
          const sequenceItems: Array<BeatSpeakLine & { onStart?: () => void }> = [];
          for (let beatIdx = 0; beatIdx < beatCount; beatIdx += 1) {
            const lines = beatSpeakLines(scene.beats[beatIdx]);
            lines.forEach((line, lineIdx) => {
              sequenceItems.push({
                ...line,
                onStart: () => {
                  if (shouldRevealBeat(line, lineIdx, lines)) {
                    setRevealedBeats(beatIdx);
                  }
                },
              });
            });
          }

          if (aletheiaVoice) {
            await speakAletheiaSequence(sequenceItems, { breathGapMs: PRESENTATION_BREATH_GAP_MS });
          } else {
            const staggerMs = Math.round((phraseMs * 1.1) / Math.max(beatCount, 1));
            await delay(staggerMs * Math.max(sequenceItems.length, 1));
            setRevealedBeats(beatCount - 1);
          }

          if (!isCurrentRun()) return;
          setRevealedBeats((current) =>
            current === null ? beatCount - 1 : Math.max(current, beatCount - 1),
          );

          if (!isCurrentRun()) return;
        }

        await delay(scene.postHoldMs ?? (scene.focusZoom ? 200 : holdMs));
        if (!isCurrentRun()) return;

        setPhase("out");
        await delay(scene.focusZoom ? Math.round(outMs * 0.72) : outMs);
        if (!isCurrentRun()) return;

        setRevealedBeats(null);
        setFocusedBeat(null);
        setExitingBeat(null);
        setFocusMotion(null);

        if (scene.bridgeAfter) {
          await delay(scene.bridgeAfter.prePauseMs ?? 640);
          if (!isCurrentRun()) return;
          if (aletheiaVoice) {
            await speakAletheiaRef.current({
              text: scene.bridgeAfter.speak,
              profile: scene.bridgeAfter.tone ?? "cinemaFelt",
              audioId: scene.bridgeAfter.audioId,
            });
          }
          await delay(scene.bridgeAfter.pauseMs ?? 880);
        } else {
          await delay(scene.interGapMs ?? CINEMA_DEFAULT_INTER_GAP_MS);
        }

        if (!isCurrentRun()) return;
        if (loop) setIndex(startSceneIndex);
        else setIndex((current) => current + 1);
        return;
      }

      if (scene.kind === "line") {
        const fadeMs = CINEMA_FADE_IN_MS;
        const holdMs = Math.round(phraseMs * 0.38);
        const outMs = CINEMA_FADE_OUT_MS;

        setRevealedBeats(null);
        setPhase("in");
        await delay(Math.round(fadeMs * 0.45));
        if (!isCurrentRun()) return;
        setPhase("hold");

        if (aletheiaVoice) {
          await speakAletheiaRef.current(ALETHEIA_CINEMA_SCENE_LINES[index] ?? scene.text, {
            beginPresentation: true,
          });
        } else {
          await delay(holdMs);
        }

        if (!isCurrentRun()) return;
        await delay(aletheiaVoice ? SCENE_HOLD_BASE_MS : 0);
        setPhase("out");
        await delay(outMs);
        if (!isCurrentRun()) return;

        if (loop) setIndex(startSceneIndex);
        else setIndex((current) => current + 1);
      }
    };

    void runScene();

    return () => {
      cancelled = true;
    };
  }, [
    started,
    index,
    phraseMs,
    loop,
    startSceneIndex,
    aletheiaVoice,
  ]);

  const visibleText = isBeatScene
    ? revealedBeats === null
      ? ""
      : beats.slice(0, revealedBeats + 1).map(beatDisplay).join(" ")
    : scene?.kind === "line"
      ? scene.text
      : scene?.kind === "finale"
        ? scene.text
        : "";
  const sizingText = scene ? sceneFullText(scene) : visibleText;
  const isLongPhrase = sizingText.length > 44;
  const isMediumPhrase = !isFinalScene && sizingText.length > 26 && !isLongPhrase;
  const showSubtitle = isFinalScene && (phase === "finale" || phase === "rest");

  useLayoutEffect(() => {
    if (!started) return;

    const stage = stageRef.current;
    const line = lineRef.current;
    if (!stage || !line) return;

    const fitLine = (): void => {
      const fitWrap = line.parentElement;
      if (!(fitWrap instanceof HTMLElement)) return;

      fitWrap.style.setProperty("--line-fit-scale", "1");
      const available = stage.clientWidth;
      const needed = line.scrollWidth;
      if (available <= 0 || needed <= 0) return;

      const scale = needed > available ? available / needed : 1;
      fitWrap.style.setProperty("--line-fit-scale", String(scale));
    };

    fitLine();

    const observer = new ResizeObserver(fitLine);
    observer.observe(stage);
    observer.observe(line);

    return () => observer.disconnect();
  }, [started, index, sizingText, isBeatScene, revealedBeats, focusedBeat, exitingBeat, focusMotion]);

  if (!started || !scene) {
    return (
      <div
        className={["glass-cinema-words", "glass-cinema-words--idle", className].filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        <div className="glass-cinema-words__stage" ref={stageRef} />
      </div>
    );
  }

  const lineClassName = [
    "glass-cinema-words__line",
    `glass-cinema-words__line--${phase}`,
    isFinalScene ? "glass-cinema-words__line--finale-phrase" : "",
    isHeroPhrase ? "glass-cinema-words__line--hero-phrase" : "",
    isBeatScene ? "glass-cinema-words__line--stagger" : "",
    isLongPhrase ? "glass-cinema-words__line--long" : "",
    isMediumPhrase ? "glass-cinema-words__line--medium" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={[
        "glass-cinema-words",
        fullscreen ? "glass-cinema-words--fullscreen" : "",
        phase === "rest" ? "glass-cinema-words--resting" : "",
        isBeatScene ? "glass-cinema-words--beats" : "",
        isFocusZoomScene ? "glass-cinema-words--focus-zoom" : "",
        isForwardActive ? "glass-cinema-words--focus-forward" : "",
        focusMotion === "in" && isForwardActive ? "glass-cinema-words--focus-on-screen" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="glass-cinema-words__stage" ref={stageRef}>
        {isFinalScene && (phase === "finale" || phase === "rest") ? (
          <div
            className={[
              "glass-cinema-words__finale-bloom",
              phase === "rest" ? "glass-cinema-words__finale-bloom--rest" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          />
        ) : null}
        <div
          className={[
            "glass-cinema-words__line-fit",
            isBeatScene ? "glass-cinema-words__line-fit--stagger" : "",
            isFocusZoomScene ? "glass-cinema-words__line-fit--focus-zoom" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {isBeatScene ? (
            <p ref={lineRef} key={index} className={lineClassName}>
              {beats.map((beat, beatIndex) => {
                const isForwardBeat =
                  isFocusZoomScene && (focusForwardAll || beatIndex > 0);
                const segmentClasses = [
                  ...getSegmentClasses(
                    beatIndex,
                    isFocusZoomScene,
                    focusedBeat,
                    exitingBeat,
                    focusMotion,
                    revealedBeats,
                    focusForwardAll,
                  ),
                  isForwardBeat && focusedBeat === beatIndex
                    ? "glass-cinema-words__segment--focus-forward"
                    : "",
                ].filter(Boolean);
                const isHidden = segmentClasses.some(
                  (name) =>
                    name.endsWith("--pending") ||
                    name.endsWith("--focus-past"),
                );

                return (
                  <span
                    key={`${index}-${beatIndex}`}
                    className={["glass-cinema-words__segment", ...segmentClasses].join(" ")}
                    aria-hidden={isHidden}
                  >
                    {renderLineLayers(beatDisplay(beat))}
                  </span>
                );
              })}
            </p>
          ) : (
            <p
              ref={lineRef}
              key={isFinalScene ? FINALE_PHRASE : `${index}-${visibleText}`}
              className={lineClassName}
            >
              {renderLineLayers(visibleText)}
            </p>
          )}
        </div>
      </div>
      <p
        className={[
          "iivo-hero__subtitle",
          showSubtitle ? "iivo-hero__subtitle--visible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {FINALE_SUBTITLE}
      </p>
      {fullscreen ? <div className="glass-cinema-words__grain" aria-hidden="true" /> : null}
    </div>
  );
}
