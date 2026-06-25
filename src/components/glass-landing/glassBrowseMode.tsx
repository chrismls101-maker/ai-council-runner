import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import {
  glassBrowseExitMetadata,
  trackGlassBrowseEvent,
  type GlassBrowseExitSource,
} from "../../utils/glassBrowseAnalytics";
import {
  classifyGlassBrowseDemoCategory,
  glassBrowseDemoAnswer,
} from "./glassBrowseDemo";

export type GlassBrowseHint = {
  id: string;
  title: string;
  body: string;
};

const HINTS: Record<string, GlassBrowseHint> = {
  hero: {
    id: "hero",
    title: "OS-level overlay",
    body: "Glass sits above your Mac — and this page. Scroll; only the site moves.",
  },
  "ambient-os": {
    id: "ambient-os",
    title: "Your browser is just a window",
    body: "Safari, Figma, iivo.ai — all apps beneath the same glass layer.",
  },
  "builder-stack": {
    id: "builder-stack",
    title: "Leaving Glass view",
    body: "The overlay dissolves below — install Glass to keep it on every app.",
  },
};

type GlassBrowseContextValue = {
  active: boolean;
  hint: GlassBrowseHint;
  agentsPanelOpen: boolean;
  demoResponse: string | null;
  enter: () => void;
  exit: (source?: GlassBrowseExitSource) => void;
  setAgentsPanelOpen: (open: boolean) => void;
  submitDemoAsk: (text: string) => void;
  clearDemoResponse: () => void;
};

const GlassBrowseContext = createContext<GlassBrowseContextValue | null>(null);

function useIsDesktopBrowse(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = (): void => setDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return desktop;
}

export function GlassBrowseProvider({ children }: { children: ReactNode }): JSX.Element {
  const [active, setActive] = useState(false);
  const [hintId, setHintId] = useState("hero");
  const [agentsPanelOpen, setAgentsPanelOpen] = useState(false);
  const [demoResponse, setDemoResponse] = useState<string | null>(null);
  const desktop = useIsDesktopBrowse();
  const autoExitTimerRef = useRef<number | null>(null);

  const clearAutoExitTimer = useCallback((): void => {
    if (autoExitTimerRef.current != null) {
      window.clearTimeout(autoExitTimerRef.current);
      autoExitTimerRef.current = null;
    }
  }, []);

  const exit = useCallback((source: GlassBrowseExitSource = "manual_button"): void => {
    clearAutoExitTimer();
    setActive((wasActive) => {
      if (wasActive) {
        if (source === "auto") {
          trackGlassBrowseEvent("auto_exit");
        } else {
          trackGlassBrowseEvent("manual_exit", glassBrowseExitMetadata(source));
        }
      }
      return false;
    });
    setAgentsPanelOpen(false);
    setDemoResponse(null);
  }, [clearAutoExitTimer]);

  const enter = useCallback((): void => {
    if (!desktop) return;
    setActive(true);
    setHintId("hero");
    setAgentsPanelOpen(false);
    setDemoResponse(null);
    trackGlassBrowseEvent("entered");
  }, [desktop]);

  const submitDemoAsk = useCallback((text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const category = classifyGlassBrowseDemoCategory(trimmed);
    trackGlassBrowseEvent("command", {
      category,
      length: String(Math.min(trimmed.length, 999)),
    });
    setDemoResponse(glassBrowseDemoAnswer(trimmed));
  }, []);

  useEffect(() => {
    if (!active) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") exit("escape");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, exit]);

  useEffect(() => {
    if (!active) {
      document.documentElement.classList.remove("glass-browse-active");
      return;
    }

    document.documentElement.classList.add("glass-browse-active");

    const sections = ["hero", "ambient-os", "builder-stack"]
      .map((id) => document.getElementById(id) ?? document.querySelector(`[data-glass-section="${id}"]`))
      .filter((el): el is HTMLElement => el instanceof HTMLElement);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length === 0) return;

        const id =
          visible[0].target.getAttribute("data-glass-section")
          ?? visible[0].target.id
          ?? "hero";

        if (id === "builder-stack" && visible[0].intersectionRatio > 0.12) {
          setHintId("builder-stack");
          clearAutoExitTimer();
          autoExitTimerRef.current = window.setTimeout(() => exit("auto"), 900);
          return;
        }

        if (HINTS[id]) setHintId(id);
      },
      { threshold: [0.08, 0.2, 0.35, 0.5], rootMargin: "-12% 0px -28% 0px" },
    );

    for (const section of sections) observer.observe(section);
    return () => {
      observer.disconnect();
      clearAutoExitTimer();
      document.documentElement.classList.remove("glass-browse-active");
    };
  }, [active, clearAutoExitTimer, exit]);

  const value = useMemo(
    (): GlassBrowseContextValue => ({
      active,
      hint: HINTS[hintId] ?? HINTS.hero,
      agentsPanelOpen,
      demoResponse,
      enter,
      exit,
      setAgentsPanelOpen,
      submitDemoAsk,
      clearDemoResponse: () => setDemoResponse(null),
    }),
    [active, hintId, agentsPanelOpen, demoResponse, enter, exit, submitDemoAsk],
  );

  return <GlassBrowseContext.Provider value={value}>{children}</GlassBrowseContext.Provider>;
}

export function useGlassBrowse(): GlassBrowseContextValue {
  const ctx = useContext(GlassBrowseContext);
  if (!ctx) {
    throw new Error("useGlassBrowse must be used within GlassBrowseProvider");
  }
  return ctx;
}

export function useGlassBrowseOptional(): GlassBrowseContextValue | null {
  return useContext(GlassBrowseContext);
}
