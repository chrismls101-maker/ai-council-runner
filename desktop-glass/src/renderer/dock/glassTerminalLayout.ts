/** Fallback height; width is chosen from the display (see defaultTerminalSize). */
export const GLASS_TERMINAL_DEFAULT_HEIGHT = 320;
export const GLASS_TERMINAL_MIN_WIDTH = 560;
export const GLASS_TERMINAL_MIN_HEIGHT = 180;
export const GLASS_TERMINAL_MAX_WIDTH = 2400;
export const GLASS_TERMINAL_MAX_HEIGHT = 720;

/** @deprecated Use defaultTerminalSize() — kept for static imports in main. */
export const GLASS_TERMINAL_DEFAULT_WIDTH = 1280;

/** Keep in sync with `.dock-terminal-reveal` transition duration in glass.css */
export const GLASS_TERMINAL_REVEAL_MS = 500;

export interface GlassTerminalSize {
  width: number;
  height: number;
}

type StoredTerminalSize = GlassTerminalSize & { v?: number };

const STORAGE_KEY = "iivo-glass-terminal-size";
const STORAGE_VERSION = 3;

/** Horizontal margin from display edges when sizing the default terminal width. */
const TERMINAL_SCREEN_EDGE_MARGIN_PX = 48;

/** Use the physical display — the dock window is smaller and must not clamp the panel. */
export function terminalViewportForClamp(): { innerWidth: number; innerHeight: number } {
  if (typeof window === "undefined") {
    return { innerWidth: GLASS_TERMINAL_MAX_WIDTH, innerHeight: GLASS_TERMINAL_MAX_HEIGHT };
  }
  return {
    innerWidth: window.screen?.availWidth ?? GLASS_TERMINAL_MAX_WIDTH,
    innerHeight: window.screen?.availHeight ?? GLASS_TERMINAL_MAX_HEIGHT,
  };
}

/** Widest comfortable panel width for a viewport (matches a full-size desktop terminal). */
export function idealTerminalPanelWidth(viewportWidth: number): number {
  const maxW = Math.min(GLASS_TERMINAL_MAX_WIDTH, viewportWidth - TERMINAL_SCREEN_EDGE_MARGIN_PX);
  return Math.round(Math.max(GLASS_TERMINAL_MIN_WIDTH, maxW));
}

export function clampTerminalSize(
  width: number,
  height: number,
  viewport?: { innerWidth: number; innerHeight: number },
): GlassTerminalSize {
  const screen = terminalViewportForClamp();
  const vw = viewport?.innerWidth ?? screen.innerWidth;
  const vh = viewport?.innerHeight ?? screen.innerHeight;
  const maxW = Math.min(GLASS_TERMINAL_MAX_WIDTH, vw - TERMINAL_SCREEN_EDGE_MARGIN_PX);
  const maxH = Math.min(GLASS_TERMINAL_MAX_HEIGHT, Math.round(vh * 0.72));
  return {
    width: Math.round(Math.max(GLASS_TERMINAL_MIN_WIDTH, Math.min(width, maxW))),
    height: Math.round(Math.max(GLASS_TERMINAL_MIN_HEIGHT, Math.min(height, maxH))),
  };
}

export function defaultTerminalSize(
  viewport?: { innerWidth: number; innerHeight: number },
): GlassTerminalSize {
  const screen = viewport ?? terminalViewportForClamp();
  return clampTerminalSize(
    idealTerminalPanelWidth(screen.innerWidth),
    GLASS_TERMINAL_DEFAULT_HEIGHT,
    screen,
  );
}

export function loadTerminalSize(): GlassTerminalSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultTerminalSize();
    }
    const parsed = JSON.parse(raw) as Partial<StoredTerminalSize>;
    if (parsed.v !== STORAGE_VERSION) {
      const next = defaultTerminalSize();
      try {
        const payload: StoredTerminalSize = { ...next, v: STORAGE_VERSION };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
      return next;
    }
    if (typeof parsed.width !== "number" || typeof parsed.height !== "number") {
      return defaultTerminalSize();
    }
    return clampTerminalSize(parsed.width, parsed.height);
  } catch {
    return defaultTerminalSize();
  }
}

export function saveTerminalSize(size: GlassTerminalSize): void {
  try {
    const payload: StoredTerminalSize = { ...size, v: STORAGE_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export type GlassTerminalResizeEdge = "s" | "e" | "se";
