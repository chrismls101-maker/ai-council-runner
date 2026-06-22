/**
 * Glass Powers Menu — ⌘⇧P quick-launcher.
 *
 * Renders a searchable, keyboard-navigable list of Glass powers above the
 * command pill. Pressing Enter invokes the selected power; Escape closes it.
 *
 * Architecture:
 *  - Mounts in the overlay window (full-screen backdrop + side panel).
 *  - Reads `state.powersMenuOpen` and renders only when true.
 *  - Each power either fires a GlassCommand directly or pre-fills the command
 *    bar with a template for powers that need additional input from the user.
 */

import { useEffect, useRef, useState, useCallback, useMemo, useId } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
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
  {
    id: "terminal-new-tab",
    icon: "+",
    title: "New Terminal Tab",
    description: "Open another shell session in a new tab",
    category: "terminal",
    hint: "⌘T",
    action: { kind: "direct", commands: [{ type: "glass-terminal-new-tab" }] },
    keywords: ["tab", "new", "session", "split"],
  },
  {
    id: "terminal-explain",
    icon: "⚡",
    title: "Explain Last Error",
    description: "Ask Glass to explain the most recent terminal error",
    category: "terminal",
    hint: "⌘E",
    action: { kind: "direct", commands: [{ type: "glass-terminal-action", action: "explain" }] },
    keywords: ["explain", "error", "debug", "fix"],
  },
  {
    id: "terminal-vision",
    icon: "◉",
    title: "Screen-Aware Terminal",
    description: "Analyze what's on screen with Claude Vision",
    category: "terminal",
    hint: "⌘⇧E",
    action: { kind: "direct", commands: [{ type: "glass-terminal-action", action: "vision" }] },
    keywords: ["vision", "screen", "analyze", "see"],
  },
  {
    id: "terminal-find",
    icon: "⌕",
    title: "Find in Terminal",
    description: "Search text in the active terminal session",
    category: "terminal",
    hint: "⌘F",
    action: { kind: "direct", commands: [{ type: "glass-terminal-action", action: "find" }] },
    keywords: ["find", "search", "grep"],
  },
  {
    id: "terminal-scrollback",
    icon: "◷",
    title: "Smart Terminal History",
    description: "Search encrypted command history and re-run",
    category: "terminal",
    hint: "⌘⇧F",
    action: { kind: "direct", commands: [{ type: "glass-terminal-action", action: "scrollback" }] },
    keywords: ["history", "scrollback", "past", "commands"],
  },
  {
    id: "terminal-voice",
    icon: "◌",
    title: "Voice to Shell",
    description: "Speak a command — Glass types it into the terminal",
    category: "terminal",
    hint: "⌘⇧V",
    action: { kind: "direct", commands: [{ type: "glass-terminal-action", action: "voice" }] },
    keywords: ["voice", "mic", "speak", "dictate"],
  },
  {
    id: "terminal-nl",
    icon: "→",
    title: "Natural Language Command",
    description: "Describe what you want — Glass converts it to a shell command",
    category: "terminal",
    hint: "⌃Space",
    action: { kind: "direct", commands: [{ type: "glass-terminal-action", action: "nl-focus" }] },
    keywords: ["natural language", "nl", "describe", "command bar"],
  },
  {
    id: "terminal-kill",
    icon: "×",
    title: "Close Terminal Tab",
    description: "End the active shell session",
    category: "terminal",
    hint: "⌘W",
    action: { kind: "direct", commands: [{ type: "glass-terminal-close-tab" }] },
    keywords: ["kill", "close", "exit", "stop", "tab"],
  },
  {
    id: "terminal-hide",
    icon: "⌄",
    title: "Hide Terminal",
    description: "Hide the terminal panel — sessions keep running",
    category: "terminal",
    action: { kind: "direct", commands: [{ type: "glass-terminal-close" }] },
    keywords: ["hide", "dismiss", "minimize"],
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

const POWER_CATEGORY_SECTIONS: Array<{ category: GlassPower["category"]; label: string }> = [
  { category: "custom", label: "Custom Commands" },
  { category: "ask", label: "Ask & Intelligence" },
  { category: "capture", label: "Capture" },
  { category: "terminal", label: "Terminal" },
  { category: "session", label: "Wingman & Sessions" },
  { category: "tools", label: "Listen & Translate" },
  { category: "settings", label: "Settings" },
];

function groupPowersByCategory(powers: GlassPower[]): Array<{ label: string; items: GlassPower[] }> {
  const groups: Array<{ label: string; items: GlassPower[] }> = [];
  for (const { category, label } of POWER_CATEGORY_SECTIONS) {
    const items = powers.filter((p) => p.category === category);
    if (items.length > 0) groups.push({ label, items });
  }
  return groups;
}

function invokePower(power: GlassPower): void {
  if (power.action.kind === "direct") {
    for (const cmd of power.action.commands) {
      send(cmd);
    }
    send({ type: "dismiss-powers-menu" });
  } else {
    // Pre-fill command bar text, then close palette so user can type
    const { template } = power.action; // capture before setTimeout closure
    send({ type: "dismiss-powers-menu" });
    // Small delay so palette animates out before prefill fires
    setTimeout(() => {
      send({ type: "prefill-command-bar", text: template });
    }, 60);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlassPowersMenu(): JSX.Element | null {
  const state = useGlassState();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const visible = state.powersMenuOpen ?? false;

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
  const searching = query.trim().length > 0;
  const displayGroups = useMemo(
    () =>
      searching
        ? [{ label: "Results", items: filtered }]
        : groupPowersByCategory(filtered),
    [filtered, searching],
  );
  const flatPowers = useMemo(() => displayGroups.flatMap((group) => group.items), [displayGroups]);

  const warnings = state.customCommandsWarnings ?? [];
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const warningsId = useId();

  // Reset query + selection when palette opens
  useEffect(() => {
    if (visible) {
      ensureOverlayInteractive();
      setQuery("");
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Keep active item in view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelectorAll<HTMLElement>(".glass-powers-menu__item")[activeIdx];
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, flatPowers.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const power = flatPowers[activeIdx];
          if (power) invokePower(power);
          break;
        }
        case "Escape":
          e.preventDefault();
          send({ type: "dismiss-powers-menu" });
          break;
        default:
          break;
      }
    },
    [flatPowers, activeIdx],
  );

  // Clamp activeIdx when filter reduces list
  useEffect(() => {
    if (activeIdx >= flatPowers.length && flatPowers.length > 0) {
      setActiveIdx(flatPowers.length - 1);
    }
  }, [flatPowers.length, activeIdx]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        send({ type: "dismiss-powers-menu" });
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [visible]);

  if (!visible) return null;

  return (
    // Click outside → close
    <div
      className="glass-powers-menu-backdrop"
      data-testid="glass-powers-menu"
      onPointerEnter={ensureOverlayInteractive}
    >
      <div
        className="glass-powers-menu"
        onPointerEnter={ensureOverlayInteractive}
      >
        {/* Search input */}
        <div className="glass-powers-menu__search-row">
          <span className="glass-powers-menu__search-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="text"
            className="glass-powers-menu__input"
            placeholder="Search powers…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
            data-testid="glass-powers-menu-input"
          />
          <kbd className="glass-powers-menu__esc-hint">esc</kbd>
          <button
            type="button"
            className="glass-powers-menu__close-btn"
            aria-label="Close powers menu"
            data-testid="glass-powers-menu-close"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              send({ type: "dismiss-powers-menu" });
            }}
          >
            ✕
          </button>
        </div>

        {/* Divider */}
        <div className="glass-powers-menu__divider" aria-hidden="true" />

        {/* Custom commands config warnings */}
        {warnings.length > 0 && (
          <div className="glass-powers-menu__warnings" role="status">
            <button
              className="glass-powers-menu__warnings-header"
              onClick={() => setWarningsExpanded((v) => !v)}
              aria-expanded={warningsExpanded}
              aria-controls={warningsId}
            >
              <span className="glass-powers-menu__warnings-icon" aria-hidden="true">⚠</span>
              <span className="glass-powers-menu__warnings-label">
                glass-commands.json — {warnings.length} issue{warnings.length !== 1 ? "s" : ""}
              </span>
              <span className="glass-powers-menu__warnings-chevron" aria-hidden="true">
                {warningsExpanded ? "▴" : "▾"}
              </span>
            </button>
            {warningsExpanded && (
              <ul id={warningsId} className="glass-powers-menu__warnings-list">
                {warnings.map((w, i) => (
                  <li key={i} className="glass-powers-menu__warnings-item">{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Power list */}
        {flatPowers.length === 0 ? (
          <p className="glass-powers-menu__empty">No powers match "{query}"</p>
        ) : (
          <div
            ref={listRef}
            className="glass-powers-menu__list"
            role="listbox"
            aria-label="Glass Powers"
            onWheel={handlePaletteListWheel}
          >
            {(() => {
              let flatCursor = 0;
              return displayGroups.map((group) => (
                <section key={group.label} className="glass-powers-menu__section" aria-label={group.label}>
                  <div className="glass-powers-menu__section-header">{group.label}</div>
                  {group.items.map((power) => {
                    const idx = flatCursor++;
                    return (
                      <div
                        key={power.id}
                        role="option"
                        aria-selected={idx === activeIdx}
                        className={`glass-powers-menu__item${idx === activeIdx ? " glass-powers-menu__item--active" : ""}`}
                        onPointerEnter={() => setActiveIdx(idx)}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          invokePower(power);
                        }}
                        data-testid={`glass-power-${power.id}`}
                      >
                        <span className="glass-powers-menu__item-icon" aria-hidden="true">
                          {power.icon}
                        </span>
                        <span className="glass-powers-menu__item-body">
                          <span className="glass-powers-menu__item-title">{power.title}</span>
                          <span className="glass-powers-menu__item-desc">{power.description}</span>
                        </span>
                        {power.category === "custom" ? (
                          <span className="glass-powers-menu__item-badge">custom</span>
                        ) : power.hint ? (
                          <kbd className="glass-powers-menu__item-hint">{power.hint}</kbd>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              ));
            })()}
          </div>
        )}

        {/* Footer */}
        <div className="glass-powers-menu__footer" aria-hidden="true">
          <span>↑↓ navigate</span>
          <span>↩ invoke</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
