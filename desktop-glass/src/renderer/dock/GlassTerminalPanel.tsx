/**
 * IIVO Glass built-in terminal panel.
 *
 * Renders a real xterm.js terminal in its own Electron window.
 * Open/close motion is handled by the parent `.dock-terminal-reveal` wrapper.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { send, useGlassState } from "../useGlassState.ts";
import { loadTerminalSize, GLASS_TERMINAL_REVEAL_MS, type GlassTerminalSize } from "./glassTerminalLayout.ts";
import { useTerminalPanelResize } from "./useTerminalPanelResize.ts";

import "@xterm/xterm/css/xterm.css";

const GLASS_TERMINAL_THEME = {
  background: "#0a0c12",
  foreground: "#e2e8f0",
  cursor: "#41e0a3",
  cursorAccent: "#0d1117",
  selectionBackground: "rgba(65, 224, 163, 0.25)",
  black: "#1a1f2e",
  red: "#ff6b7a",
  green: "#41e0a3",
  yellow: "#f0c96a",
  blue: "#7eb0ff",
  magenta: "#c084fc",
  cyan: "#38e1ff",
  white: "#e2e8f0",
  brightBlack: "#4a5568",
  brightRed: "#ff8b94",
  brightGreen: "#6affd4",
  brightYellow: "#ffd080",
  brightBlue: "#99c5ff",
  brightMagenta: "#d8b4fe",
  brightCyan: "#70efff",
  brightWhite: "#f8fafc",
};

function terminalContainerReady(el: HTMLElement): boolean {
  return el.clientWidth >= 2 && el.clientHeight >= 2;
}

export function GlassTerminalPanel(): JSX.Element {
  const state = useGlassState();
  const [panelSize, setPanelSize] = useState<GlassTerminalSize>(loadTerminalSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const startResize = useTerminalPanelResize(panelSize, setPanelSize);

  useEffect(() => {
    window.glass.resizeTerminal(panelSize.width, panelSize.height);
  }, [panelSize.width, panelSize.height]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (termRef.current) return;

    const term = new Terminal({
      fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", "Menlo", monospace',
      fontSize: 13,
      lineHeight: 1.45,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      theme: GLASS_TERMINAL_THEME,
      allowTransparency: false,
      macOptionIsMeta: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const fitWhenReady = (): void => {
      const container = containerRef.current;
      if (!container || !terminalContainerReady(container)) return;
      try {
        fitAddon.fit();
      } catch {
        /* ignore until the panel has real dimensions */
      }
    };

    fitWhenReady();
    const fitTimer = window.setTimeout(fitWhenReady, 120);

    return () => {
      window.clearTimeout(fitTimer);
    };
  }, []);

  useEffect(() => {
    return () => {
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const termId = state.glassDockTerminalId;
    const open = state.glassDockTerminalOpen ?? false;
    const term = termRef.current;
    if (!termId || !open || !term) return;

    let active = true;

    const attach = async (): Promise<void> => {
      const replay = await window.glass.replayPtySession(termId);
      if (!active) return;

      term.clear();
      if (replay) {
        term.write(replay);
      }

      const unsubData = window.glass.onPtyData((id, data) => {
        if (id === termId && active) {
          term.write(data);
        }
      });

      const dataDispose = term.onData((data: string) => {
        window.glass.sendPtyInput(termId, data);
      });

      const fit = fitAddonRef.current;
      const container = containerRef.current;
      if (fit && container && terminalContainerReady(container)) {
        try {
          fit.fit();
          window.glass.sendPtyResize(termId, term.cols, term.rows);
        } catch {
          /* ignore */
        }
      }

      cleanupRef.current = () => {
        unsubData();
        dataDispose.dispose();
      };
    };

    void attach();

    return () => {
      active = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [state.glassDockTerminalId, state.glassDockTerminalOpen]);

  useEffect(() => {
    const fit = fitAddonRef.current;
    const term = termRef.current;
    const termId = state.glassDockTerminalId;
    if (!fit || !term || !termId) return;

    const t = setTimeout(() => {
      const container = containerRef.current;
      if (!container || !terminalContainerReady(container)) return;
      try {
        fit.fit();
        window.glass.sendPtyResize(termId, term.cols, term.rows);
      } catch {
        /* ignore */
      }
    }, GLASS_TERMINAL_REVEAL_MS + 24);
    return () => clearTimeout(t);
  }, [state.glassDockTerminalOpen, state.glassDockTerminalId]);

  useEffect(() => {
    const fit = fitAddonRef.current;
    const term = termRef.current;
    const termId = state.glassDockTerminalId;
    if (!fit || !term) return;

    const t = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container || !terminalContainerReady(container)) return;
      try {
        fit.fit();
        if (termId) {
          window.glass.sendPtyResize(termId, term.cols, term.rows);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [panelSize.width, panelSize.height, state.glassDockTerminalId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const fit = fitAddonRef.current;
      const term = termRef.current;
      const termId = state.glassDockTerminalId;
      if (!fit || !term || !termId || !terminalContainerReady(el)) return;
      try {
        fit.fit();
        window.glass.sendPtyResize(termId, term.cols, term.rows);
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.glassDockTerminalId]);

  const handleKill = useCallback((): void => {
    send({ type: "glass-terminal-kill" });
  }, []);

  const handleClose = useCallback((): void => {
    send({ type: "glass-terminal-close" });
  }, []);

  const terminalActive = !!state.glassDockTerminalId;
  const sessionEnded = state.glassDockTerminalOpen && !state.glassDockTerminalId;

  return (
    <div
      className="glass-terminal-panel"
      data-testid="glass-terminal-panel"
      style={{ width: panelSize.width, height: panelSize.height }}
    >
      <div className="glass-terminal-header">
        <span
          className={`glass-terminal-header__status${terminalActive ? " glass-terminal-header__status--live" : ""}`}
          aria-hidden="true"
          title={terminalActive ? "Terminal session active" : "Session ended"}
        />
        <span className="glass-terminal-header__title">
          {terminalActive ? "Glass Terminal" : "Terminal — session ended"}
        </span>
        <div className="glass-terminal-header__controls">
          {terminalActive && (
            <button
              type="button"
              className="glass-terminal-ctrl-btn glass-terminal-ctrl-btn--kill"
              title="Kill session"
              onClick={handleKill}
            >
              ✕ Kill
            </button>
          )}
          <button
            type="button"
            className="glass-terminal-ctrl-btn"
            title="Hide terminal"
            onClick={handleClose}
          >
            ↓ Hide
          </button>
        </div>
      </div>

      <div
        className="glass-terminal-viewport"
        ref={containerRef}
        data-testid="glass-terminal-viewport"
      />

      {sessionEnded && (
        <div className="glass-terminal-ended">
          <span>Session ended</span>
          <button
            type="button"
            className="glass-terminal-ctrl-btn"
            onClick={() => send({ type: "glass-terminal-open" })}
          >
            New session
          </button>
        </div>
      )}

      <div
        className="glass-terminal-resize glass-terminal-resize--east"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize terminal width"
        onPointerDown={startResize("e")}
      />
      <div
        className="glass-terminal-resize glass-terminal-resize--south"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal height"
        onPointerDown={startResize("s")}
      />
      <div
        className="glass-terminal-resize glass-terminal-resize--south-east"
        role="presentation"
        aria-hidden="true"
        onPointerDown={startResize("se")}
      />
    </div>
  );
}
