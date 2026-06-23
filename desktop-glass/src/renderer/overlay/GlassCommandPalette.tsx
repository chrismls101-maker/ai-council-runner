import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  PaletteItem,
  PaletteSection,
  PaletteLastTerminalBlock,
  QuickActionItem,
} from "../../shared/paletteTypes.ts";
import type { GlassCommand } from "../../shared/ipc.ts";
import { buildSections } from "../../shared/paletteScorer.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
import "./GlassCommandPalette.css";

/**
 * Glass Command Palette (Task #66) — Raycast-style ⌘⇧G command overlay.
 * Not the ⌘⇧P Powers Menu — see GlassPowersMenu.tsx.
 */
export function GlassCommandPalette({
  open,
  onClose,
  lastTerminalBlock,
  activePtyId,
}: {
  open: boolean;
  onClose: () => void;
  lastTerminalBlock: PaletteLastTerminalBlock | null;
  activePtyId: string | null;
}): JSX.Element | null {
  const state = useGlassState();
  const [query, setQuery] = useState("");
  const [rawSections, setRawSections] = useState<PaletteSection[]>([]);
  const [clipboardText, setClipboardText] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [footerNotice, setFooterNotice] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const extractModeActive = Boolean(state.extractBuildModeActive);
  const activeApp = state.activeApp ?? "";
  const terminalOpen = Boolean(state.glassDockTerminalOpen);
  const hasLastResult = Boolean(state.lastAskResponse);

  // ── On open: gather context, fetch sections, focus input ───────────────────
  useEffect(() => {
    if (!open) {
      setQuery("");
      setFocusedIndex(0);
      setFooterNotice(undefined);
      return;
    }

    ensureOverlayInteractive();

    let cancelled = false;
    let clip = "";
    void (async () => {
      try {
        clip = await navigator.clipboard.readText();
      } catch {
        clip = "";
      }
      if (cancelled) return;
      setClipboardText(clip);

      try {
        const res = await window.glass.paletteGetSections({
          context: {
            clipboardText: clip,
            activeApp,
            lastTerminalBlock,
            terminalOpen,
            activePtyId,
            extractModeActive,
            hasLastResult,
          },
        });
        if (cancelled) return;
        setRawSections(res.sections ?? []);
      } catch {
        if (cancelled) return;
        setRawSections([]);
      }
    })();

    // Focus the search field after the panel mounts.
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Quick actions derived locally from live context ────────────────────────
  const quickActions = useMemo<QuickActionItem[]>(() => {
    const items: QuickActionItem[] = [];
    if (lastTerminalBlock?.status === "error") {
      items.push({
        id: "qa-fix-error",
        type: "quick-action",
        title: "Fix Last Terminal Error",
        subtitle: `Command: ${lastTerminalBlock.command.slice(0, 60)}`,
        icon: "↗",
        score: 1.0,
        action: { kind: "send-glass-command", payload: { type: "terminal-fix-last" } },
        reason: `Last command exited with code ${lastTerminalBlock.exitCode ?? "?"}`,
        triggerSignal: "terminal-error",
      });
    }
    if (clipboardText.length > 20) {
      items.push({
        id: "qa-explain-clipboard",
        type: "quick-action",
        title: "Explain Clipboard",
        subtitle: clipboardText.slice(0, 80) + "…",
        icon: "⧉",
        score: 0.95,
        action: { kind: "send-glass-command", payload: { type: "explain-clipboard" } },
        reason: "Clipboard has content ready to explain",
        triggerSignal: "has-clipboard",
      });
    }
    if (extractModeActive) {
      items.push({
        id: "qa-stop-extract",
        type: "quick-action",
        title: "Stop Extract & Build Mode",
        subtitle: "End capture and generate the build prompt",
        icon: "⬡",
        score: 0.9,
        action: { kind: "send-glass-command", payload: { type: "extract-mode-stop" } },
        reason: "Extract & Build Mode is currently active",
        triggerSignal: "extract-active",
      });
    }
    return items;
  }, [lastTerminalBlock, clipboardText, extractModeActive]);

  // ── Merge quick actions into the section set, then score/sort/filter ───────
  const sections = useMemo<PaletteSection[]>(() => {
    const merged: PaletteSection[] = rawSections.map((s) =>
      s.id === "quick-actions" ? { ...s, items: quickActions } : s,
    );
    if (!merged.some((s) => s.id === "quick-actions") && quickActions.length > 0) {
      merged.unshift({
        id: "quick-actions",
        label: "Quick Actions",
        items: quickActions,
        maxVisible: 4,
        order: 0,
      });
    }
    return buildSections(merged, {
      query,
      context: {
        clipboardText,
        activeApp,
        lastTerminalBlock,
        terminalOpen,
        activePtyId,
        extractModeActive,
        hasLastResult,
      },
    });
  }, [
    rawSections,
    quickActions,
    query,
    clipboardText,
    activeApp,
    lastTerminalBlock,
    terminalOpen,
    activePtyId,
    extractModeActive,
    hasLastResult,
  ]);

  // ── Flatten visible items for keyboard navigation ──────────────────────────
  const flatItems = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    for (const section of sections) {
      out.push(...section.items);
    }
    return out;
  }, [sections]);

  // Keep focusedIndex within bounds when the list changes.
  useEffect(() => {
    setFocusedIndex((i) => {
      if (flatItems.length === 0) return 0;
      return Math.min(i, flatItems.length - 1);
    });
  }, [flatItems.length]);

  // ── Action execution ───────────────────────────────────────────────────────
  const executeAction = useCallback(
    async (item: PaletteItem, secondary = false): Promise<void> => {
      const action = secondary ? item.secondaryAction : item.action;
      if (!action) return;
      void window.glass.paletteRecordUse({ itemId: item.id });

      switch (action.kind) {
        case "send-glass-command":
          window.glass.send(action.payload as GlassCommand);
          onClose();
          break;
        case "inject-pty":
          if (activePtyId) {
            window.glass.sendPtyInput(activePtyId, (action.payload as string) + "\n");
          }
          onClose();
          break;
        case "prefill-command-bar":
          window.glass.send({ type: "prefill-command-bar", text: action.payload as string });
          onClose();
          break;
        case "copy-to-clipboard":
          await window.glass.writeClipboard(action.payload as string);
          setFooterNotice("Copied!");
          window.setTimeout(() => setFooterNotice(undefined), 1500);
          break;
        case "copy-api-key": {
          const res = await window.glass.apiKeyGetValue(action.payload as string);
          if (res.value) {
            await window.glass.writeClipboard(res.value);
            setFooterNotice("Key copied!");
            window.setTimeout(() => setFooterNotice(undefined), 1500);
          } else {
            setFooterNotice("Could not read key");
            window.setTimeout(() => setFooterNotice(undefined), 1500);
          }
          break;
        }
        case "open-builder-tab":
          // BuilderStrip owns its own tab state. Broadcast a request it can opt
          // into; close the palette regardless.
          window.dispatchEvent(
            new CustomEvent("glass-palette-open-builder-tab", { detail: action.payload }),
          );
          onClose();
          break;
        case "open-terminal":
          window.glass.send({ type: "open-terminal" });
          onClose();
          break;
        case "dismiss":
          onClose();
          break;
      }
    },
    [activePtyId, onClose],
  );

  // ── Keyboard handling ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        send({ type: "toggle-command-palette" });
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => (flatItems.length === 0 ? 0 : (i + 1) % flatItems.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) =>
          flatItems.length === 0 ? 0 : (i - 1 + flatItems.length) % flatItems.length,
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[focusedIndex];
        if (item) void executeAction(item, e.metaKey);
        return;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, flatItems, focusedIndex, executeAction, onClose]);

  if (!open) return null;

  let flatCursor = 0;

  return (
    <div
      className="gcp-backdrop"
      data-testid="glass-command-palette-backdrop"
      onPointerEnter={ensureOverlayInteractive}
    >
      <div
        className="gcp-panel"
        role="dialog"
        aria-label="Glass Command Palette"
        onPointerEnter={ensureOverlayInteractive}
      >
        <div className="gcp-search-row">
          <span className="gcp-search-icon" aria-hidden="true">
            ⌘
          </span>
          <input
            ref={inputRef}
            className="gcp-input"
            placeholder="Search Glass commands, keys, terminal…"
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusedIndex(0);
            }}
          />
          <kbd className="gcp-esc-hint">esc</kbd>
          <button
            type="button"
            className="gcp-close-btn"
            aria-label="Close command palette"
            data-testid="glass-command-palette-close"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            ✕
          </button>
        </div>

        <div className="gcp-list" onWheel={handlePaletteListWheel}>
          {flatItems.length === 0 ? (
            <div className="gcp-empty">No matching commands</div>
          ) : (
            sections.map((section) => {
              if (section.items.length === 0) return null;

              return (
                <div key={section.id} className="gcp-section">
                  <div className="gcp-section-header">{section.label}</div>
                  {section.items.map((item) => {
                    const flatIndex = flatCursor++;
                    const focused = flatIndex === focusedIndex;
                    return (
                      <div
                        key={item.id}
                        className={`gcp-item${focused ? " gcp-item--focused" : ""}`}
                        onMouseEnter={() => setFocusedIndex(flatIndex)}
                        onClick={() => void executeAction(item)}
                      >
                        <span className="gcp-item-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <div className="gcp-item-body">
                          <span className="gcp-item-title">{item.title}</span>
                          {item.subtitle ? (
                            <span className="gcp-item-subtitle">{item.subtitle}</span>
                          ) : null}
                        </div>
                        <div className="gcp-item-right">
                          {item.badge ? (
                            <span className="gcp-item-badge">{item.badge}</span>
                          ) : null}
                          {focused ? (
                            <span className="gcp-item-shortcut">
                              {item.secondaryAction ? "↵ · ⌘↵" : "↵"}
                            </span>
                          ) : item.shortcutHint ? (
                            <span className="gcp-item-shortcut">{item.shortcutHint}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="gcp-footer">
          <span className="gcp-footer-notice">{footerNotice ?? ""}</span>
          <span className="gcp-footer-hint">↑↓ navigate · ↵ run · ⌘⇧G toggle · esc close</span>
        </div>
      </div>
    </div>
  );
}
