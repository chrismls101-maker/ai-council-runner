import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";
import { detectGlassBrowseDevice, isGlassBrowseMobile } from "./glassBrowseDevice";
import {
  speakAletheiaLine,
  speakAletheiaLines,
  stopAletheiaSpeak,
  unlockAletheiaAudio,
  ALETHEIA_GLASS_LINE_1,
  ALETHEIA_GLASS_LINE_2,
  ALETHEIA_TERMINAL_DEMO,
} from "./glassIntroAletheiaSpeak";
import {
  duckIntroMusic,
  endIntroMusicPermanently,
  ensureIntroMusicPlaying,
  fadeOutIntroMusic,
  restoreIntroMusic,
  silenceIntroMusic,
  unlockIntroAudio,
  startIntroMusic,
} from "./glassIntroBootSound";
import {
  INTRO_CMD_RESPONSE_TYPE_MS,
  INTRO_CMD_TYPE_MS,
  INTRO_HOLD,
  INTRO_IDE_ZOOM_MS,
  introIdeComposePhaseMs,
  introIdeStreamPhaseMs,
  introTypingPhaseMs,
} from "./glassIntroTiming";

/** Ordered acts — Glass stays on; user changes windows, Glass does not leave. */
export type GlassIntroPhase =
  | "boot"
  | "word-cinema"
  | "desktop-reveal"
  | "desktop-linger"
  | "cursor-glass"
  | "glass-click"
  | "glass-active"
  | "cursor-pdf"
  | "open-pdf"
  | "cursor-notes"
  | "open-notes"
  | "command-demo"
  | "command-response"
  | "cursor-agents"
  | "agents-click"
  | "open-agents"
  | "cursor-coder"
  | "coder-click"
  | "open-ide"
  | "ide-compose"
  | "ide-stream"
  | "ide-preview"
  | "ide-zoom"
  | "cursor-terminal"
  | "terminal-click"
  | "open-terminal"
  | "terminal-voice"
  | "terminal-demo"
  | "terminal-close"
  | "cursor-finder"
  | "finder-click"
  | "open-finder"
  | "cursor-safari"
  | "safari-click"
  | "safari-open"
  | "safari-typing"
  | "safari-load"
  | "site-reveal"
  | "glass-site"
  | "complete";

function shouldPlayCinematicIntro(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (isGlassBrowseMobile(detectGlassBrowseDevice())) return false;
  if (new URLSearchParams(window.location.search).get("skipIntro") === "1") return false;
  return true;
}

export const INTRO_COMMAND_DEMO =
  "Summarize my meeting notes — every action item, owner, and deadline across every window.";
export const INTRO_COMMAND_RESPONSE =
  "Three action items from your notes and the PDF brief: (1) Ship Lens cross-window context in the Glass overlay. (2) Voice terminal demo — port 3000, dev server, localhost. (3) Council agents for code review from any app. I can draft the follow-up and push the branch from here if you want.";

const PHASE_MS: Record<Exclude<GlassIntroPhase, "complete">, number> = {
  boot: 5800,
  "word-cinema": 10200,
  "desktop-reveal": 3800,
  "desktop-linger": 2400,
  "cursor-glass": 2800,
  "glass-click": 800,
  "glass-active": 3000,
  "cursor-pdf": 2200,
  "open-pdf": 2600,
  "cursor-notes": 2000,
  "open-notes": 2200,
  "command-demo": introTypingPhaseMs(INTRO_COMMAND_DEMO, INTRO_CMD_TYPE_MS, INTRO_HOLD.afterCommandType),
  "command-response": introTypingPhaseMs(
    INTRO_COMMAND_RESPONSE,
    INTRO_CMD_RESPONSE_TYPE_MS,
    INTRO_HOLD.afterResponse,
  ),
  "cursor-terminal": 2200,
  "terminal-click": 680,
  "open-terminal": 1000,
  "terminal-voice": 1200,
  "terminal-demo": 5800,
  "terminal-close": 800,
  "cursor-agents": 2200,
  "agents-click": 650,
  "open-agents": 3000,
  "cursor-coder": 2200,
  "coder-click": 650,
  "open-ide": 1600,
  "ide-compose": introIdeComposePhaseMs(),
  "ide-stream": introIdeStreamPhaseMs(),
  "ide-preview": 2800,
  "ide-zoom": INTRO_IDE_ZOOM_MS,
  "cursor-finder": 2200,
  "finder-click": 800,
  "open-finder": 2800,
  "cursor-safari": 3000,
  "safari-click": 800,
  "safari-open": 1600,
  "safari-typing": 2600,
  "safari-load": 2200,
  "site-reveal": 2000,
  "glass-site": 10000,
};

