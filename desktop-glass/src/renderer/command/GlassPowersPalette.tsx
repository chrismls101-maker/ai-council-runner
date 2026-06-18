/**
 * Glass Powers Palette — ⌘⇧P quick-launcher.
 *
 * Renders a searchable, keyboard-navigable list of Glass powers above the
 * command pill. Pressing Enter invokes the selected power; Escape closes it.
 *
 * Architecture:
 *  - Mounts inside the command-bar window (already has interactive focus).
 *  - Reads `state.powersPaletteOpen` and renders only when true.
 *  - Each power either fires a GlassCommand directly or pre-fills the command
 *    bar with a template for powers that need additional input from the user.
 */

import { useEffect, useRef, useState, useCallback, useMemo, useId } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ensureCommandBarClickable } from "../useChromeLockToggle.ts";
import { DEFAULT_CUSTOM_ICON } from "../../shared/customCommands.ts";

// ─── Power definitions ────────────────────────────────────────────────────────

export type PowerActionDirect = {
  kind: "direct";
  /** GlassCommand(s) to dispatch when invoked */
  commands: Parameters<typeof send>[0][];
};

export type PowerActionPrefill = {
  kind: "prefill";
  /** Text pre-filled into the command bar for the user to complete */
  template: string;
};

export interface GlassPower {
  id: string;
  icon: string;
  title: string;
  description: string;
  /** Keyboard shortcut hint shown on the right (display only) */
  hint?: string;
  /** Category for grouping */
  category: "ask" | "capture" | "terminal" | "session" | "tools" | "settings" | "custom";
  action: PowerActionDirect | PowerActionPrefill;
  /** Filter keywords beyond title/description */
  keywords?: string[];
}

