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
import {
  detectGlassBrowseDevice,
  type GlassBrowseDeviceProfile,
  isGlassBrowseMobile,
} from "./glassBrowseDevice";

export type GlassBrowseHint = {
  id: string;
  title: string;
  body: string;
};

const HINTS: Record<string, GlassBrowseHint> = {
  hero: {
    id: "hero",
    title: "This is the layer",
    body: "Intelligent Glass above your Mac — and this page. Scroll; only the site moves beneath you.",
  },
  "ambient-os": {
    id: "ambient-os",
    title: "Every app. One intelligence.",
    body: "Safari, Figma, Xcode, iivo.ai — all windows beneath the same glass layer. That's the category shift.",
  },
  "builder-stack": {
    id: "builder-stack",
    title: "Install to keep the layer",
    body: "This demo dissolves below — download Glass and the intelligence layer stays on every app.",
  },
};

const MOBILE_HINTS: Record<string, GlassBrowseHint> = {
  hero: {
    id: "hero",
    title: "Intelligent glass",
    body: "Scroll the site beneath this layer — command bar and builder strip stay fixed above everything.",
  },
  "ambient-os": {
    id: "ambient-os",
    title: "Your browser is just a window",
    body: "Safari, Chrome, iivo.ai — Glass floats above whatever you're viewing. On Mac, that's every app.",
  },
  "builder-stack": {
    id: "builder-stack",
    title: "The full layer is on Mac",
    body: "Install Glass for the real thing — intelligent overlay across your entire desktop.",
  },
};

const EXIT_ANIM_MS = 480;

type GlassBrowseContextValue = {
  active: boolean;
  exiting: boolean;
  deviceProfile: GlassBrowseDeviceProfile;
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

function useGlassBrowseDevice(): GlassBrowseDeviceProfile {
  const [profile, setProfile] = useState<GlassBrowseDeviceProfile>(() =>
    typeof window !== "undefined" ? detectGlassBrowseDevice() : "desktop",
  );

  useEffect(() => {
    const onResize = (): void => setProfile(detectGlassBrowseDevice());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return profile;
}

export function GlassBrowseProvider({ children }: { children: ReactNode }): JSX.Element {
  const [active, setActive] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [hintId, setHintId] = useState("hero");
  const [agentsPanelOpen, setAgentsPanelOpen] = useState(false);
  const [demoResponse, setDemoResponse] = useState<string | null>(null);
  const deviceProfile = useGlassBrowseDevice();
  const autoExitTimerRef = useRef<number | null>(null);

  const clearAutoExitTimer = useCallback((): void => {
    if (autoExitTimerRef.current != null) {
      window.clearTimeout(autoExitTimerRef.current);
      autoExitTimerRef.current = null;
    }
  }, []);

  const exit = useCallback((source: GlassBrowseExitSource = "manual_button"): void => {
    clearAutoExitTimer();
    if (!active) return;
    if (source === "auto") {
      trackGlassBrowseEvent("auto_exit");
    } else {
      trackGlassBrowseEvent("manual_exit", glassBrowseExitMetadata(source));
    }
    setExiting(true);
    setActive(false);
    window.setTimeout(() => {
      setExiting(false);
      setAgentsPanelOpen(false);
      setDemoResponse(null);
    }, EXIT_ANIM_MS);
  }, [active, clearAutoExitTimer]);

  const enter = useCallback((): void => {
    setExiting(false);
    setActive(true);
    setHintId("hero");
    setAgentsPanelOpen(false);
    setDemoResponse(null);
    const profile = detectGlassBrowseDevice();
    trackGlassBrowseEvent("entered", isGlassBrowseMobile(profile) ? { profile } : undefined);
    if (isGlassBrowseMobile(profile)) {
      trackGlassBrowseEvent("mobile_preview", { profile, mode: "overlay" });
    }
  }, []);

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
    if (!active && !exiting) {
      document.documentElement.classList.remove(
        "glass-browse-active",
        "glass-browse-active--phone",
        "glass-browse-active--tablet",
      );
      return;
    }

    document.documentElement.classList.add("glass-browse-active");
    document.documentElement.classList.toggle("glass-browse-active--phone", deviceProfile === "phone");
    document.documentElement.classList.toggle("glass-browse-active--tablet", deviceProfile === "tablet");

    return () => {
      document.documentElement.classList.remove(
        "glass-browse-active",
        "glass-browse-active--phone",
        "glass-browse-active--tablet",
      );
    };
  }, [active, exiting, deviceProfile]);

  useEffect(() => {
    if (!active) return;
    if (document.documentElement.classList.contains("glass-intro-active")) return;

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

        const hints = isGlassBrowseMobile(deviceProfile) ? MOBILE_HINTS : HINTS;
        if (hints[id]) setHintId(id);
      },
      { threshold: [0.08, 0.2, 0.35, 0.5], rootMargin: "-12% 0px -28% 0px" },
    );

    for (const section of sections) observer.observe(section);
    return () => {
      observer.disconnect();
      clearAutoExitTimer();
    };
  }, [active, clearAutoExitTimer, deviceProfile, exit]);

  const value = useMemo(
    (): GlassBrowseContextValue => ({
      active,
      exiting,
      deviceProfile,
      hint: (isGlassBrowseMobile(deviceProfile) ? MOBILE_HINTS : HINTS)[hintId]
        ?? (isGlassBrowseMobile(deviceProfile) ? MOBILE_HINTS.hero : HINTS.hero),
      agentsPanelOpen,
      demoResponse,
      enter,
      exit,
      setAgentsPanelOpen,
      submitDemoAsk,
      clearDemoResponse: () => setDemoResponse(null),
    }),
    [active, exiting, deviceProfile, hintId, agentsPanelOpen, demoResponse, enter, exit, submitDemoAsk],
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