const GLASS_ON_PHASES = new Set<GlassIntroPhase>([
  "glass-active",
  "cursor-pdf",
  "open-pdf",
  "cursor-notes",
  "open-notes",
  "command-demo",
  "command-response",
  "cursor-terminal",
  "terminal-click",
  "open-terminal",
  "terminal-voice",
  "terminal-demo",
  "terminal-close",
  "cursor-agents",
  "agents-click",
  "open-agents",
  "cursor-coder",
  "coder-click",
  "open-ide",
  "ide-compose",
  "ide-stream",
  "ide-preview",
  "ide-zoom",
  "cursor-finder",
  "finder-click",
  "open-finder",
  "cursor-safari",
  "safari-click",
  "safari-open",
  "safari-typing",
  "safari-load",
  "site-reveal",
  "glass-site",
  "complete",
]);

type GlassCinematicIntroContextValue = {
  enabled: boolean;
  phase: GlassIntroPhase;
  complete: boolean;
  typedUrl: string;
  introCommandText: string;
  introResponseText: string;
  glassPersistent: boolean;
  skip: () => void;
};

const GlassCinematicIntroContext = createContext<GlassCinematicIntroContextValue | null>(null);

function elementCenter(selector: string, fallback: { x: number; y: number }): { x: number; y: number } {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return fallback;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function GlassCinematicIntroProvider({
  children,
  onGlassActivate,
  onComplete,
}: {
  children: ReactNode;
  onGlassActivate?: () => void;
  onGlassDeactivate?: () => void;
  onComplete?: () => void;
}): JSX.Element {
  const enabledRef = useRef(shouldPlayCinematicIntro());
  const [enabled] = useState(enabledRef.current);
  const [phase, setPhase] = useState<GlassIntroPhase>(enabled ? "boot" : "complete");
  const [complete, setComplete] = useState(!enabled);
  const [typedUrl, setTypedUrl] = useState("");
  const [introCommandText, setIntroCommandText] = useState("");
  const [introResponseText, setIntroResponseText] = useState("");
  const timersRef = useRef<number[]>([]);
  const glassOnRef = useRef(false);
  const bootSoundPlayed = useRef(false);
  const aletheiaSpoken = useRef(false);
  const terminalVoiceSpoken = useRef(false);

  const clearTimers = useCallback((): void => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const finish = useCallback((): void => {
    clearTimers();
    endIntroMusicPermanently(600);
    if (!glassOnRef.current) {
      glassOnRef.current = true;
      onGlassActivate?.();
    }
    setPhase("complete");
    setComplete(true);
    setTypedUrl("iivo.ai");
    onComplete?.();
  }, [clearTimers, onComplete, onGlassActivate]);

  const skip = useCallback((): void => {
    if (complete) return;
    stopAletheiaSpeak();
    fadeOutIntroMusic(800);
    finish();
  }, [complete, finish]);

  const schedule = useCallback((fn: () => void, ms: number): void => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  const advance = useCallback((next: GlassIntroPhase): void => {
    setPhase(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const unlock = (): void => {
      unlockIntroAudio();
      ensureIntroMusicPlaying();
      void unlockAletheiaAudio();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.getVoices();
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    if (!bootSoundPlayed.current) {
      bootSoundPlayed.current = true;
      window.setTimeout(() => startIntroMusic(), 400);
    }

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || complete) return;

    if (phase === "terminal-voice") {
      silenceIntroMusic(480);
    } else if (phase === "terminal-demo") {
      duckIntroMusic(0.08, 450);
    } else if (phase === "terminal-close" || phase === "cursor-agents") {
      restoreIntroMusic(1200);
    } else if (phase === "ide-zoom") {
      duckIntroMusic(0.14, 550);
    } else if (phase === "word-cinema" || phase === "site-reveal") {
      endIntroMusicPermanently(phase === "word-cinema" ? 1200 : 900);
    } else if (phase === "open-terminal") {
      duckIntroMusic(0.3, 650);
    }
  }, [enabled, complete, phase]);

  useEffect(() => {
    if (!enabled || complete || phase !== "terminal-voice" || terminalVoiceSpoken.current) return;
    terminalVoiceSpoken.current = true;
    document.documentElement.classList.add("glass-intro-aletheia-speaking");
    void speakAletheiaLine(ALETHEIA_TERMINAL_DEMO).finally(() => {
      document.documentElement.classList.remove("glass-intro-aletheia-speaking");
      duckIntroMusic(0.1, 500);
      schedule(() => advance("terminal-demo"), 900);
    });
  }, [enabled, complete, phase, schedule, advance]);

  useEffect(() => {
    if (!enabled || complete || phase !== "glass-site" || aletheiaSpoken.current) return;
    aletheiaSpoken.current = true;
    endIntroMusicPermanently(400);
    document.documentElement.classList.add("glass-intro-aletheia-speaking");
    void speakAletheiaLines([ALETHEIA_GLASS_LINE_1, ALETHEIA_GLASS_LINE_2]).finally(() => {
      document.documentElement.classList.remove("glass-intro-aletheia-speaking");
    });
  }, [enabled, complete, phase]);

  useEffect(() => {
    if (complete) endIntroMusicPermanently(500);
  }, [complete]);

  useEffect(() => {
    if (!enabled || complete) return;

    const ms = PHASE_MS[phase as Exclude<GlassIntroPhase, "complete">];
    if (ms == null) return;

    /* terminal-voice advances when Aletheia finishes speaking */
    if (phase === "terminal-voice") return;

    if (GLASS_ON_PHASES.has(phase) && !glassOnRef.current) {
      glassOnRef.current = true;
      onGlassActivate?.();
    }

    const nextMap: Partial<Record<GlassIntroPhase, GlassIntroPhase>> = {
      boot: "complete",
      "word-cinema": "complete",
      "desktop-reveal": "desktop-linger",
      "desktop-linger": "cursor-glass",
      "cursor-glass": "glass-click",
      "glass-click": "glass-active",
      "glass-active": "cursor-pdf",
      "cursor-pdf": "open-pdf",
      "open-pdf": "cursor-notes",
      "cursor-notes": "open-notes",
      "open-notes": "command-demo",
      "command-demo": "command-response",
      "command-response": "cursor-terminal",
      "cursor-terminal": "terminal-click",
      "terminal-click": "open-terminal",
      "open-terminal": "terminal-voice",
      "terminal-voice": "terminal-demo",
      "terminal-demo": "terminal-close",
      "terminal-close": "cursor-agents",
      "cursor-agents": "agents-click",
      "agents-click": "open-agents",
      "open-agents": "cursor-coder",
      "cursor-coder": "coder-click",
      "coder-click": "open-ide",
      "open-ide": "ide-compose",
      "ide-compose": "ide-stream",
      "ide-stream": "ide-preview",
      "ide-preview": "ide-zoom",
      "ide-zoom": "site-reveal",
      "site-reveal": "glass-site",
      "glass-site": "complete",
    };

    const next = nextMap[phase];
    if (next === "complete") {
      schedule(() => finish(), ms);
      return;
    }
    if (next) {
      schedule(() => advance(next), ms);
    }
  }, [enabled, complete, phase, schedule, advance, finish, onGlassActivate]);

  useEffect(() => {
    if (phase !== "command-demo") {
      if (phase === "open-notes") setIntroCommandText("");
      return;
    }

    setIntroCommandText("");
    let index = 0;
    const full = INTRO_COMMAND_DEMO;
    const interval = window.setInterval(() => {
      index += 1;
      setIntroCommandText(full.slice(0, index));
      if (index >= full.length) window.clearInterval(interval);
    }, INTRO_CMD_TYPE_MS);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "command-response") {
      if (phase === "command-demo") setIntroResponseText("");
      return;
    }

    setIntroResponseText("");
    let index = 0;
    const full = INTRO_COMMAND_RESPONSE;
    const interval = window.setInterval(() => {
      index += 1;
      setIntroResponseText(full.slice(0, index));
      if (index >= full.length) window.clearInterval(interval);
    }, INTRO_CMD_RESPONSE_TYPE_MS);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "safari-typing") {
      if (phase === "safari-open") setTypedUrl("");
      if (phase === "safari-load" || phase === "site-reveal" || phase === "glass-site" || phase === "complete") {
        setTypedUrl("iivo.ai");
      }
      return;
    }

    setTypedUrl("");
    const full = "iivo.ai";
    let index = 0;
    const step = Math.max(140, Math.floor(PHASE_MS["safari-typing"] / full.length));
    const interval = window.setInterval(() => {
      index += 1;
      setTypedUrl(full.slice(0, index));
      if (index >= full.length) window.clearInterval(interval);
    }, step);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.toggle("glass-intro-active", !complete);
    document.documentElement.classList.toggle("glass-intro-glass-on", GLASS_ON_PHASES.has(phase) && !complete);

    const actMap: Partial<Record<GlassIntroPhase, string>> = {
      "open-pdf": "1",
      "cursor-notes": "1",
      "open-notes": "2",
      "command-demo": "2",
      "command-response": "2",
      "cursor-terminal": "2",
      "terminal-click": "2",
      "open-terminal": "3",
      "terminal-voice": "3",
      "terminal-demo": "3",
      "terminal-close": "3",
      "cursor-agents": "3",
      "agents-click": "3",
      "open-agents": "3",
      "cursor-coder": "3",
      "coder-click": "3",
      "open-ide": "4",
      "ide-compose": "4",
      "ide-stream": "4",
      "ide-preview": "5",
      "ide-zoom": "6",
      "site-reveal": "6",
      "glass-site": "6",
    };
    const act = actMap[phase];
    if (act && !complete) {
      document.documentElement.dataset.introAct = act;
    } else {
      delete document.documentElement.dataset.introAct;
    }

    return () => {
      document.documentElement.classList.remove("glass-intro-active");
      document.documentElement.classList.remove("glass-intro-glass-on");
      document.documentElement.classList.remove("glass-intro-aletheia-speaking");
      delete document.documentElement.dataset.introAct;
    };
  }, [enabled, complete, phase]);

  useEffect(() => {
    if (!enabled || complete) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, complete, skip]);

  const value = useMemo(
    (): GlassCinematicIntroContextValue => ({
      enabled,
      phase,
      complete,
      typedUrl,
      introCommandText,
      introResponseText,
      glassPersistent: GLASS_ON_PHASES.has(phase),
      skip,
    }),
    [enabled, phase, complete, typedUrl, introCommandText, introResponseText, skip],
  );

  return (
    <GlassCinematicIntroContext.Provider value={value}>
      {children}
    </GlassCinematicIntroContext.Provider>
  );
}

export function useGlassCinematicIntro(): GlassCinematicIntroContextValue {
  const ctx = useContext(GlassCinematicIntroContext);
  if (!ctx) {
    return {
      enabled: false,
      phase: "complete",
      complete: true,
      typedUrl: "iivo.ai",
      introCommandText: "",
      introResponseText: "",
      glassPersistent: true,
      skip: () => {},
    };
  }
  return ctx;
}

type CursorTarget = "glass" | "pdf" | "notes" | "agents" | "coder" | "terminal" | "finder" | "safari" | null;

function phaseCursorTarget(phase: GlassIntroPhase): CursorTarget {
  if (phase === "cursor-glass" || phase === "glass-click") return "glass";
  if (phase === "cursor-pdf" || phase === "open-pdf") return "pdf";
  if (phase === "cursor-notes" || phase === "open-notes") return "notes";
  if (phase === "cursor-agents" || phase === "agents-click") return "agents";
  if (phase === "cursor-coder" || phase === "coder-click") return "coder";
  if (phase === "cursor-terminal" || phase === "terminal-click") return "terminal";
  if (
    phase === "open-terminal" ||
    phase === "terminal-voice" ||
    phase === "terminal-demo" ||
    phase === "terminal-close"
  ) {
    return null;
  }
  if (phase === "cursor-finder" || phase === "finder-click") return "finder";
  if (phase === "cursor-safari" || phase === "safari-click" || phase === "safari-open" || phase === "safari-typing") {
    return "safari";
  }
  return null;
}

function resolveCursorPoint(target: CursorTarget): { x: number; y: number } {
  if (target === "pdf") {
    return elementCenter('[data-desktop-target="pdf"]', {
      x: window.innerWidth * 0.84,
      y: window.innerHeight * 0.58,
    });
  }
  if (target === "notes") {
    return elementCenter('[data-desktop-target="notes"]', {
      x: window.innerWidth * 0.84,
      y: window.innerHeight * 0.48,
    });
  }
  if (target === "glass") {
    return elementCenter('[data-dock-target="glass"]', {
      x: window.innerWidth * 0.52,
      y: window.innerHeight - 52,
    });
  }
  if (target === "terminal") {
    return elementCenter('[data-strip-target="terminal"]', {
      x: window.innerWidth * 0.72,
      y: window.innerHeight - 28,
    });
  }
  if (target === "agents") {
    return elementCenter('[data-strip-target="agents"]', {
      x: window.innerWidth * 0.88,
      y: window.innerHeight - 28,
    });
  }
  if (target === "coder") {
    return elementCenter('[data-intro-agent="coder"]', {
      x: window.innerWidth * 0.78,
      y: window.innerHeight * 0.42,
    });
  }
  if (target === "finder") {
    return elementCenter('[data-dock-target="finder"]', {
      x: window.innerWidth * 0.38,
      y: window.innerHeight - 52,
    });
  }
  if (target === "safari") {
    return elementCenter('[data-dock-target="safari"]', {
      x: window.innerWidth * 0.44,
      y: window.innerHeight - 52,
    });
  }
  return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.45 };
}

function GhostCursor({
  phase,
  position,
  clicking,
}: {
  phase: GlassIntroPhase;
  position: { x: number; y: number } | null;
  clicking: boolean;
}): JSX.Element | null {
  const travelPhases: GlassIntroPhase[] = [
    "desktop-linger",
    "cursor-glass",
    "glass-click",
    "cursor-pdf",
    "open-pdf",
    "cursor-notes",
    "open-notes",
    "cursor-terminal",
    "terminal-click",
    "cursor-agents",
    "agents-click",
    "cursor-coder",
    "coder-click",
  ];
  const visible = travelPhases.includes(phase);
  if (!visible || !position) return null;

  const traveling =
    phase.startsWith("cursor-") ||
    phase === "open-pdf" ||
    phase === "open-notes" ||
    phase === "open-finder";

  return (
    <div
      className={[
        "glass-intro__cursor",
        traveling ? "glass-intro__cursor--travel" : "",
        clicking ? "glass-intro__cursor--click" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--cursor-x": `${position.x}px`,
          "--cursor-y": `${position.y}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="glass-intro__cursor-glow" aria-hidden="true" />
      <svg
        className="glass-intro__cursor-svg"
        width="22"
        height="26"
        viewBox="0 0 22 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="glass-intro-cursor-shadow" x="-30%" y="-20%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.8" stdDeviation="1.4" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>
        <path
          d="M3.25 1.75L3.25 20.75L8.1 15.55L11.65 24.25L14.35 22.95L10.55 13.65L16.75 13.25L3.25 1.75Z"
          fill="#0a0a0a"
          stroke="#fff"
          strokeWidth="1.35"
          strokeLinejoin="round"
          filter="url(#glass-intro-cursor-shadow)"
        />
      </svg>
      {clicking ? <span className="glass-intro__cursor-ripple" /> : null}
    </div>
  );
}

const NARRATION: Partial<Record<GlassIntroPhase, string>> = {
  "desktop-linger": "Your Mac. Every app. One intelligence layer.",
  "open-pdf": "Lens reads any window — Glass never leaves the top.",
  "command-demo": "Notes, PDF, browser — fused context, one question.",
  "command-response": "Structured answers from everything on your screen.",
  "open-agents": "Full agent council — plus a runway of what's coming.",
  "ide-compose": "Glass Coder — describe what you want in the composer.",
  "ide-stream": "Cursor-style stream — thinking, tools, and live output.",
  "ide-preview": "Live preview opens iivo.ai inside the IDE.",
  "ide-zoom": "Zoom into the preview — the site becomes yours beneath the glass.",
  "terminal-voice": "Voice → shell. Aletheia runs your machine from the layer.",
  "terminal-demo": "Natural language becomes command — no chat tab required.",
  "open-finder": "Switch apps. The intelligence layer never dismisses.",
  "safari-typing": "Navigate to iivo.ai…",
  "site-reveal": "The next layer loads beneath the glass.",
};

export default function GlassCinematicIntro(): JSX.Element | null {
  const { enabled, phase, complete, skip } = useGlassCinematicIntro();
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const clicking =
    phase === "glass-click" ||
    phase === "agents-click" ||
    phase === "coder-click" ||
    phase === "terminal-click" ||
    phase === "finder-click" ||
    phase === "safari-click" ||
    phase === "open-pdf" ||
    phase === "open-notes";

  useEffect(() => {
    const travelPhases: GlassIntroPhase[] = [
      "desktop-linger",
      "cursor-glass",
      "glass-click",
      "cursor-pdf",
      "open-pdf",
      "cursor-notes",
      "open-notes",
      "cursor-terminal",
      "terminal-click",
      "cursor-agents",
      "agents-click",
      "cursor-coder",
      "coder-click",
    ];
    if (!travelPhases.includes(phase)) return;

    const resolve = (): void => {
      if (phase === "desktop-linger") {
        setCursorPos({ x: window.innerWidth * 0.52, y: window.innerHeight * 0.48 });
        return;
      }
      const target = phaseCursorTarget(phase);
      if (target) setCursorPos(resolveCursorPoint(target));
    };

    resolve();
    window.addEventListener("resize", resolve);
    return () => window.removeEventListener("resize", resolve);
  }, [phase]);

  if (!enabled || complete) return null;

  const showBoot = phase === "boot";
  const showWhiteout = phase === "boot";
  const narration = NARRATION[phase];
  const showSkip = phase !== "boot";

  return (
    <div
      className={`glass-intro glass-intro--${phase}`}
      data-testid="glass-cinematic-intro"
      data-intro-phase={phase}
      onPointerDown={() => {
        unlockIntroAudio();
        void unlockAletheiaAudio();
      }}
      role="presentation"
    >
      <div
        className={`glass-intro__boot${showBoot ? " glass-intro__boot--visible" : " glass-intro__boot--exit"}`}
        onPointerDown={() => {
          unlockIntroAudio();
          void unlockAletheiaAudio();
        }}
        role="presentation"
      >
        <div className="glass-intro__boot-inner">
          <p className="glass-intro__boot-eyebrow">
            <span>IIVO</span>
            <span>Glass</span>
          </p>
          <h1 className="glass-intro__boot-title">
            <span className="glass-intro__boot-line">The Next Layer of</span>
            <span className="glass-intro__boot-line glass-intro__boot-line--accent">Intelligent Glass</span>
          </h1>
          <p className="glass-intro__boot-sub">AI-native intelligence across every Mac app</p>
          <p className="glass-intro__boot-sound-hint">Click anywhere for music &amp; voice</p>
          <div className="glass-intro__boot-bar" aria-hidden="true">
            <span className="glass-intro__boot-bar-fill" />
          </div>
        </div>
      </div>

      <div
        className={`glass-intro__whiteout${showWhiteout ? "" : " glass-intro__whiteout--clear"}`}
        aria-hidden="true"
      />

      {narration ? (
        <p className="glass-intro__narration" key={phase}>
          {narration}
        </p>
      ) : null}

      {phase !== "boot" && phase !== "word-cinema" ? (
        <GhostCursor phase={phase} position={cursorPos} clicking={clicking} />
      ) : null}

      {showSkip ? (
        <button type="button" className="glass-intro__skip" onClick={skip}>
          Skip intro
        </button>
      ) : null}
    </div>
  );
}