const POWERS: GlassPower[] = [
  // ── Ask / Intelligence ────────────────────────────────────────────────────
  {
    id: "ask",
    icon: "◈",
    title: "Ask Glass",
    description: "Type a question — Glass answers with full context",
    category: "ask",
    hint: "⌘Space",
    action: { kind: "prefill", template: "" },
    keywords: ["question", "query", "chat", "help"],
  },
  {
    id: "context-snapshot",
    icon: "⊕",
    title: "Context Snapshot",
    description: "Grab active window + terminal context, then ask",
    category: "ask",
    hint: "⌘⇧G",
    action: { kind: "direct", commands: [{ type: "glass-context-ask" }] },
    keywords: ["context", "window", "screen", "snapshot", "inject"],
  },
  {
    id: "capture-screen",
    icon: "⊡",
    title: "Capture Screen",
    description: "Screenshot what's visible and ask Glass about it",
    category: "capture",
    action: { kind: "prefill", template: "What do you see on screen? " },
    keywords: ["screenshot", "screen", "visual", "lens", "see"],
  },
  {
    id: "search-memory",
    icon: "◎",
    title: "Search Memory",
    description: "Search past Glass answers and saved moments",
    category: "ask",
    action: { kind: "prefill", template: "/search " },
    keywords: ["memory", "history", "past", "remember", "moments"],
  },
  // ── Terminal ──────────────────────────────────────────────────────────────
  {
    id: "terminal-open",
    icon: "⌥",
    title: "Open Terminal",
    description: "Open the Glass built-in PTY terminal",
    category: "terminal",
    action: { kind: "direct", commands: [{ type: "glass-terminal-open" }] },
    keywords: ["terminal", "shell", "pty", "cli", "command line"],
  },
  {
    id: "run-shell",
    icon: "⌁",
    title: "Run Shell Command",
    description: "Execute a shell command via Glass and see output",
    category: "terminal",
    action: { kind: "prefill", template: "/run " },
    keywords: ["shell", "bash", "zsh", "exec", "command", "script"],
  },
  // ── Session / Wingman ─────────────────────────────────────────────────────
  {
    id: "wingman-start",
    icon: "◉",
    title: "Start Wingman Session",
    description: "Begin a focused dev session — Glass tracks what you build",
    category: "session",
    // wingman-start requires a goal string — pre-fill command bar so user can type it
    action: { kind: "prefill", template: "Start wingman: " },
    keywords: ["wingman", "session", "work", "focus", "track", "code"],
  },
  {
    id: "wingman-inspect",
    icon: "◈",
    title: "Wingman Inspect",
    description: "Ask Glass to analyse the current task in your Wingman session",
    category: "session",
    action: { kind: "direct", commands: [{ type: "wingman-inspect" }] },
    keywords: ["wingman", "inspect", "analyse", "analyze", "task", "review"],
  },
  {
    id: "wingman-end",
    icon: "◇",
    title: "End Wingman Session",
    description: "Finish the session and generate an AI progress report",
    category: "session",
    action: { kind: "direct", commands: [{ type: "wingman-end" }] },
    keywords: ["wingman", "end", "finish", "report", "debrief"],
  },
  // ── Listen / Translate ────────────────────────────────────────────────────
  {
    id: "start-listening",
    icon: "◌",
    title: "Start Listening",
    description: "Transcribe microphone audio — meetings, calls, voice notes",
    category: "tools",
    action: { kind: "direct", commands: [{ type: "request-start-listening" }] },
    keywords: ["listen", "transcribe", "mic", "microphone", "audio", "meeting"],
  },
  {
    id: "translate-start",
    icon: "◫",
    title: "Live Translate",
    description: "Real-time speech translation via live captions",
    category: "tools",
    action: { kind: "direct", commands: [{ type: "open-translate-setup" }] },
    keywords: ["translate", "translation", "captions", "speech", "language"],
  },
  // ── Panel / Settings ──────────────────────────────────────────────────────
  {
    id: "toggle-panel",
    icon: "◧",
    title: "Toggle Side Panel",
    description: "Show or hide the Glass side panel",
    category: "settings",
    action: { kind: "direct", commands: [{ type: "toggle-panel" }] },
    keywords: ["panel", "sidebar", "show", "hide", "toggle"],
  },
  {
    id: "update-check",
    icon: "◈",
    title: "Check for Updates",
    description: "See if a new version of Glass is available",
    category: "settings",
    action: { kind: "direct", commands: [{ type: "glass-update-check" }] },
    keywords: ["update", "version", "upgrade", "check"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterPowers(powers: GlassPower[], query: string): GlassPower[] {
  const q = query.toLowerCase().trim();
  if (!q) return powers;
  return powers.filter((p) => {
    const haystack = [
      p.title,
      p.description,
      ...(p.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function invokePower(power: GlassPower): void {
  if (power.action.kind === "direct") {
    for (const cmd of power.action.commands) {
      send(cmd);
    }
    send({ type: "dismiss-powers-palette" });
  } else {
    // Pre-fill command bar text, then close palette so user can type
    const { template } = power.action; // capture before setTimeout closure
    send({ type: "dismiss-powers-palette" });
    // Small delay so palette animates out before prefill fires
    setTimeout(() => {
      send({ type: "prefill-command-bar", text: template });
    }, 60);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlassPowersPalette(): JSX.Element | null {
  const state = useGlassState();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const visible = state.powersPaletteOpen ?? false;

  // Build custom powers from user-defined commands (hot-reloaded from ~/.iivo/glass-commands.json)
  const customPowers = useMemo<GlassPower[]>(
    () =>
      (state.customCommands ?? []).map((cmd) => ({
        id: `custom-${cmd.name}`,
        icon: cmd.icon ?? DEFAULT_CUSTOM_ICON,
        title: `/${cmd.name}`,
        description: cmd.description,
        category: "custom" as const,
        action: {
          kind: "direct" as const,
          commands: [{ type: "custom-command-run" as const, name: cmd.name }],
        },
        keywords: [cmd.name, cmd.action.type, "custom", "slash"],
      })),
    [state.customCommands],
  );

  const allPowers = useMemo(() => [...customPowers, ...POWERS], [customPowers]);
  const filtered = filterPowers(allPowers, query);

  const warnings = state.customCommandsWarnings ?? [];
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const warningsId = useId();

  // Reset query + selection when palette opens
  useEffect(() => {
    if (visible) {
      setQuery("");
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  // Keep active item in view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const power = filtered[activeIdx];
          if (power) invokePower(power);
          break;
        }
        case "Escape":
          e.preventDefault();
          send({ type: "dismiss-powers-palette" });
          break;
        default:
          break;
      }
    },
    [filtered, activeIdx],
  );

  // Clamp activeIdx when filter reduces list
  useEffect(() => {
    if (activeIdx >= filtered.length && filtered.length > 0) {
      setActiveIdx(filtered.length - 1);
    }
  }, [filtered.length, activeIdx]);

  if (!visible) return null;

  return (
    // Click outside → close
    <div
      className="glass-powers-palette-backdrop"
      data-testid="glass-powers-palette"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          send({ type: "dismiss-powers-palette" });
        }
      }}
    >
      <div
        className="glass-powers-palette"
        onPointerDown={(e) => {
          e.stopPropagation();
          ensureCommandBarClickable();
        }}
      >
        {/* Search input */}
        <div className="glass-powers-palette__search-row">
          <span className="glass-powers-palette__search-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="text"
            className="glass-powers-palette__input"
            placeholder="Search powers…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
            data-testid="glass-powers-palette-input"
          />
          <kbd className="glass-powers-palette__esc-hint">esc</kbd>
        </div>

        {/* Divider */}
        <div className="glass-powers-palette__divider" aria-hidden="true" />

        {/* Custom commands config warnings */}
        {warnings.length > 0 && (
          <div className="glass-powers-palette__warnings" role="status">
            <button
              className="glass-powers-palette__warnings-header"
              onClick={() => setWarningsExpanded((v) => !v)}
              aria-expanded={warningsExpanded}
              aria-controls={warningsId}
            >
              <span className="glass-powers-palette__warnings-icon" aria-hidden="true">⚠</span>
              <span className="glass-powers-palette__warnings-label">
                glass-commands.json — {warnings.length} issue{warnings.length !== 1 ? "s" : ""}
              </span>
              <span className="glass-powers-palette__warnings-chevron" aria-hidden="true">
                {warningsExpanded ? "▴" : "▾"}
              </span>
            </button>
            {warningsExpanded && (
              <ul id={warningsId} className="glass-powers-palette__warnings-list">
                {warnings.map((w, i) => (
                  <li key={i} className="glass-powers-palette__warnings-item">{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Power list */}
        {filtered.length === 0 ? (
          <p className="glass-powers-palette__empty">No powers match "{query}"</p>
        ) : (
          <ul
            ref={listRef}
            className="glass-powers-palette__list"
            role="listbox"
            aria-label="Glass Powers"
          >
            {filtered.map((power, idx) => (
              <li
                key={power.id}
                role="option"
                aria-selected={idx === activeIdx}
                className={`glass-powers-palette__item${idx === activeIdx ? " glass-powers-palette__item--active" : ""}`}
                onPointerEnter={() => setActiveIdx(idx)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  invokePower(power);
                }}
                data-testid={`glass-power-${power.id}`}
              >
                <span className="glass-powers-palette__item-icon" aria-hidden="true">
                  {power.icon}
                </span>
                <span className="glass-powers-palette__item-body">
                  <span className="glass-powers-palette__item-title">{power.title}</span>
                  <span className="glass-powers-palette__item-desc">{power.description}</span>
                </span>
                {power.category === "custom" ? (
                  <span className="glass-powers-palette__item-badge">custom</span>
                ) : power.hint ? (
                  <kbd className="glass-powers-palette__item-hint">{power.hint}</kbd>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        <div className="glass-powers-palette__footer" aria-hidden="true">
          <span>↑↓ navigate</span>
          <span>↩ invoke</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
