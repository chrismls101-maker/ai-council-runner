import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import type React from "react";
import { PromptLibraryPanel } from "./PromptLibraryPanel.tsx";
import { ApiKeyManagerPanel } from "./ApiKeyManagerPanel.tsx";
import { PowerPromptPanel } from "./PowerPromptPanel.tsx";
import { SpendTrackerPanel } from "./SpendTrackerPanel.tsx";
import { ExtractModePanel } from "./ExtractModePanel.tsx";
import { GlassAgentPanel } from "./GlassAgentPanel.tsx";
import {
  armBuilderStripInteractive,
  syncBuilderStripPanelOpen,
  useBuilderStripClickThrough,
} from "./useBuilderStripClickThrough.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { useGlassTerminalToggle } from "../useGlassTerminalToggle.ts";
import { useGlassCompanion } from "../companion/GlassCompanionProvider.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import "./BuilderStrip.css";

type BuilderTab = "prompts" | "keys" | "power-prompt" | "spend" | "extract" | "agents";

interface BuilderStripProps {
  onEnterInteractive: () => void;
  onLeaveInteractive: () => void;
  /** Programmatically open the Extract tab (called from ambient BUILD card) */
  onOpenExtractRef?: React.MutableRefObject<(() => void) | null>;
}

export function BuilderStrip({
  onEnterInteractive,
  onLeaveInteractive,
  onOpenExtractRef,
}: BuilderStripProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<BuilderTab | null>(null);
  const { terminalOpen, terminalActive, label: terminalLabel, toggle: toggleTerminal } =
    useGlassTerminalToggle();
  const companion = useGlassCompanion();
  const glassState = useGlassState();
  const agentRunning = glassState.agentRun?.status === "running";
  const [aletheiaSweeping, setAletheiaSweeping] = useState(false);
  const aletheiaSweepGenRef = useRef(0);

  const replayAletheiaTruthSweep = useCallback((): void => {
    aletheiaSweepGenRef.current += 1;
    const gen = aletheiaSweepGenRef.current;
    setAletheiaSweeping(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen !== aletheiaSweepGenRef.current) return;
        setAletheiaSweeping(true);
      });
    });
  }, []);

  const handleAletheiaSweepEnd = useCallback((): void => {
    setAletheiaSweeping(false);
  }, []);

  useEffect(() => {
    if (!aletheiaSweeping) return;
    const timer = window.setTimeout(handleAletheiaSweepEnd, 2300);
    return () => window.clearTimeout(timer);
  }, [aletheiaSweeping, handleAletheiaSweepEnd]);

  const companionTooltip = companion.active
    ? `${companion.statusLabel} — tap to turn off`
    : "Aletheia — Glass voice presence · tap to activate";

  useBuilderStripClickThrough(activeTab !== null);

  const closeBuilderPanel = useCallback((): void => {
    syncBuilderStripPanelOpen(false);
    setActiveTab(null);
  }, []);

  const dismissOverlayMenus = useCallback((): void => {
    if (glassState.powersMenuOpen) send({ type: "dismiss-powers-menu" });
    if (glassState.commandPaletteOpen) send({ type: "dismiss-command-palette" });
  }, [glassState.commandPaletteOpen, glassState.powersMenuOpen]);

  // Keep agents / powers / palette mutually exclusive — only one overlay at a time.
  useEffect(() => {
    if ((glassState.powersMenuOpen || glassState.commandPaletteOpen) && activeTab !== null) {
      closeBuilderPanel();
    }
  }, [activeTab, closeBuilderPanel, glassState.commandPaletteOpen, glassState.powersMenuOpen]);

  // Safety: ensure overlay OS click-through on mount; reset on unmount.
  useEffect(() => {
    window.glass.setBuilderStripVisible(true);
    return () => window.glass.setBuilderStripVisible(false);
  }, []);

  const handlePointerEnter = useCallback((): void => {
    armBuilderStripInteractive();
    onEnterInteractive();
  }, [onEnterInteractive]);

  const handlePointerLeave = useCallback((): void => {
    onLeaveInteractive();
  }, [onLeaveInteractive]);

  const handlePointerDownCapture = useCallback((): void => {
    armBuilderStripInteractive();
  }, []);

  const handleTabClick = useCallback((tab: BuilderTab): void => {
    armBuilderStripInteractive();
    dismissOverlayMenus();
    setActiveTab((prev) => {
      const next = prev === tab ? null : tab;
      syncBuilderStripPanelOpen(next !== null);
      return next;
    });
  }, [dismissOverlayMenus]);

  const handlePowersClick = useCallback((): void => {
    armBuilderStripInteractive();
    if (activeTab !== null) {
      closeBuilderPanel();
    }
    send({ type: "toggle-powers-menu" });
  }, [activeTab, closeBuilderPanel]);

  const handlePaletteClick = useCallback((): void => {
    armBuilderStripInteractive();
    if (activeTab !== null) {
      closeBuilderPanel();
    }
    send({ type: "toggle-command-palette" });
  }, [activeTab, closeBuilderPanel]);

  const handleAgentsTabClick = useCallback((): void => {
    armBuilderStripInteractive();
    if (agentRunning) {
      window.glass.agentStop();
      return;
    }
    handleTabClick("agents");
  }, [agentRunning, handleTabClick]);

  const agentsTabTooltip = agentRunning
    ? "Agent running — tap to stop"
    : "AI Agents — research, write files, and automate tasks with Claude";

  const handleClosePanel = useCallback((): void => {
    closeBuilderPanel();
  }, [closeBuilderPanel]);

  // Expose extract-tab opener via ref so overlay card can trigger it without prop drilling
  useEffect(() => {
    return window.glass.onOpenCoderWithPrompt(() => {
      dismissOverlayMenus();
      syncBuilderStripPanelOpen(true);
      setActiveTab("agents");
    });
  }, [dismissOverlayMenus]);

  useEffect(() => {
    if (onOpenExtractRef) {
      onOpenExtractRef.current = () => handleTabClick("extract");
    }
    return () => {
      if (onOpenExtractRef) onOpenExtractRef.current = null;
    };
  }, [onOpenExtractRef, handleTabClick]);

  // Glass Command Palette (Task #66) — open a builder strip tab programmatically.
  useEffect(() => {
    const onPaletteOpenTab = (event: Event): void => {
      const tab = (event as CustomEvent<string>).detail;
      if (tab === "prompts" || tab === "keys" || tab === "spend" || tab === "extract") {
        armBuilderStripInteractive();
        setActiveTab(tab);
        syncBuilderStripPanelOpen(true);
      }
    };
    window.addEventListener("glass-palette-open-builder-tab", onPaletteOpenTab);
    return () => window.removeEventListener("glass-palette-open-builder-tab", onPaletteOpenTab);
  }, []);

  return (
    <>
      {/* Panel — floats above the strip, inside the overlay */}
      {activeTab !== null && (
        <div
          className={`builder-panel-host${activeTab === "agents" ? " builder-panel-host--agents" : ""}`}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDownCapture={handlePointerDownCapture}
        >
          <div className="builder-panel">
            {activeTab === "prompts" && (
              <PromptLibraryPanel onClose={handleClosePanel} />
            )}
            {activeTab === "keys" && (
              <ApiKeyManagerPanel onClose={handleClosePanel} />
            )}
            {activeTab === "power-prompt" && (
              <PowerPromptPanel onClose={handleClosePanel} />
            )}
            {activeTab === "spend" && (
              <SpendTrackerPanel onClose={handleClosePanel} />
            )}
            {activeTab === "extract" && (
              <ExtractModePanel onClose={handleClosePanel} />
            )}
            {activeTab === "agents" && (
              <GlassAgentPanel onClose={handleClosePanel} />
            )}
          </div>
        </div>
      )}

      {/* Tab strip bar */}
      <div
        className="builder-strip"
        data-testid="glass-builder-strip"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDownCapture={handlePointerDownCapture}
      >
        <GlassHoverTooltip label="Glass Dashboard — system pulse, sessions, and council" placement="auto">
          <button
            type="button"
            className={`builder-tab builder-tab--dashboard${glassState.glassDashboardActive ? " builder-tab--active" : ""}`}
            data-testid="glass-builder-strip-dashboard"
            onClick={() => {
              if (glassState.glassDashboardActive) {
                window.glass.closeDashboard();
              } else {
                window.glass.openDashboard();
              }
            }}
            aria-label="Open Glass Dashboard"
            aria-pressed={glassState.glassDashboardActive === true}
          >
            <LayoutGrid className="builder-tab__icon builder-tab__icon--lucide" size={14} strokeWidth={2} aria-hidden="true" />
            Dashboard
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="Prompt Library — browse and run saved prompts"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab${activeTab === "prompts" ? " builder-tab--active" : ""}`}
            onClick={() => handleTabClick("prompts")}
            aria-label="Prompt Library"
          >
            <span className="builder-tab__icon">⌥</span>
            Prompts
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="Power Prompt Generator — craft structured prompts"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab${activeTab === "power-prompt" ? " builder-tab--active" : ""}`}
            onClick={() => handleTabClick("power-prompt")}
            aria-label="Power Prompt Generator"
          >
            <span className="builder-tab__icon">⚡</span>
            Prompt Gen
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="API Key Manager — store keys for Claude, OpenAI, and more"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab${activeTab === "keys" ? " builder-tab--active" : ""}`}
            onClick={() => handleTabClick("keys")}
            aria-label="API Key Manager"
          >
            <span className="builder-tab__icon">🗝</span>
            API Keys
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="AI Spend Tracker — usage and cost across providers"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab${activeTab === "spend" ? " builder-tab--active" : ""}`}
            onClick={() => handleTabClick("spend")}
            aria-label="AI Spend Tracker"
          >
            <span className="builder-tab__icon">💸</span>
            Spend
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="Watch any build video you care about — extract their plan into a launch-ready master prompt · one-click to Glass, Cursor, or Claude"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab${activeTab === "extract" ? " builder-tab--active" : ""}`}
            onClick={() => handleTabClick("extract")}
            aria-label="Extract & Build Mode"
          >
            <span className="builder-tab__icon">⬡</span>
            Extract &amp; Build Mode
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip label={terminalLabel} placement="auto">
          <button
            type="button"
            className={`builder-tab glass-terminal-toggle${terminalOpen ? " glass-terminal-toggle--open" : ""}`}
            onClick={toggleTerminal}
            aria-label={terminalLabel}
          >
            <span
              className={`glass-terminal-toggle__dot${terminalActive ? " glass-terminal-toggle__dot--live" : ""}`}
              aria-hidden="true"
            />
            <span className="builder-tab__icon">&gt;_</span>
            Terminal
          </button>
        </GlassHoverTooltip>

        <div className="builder-strip__divider" aria-hidden="true" />

        <GlassHoverTooltip label={companionTooltip} placement="auto">
          <button
            type="button"
            className={`builder-tab builder-tab--aletheia${companion.active ? " builder-tab--companion--active" : ""}${aletheiaSweeping ? " builder-tab--aletheia--revealing" : ""}`}
            onClick={companion.toggle}
            onPointerEnter={replayAletheiaTruthSweep}
            aria-label={companion.active ? "Turn off Aletheia" : "Turn on Aletheia"}
            aria-pressed={companion.active}
            data-testid="glass-companion-toggle"
          >
            <span
              className={`builder-tab__glass-sweep${aletheiaSweeping ? " builder-tab__glass-sweep--active" : ""}`}
              aria-hidden="true"
            >
              <span
                className="builder-tab__glass-sweep-bar"
                onAnimationEnd={handleAletheiaSweepEnd}
              />
            </span>
            <span
              className={`builder-companion-toggle__dot${companion.active ? " builder-companion-toggle__dot--live" : ""}`}
              aria-hidden="true"
            />
            <span className="builder-tab__aletheia-label" aria-hidden="true">
              <span className="builder-tab__aletheia-label-glow">Aletheia</span>
              <span className="builder-tab__aletheia-label-face">Aletheia</span>
            </span>
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label={agentsTabTooltip}
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab builder-tab--agents${activeTab === "agents" ? " builder-tab--active" : ""}${agentRunning ? " builder-tab--agents-running" : ""}`}
            onClick={handleAgentsTabClick}
            aria-label={agentRunning ? "Stop running agent" : "Glass Agents"}
          >
            {agentRunning ? (
              <span
                className="builder-agents-toggle__dot builder-agents-toggle__dot--live"
                aria-hidden="true"
              />
            ) : null}
            <span className="builder-tab__icon">◈</span>
            Agents
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="Search Glass powers — ask, terminal, capture, and more · ⌘⇧P"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab builder-tab--powers${glassState.powersMenuOpen ? " builder-tab--active" : ""}`}
            onClick={handlePowersClick}
            aria-label="Glass Powers Menu (Command Shift P)"
            aria-pressed={glassState.powersMenuOpen === true}
          >
            <span className="builder-tab__strip-label builder-tab__strip-label--powers" aria-hidden="true">
              Powers Menu
            </span>
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="Search keys, terminal history, and quick actions · ⌘⇧G"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab builder-tab--palette${glassState.commandPaletteOpen ? " builder-tab--active" : ""}`}
            onClick={handlePaletteClick}
            aria-label="Glass Command Palette (Command Shift G)"
            aria-pressed={glassState.commandPaletteOpen === true}
          >
            <span className="builder-tab__strip-label builder-tab__strip-label--palette" aria-hidden="true">
              Command Palette
            </span>
          </button>
        </GlassHoverTooltip>
      </div>
    </>
  );
}
