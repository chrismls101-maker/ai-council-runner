import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, Folder } from "lucide-react";
import type React from "react";
import { PromptLibraryPanel } from "./PromptLibraryPanel.tsx";
import { ApiKeyManagerPanel } from "./ApiKeyManagerPanel.tsx";
import { ExtractModePanel } from "./ExtractModePanel.tsx";
import { GlassAgentPanel } from "./GlassAgentPanel.tsx";
import {
  armBuilderStripInteractive,
  syncAletheiaStripMenuOpen,
  syncBuilderStripPanelOpen,
  useBuilderStripClickThrough,
} from "./useBuilderStripClickThrough.ts";
import { dispatchAletheiaCommand } from "../../shared/aletheiaAuthority.ts";
import { pendingAletheiaAdviceCards } from "../../shared/aletheiaPendingAdvice.ts";
import { ensureAletheiaDispatchRegistered } from "../aletheia/registerAletheiaDispatch.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { showPowerUserTabs } from "../../shared/minimalPublicFlag.ts";
import { ALETHEIA_CORE_STRIP } from "../../shared/builderStripVisibility.ts";
import { useGlassTerminalToggle } from "../useGlassTerminalToggle.ts";
import { useGlassCompanion } from "../companion/GlassCompanionProvider.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { AletheiaStripMenu } from "./AletheiaStripMenu.tsx";
import { BuilderStripExitButton } from "./BuilderStripExitButton.tsx";
import "./BuilderStrip.css";

type BuilderTab = "prompts" | "keys" | "extract" | "agents" | "storage";

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
  const minimalPublic = glassState.serverRuntimeFlags?.minimalPublic === true;
  const glassDevMode = glassState.glassDevMode === true;
  // Founder/dev mode always overrides minimalPublic — power tabs stay visible.
  const showPowerUserTabsValue = showPowerUserTabs({ minimalPublic, glassDevMode });
  const [aletheiaSweeping, setAletheiaSweeping] = useState(false);
  const [aletheiaMenuOpen, setAletheiaMenuOpen] = useState(false);
  const aletheiaSweepGenRef = useRef(0);
  const aletheiaButtonRef = useRef<HTMLButtonElement>(null);

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

  const delegatedTaskRunning =
    (glassState.aletheiaDelegatedPresence != null
      && glassState.aletheiaDelegatedPresence.phase !== "complete"
      && glassState.aletheiaDelegatedPresence.phase !== "failed")
    || (glassState.aletheiaDelegatedLoop != null
      && glassState.aletheiaDelegatedLoop.phase !== "complete"
      && glassState.aletheiaDelegatedLoop.phase !== "failed"
      && glassState.aletheiaDelegatedLoop.phase !== "cancelled")
    || glassState.aletheiaResearchConversation?.phase === "researching";

  const pendingAdviceCount = pendingAletheiaAdviceCards(glassState.aletheiaPendingAdvice).length;
  const deployedExecutionActive = glassState.aletheiaDeployedExecution?.active === true;

  const companionTooltip = aletheiaMenuOpen
    ? "Aletheia — choose Activate or Dashboard"
    : delegatedTaskRunning
      ? glassState.aletheiaResearchConversation?.phase === "researching"
        ? "Aletheia — checking the web · tap for menu"
        : "Aletheia — operating in another app · tap for menu"
      : companion.active
        ? `${companion.statusLabel} — tap for menu`
        : "Aletheia — Glass voice presence · tap for menu";

  useBuilderStripClickThrough(activeTab, aletheiaMenuOpen);

  const closeBuilderPanel = useCallback((): void => {
    setActiveTab(null);
  }, []);

  const closeAletheiaMenu = useCallback((): void => {
    setAletheiaMenuOpen(false);
    syncAletheiaStripMenuOpen(false);
  }, []);

  const dismissPowersAndPalette = useCallback((): void => {
    if (glassState.powersMenuOpen) send({ type: "dismiss-powers-menu" });
    if (glassState.commandPaletteOpen) send({ type: "dismiss-command-palette" });
  }, [glassState.commandPaletteOpen, glassState.powersMenuOpen]);

  const dismissOverlayMenus = useCallback((): void => {
    dismissPowersAndPalette();
    closeAletheiaMenu();
  }, [closeAletheiaMenu, dismissPowersAndPalette]);

  // Keep agents / powers / palette / Aletheia menu mutually exclusive — only one overlay at a time.
  useEffect(() => {
    if ((glassState.powersMenuOpen || glassState.commandPaletteOpen) && activeTab !== null) {
      closeBuilderPanel();
    }
    if (glassState.powersMenuOpen || glassState.commandPaletteOpen) {
      closeAletheiaMenu();
    }
  }, [activeTab, closeAletheiaMenu, closeBuilderPanel, glassState.commandPaletteOpen, glassState.powersMenuOpen]);

  useEffect(() => {
    if (!glassState.aletheiaDashboardActive) return;
    closeAletheiaMenu();
  }, [closeAletheiaMenu, glassState.aletheiaDashboardActive]);

  // Safety: ensure overlay OS click-through on mount; reset on unmount.
  useEffect(() => {
    ensureAletheiaDispatchRegistered();
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
    syncBuilderStripPanelOpen(true, tab);
    dismissOverlayMenus();
    setActiveTab((prev) => (prev === tab ? null : tab));
  }, [dismissOverlayMenus]);

  /** Pointer-down pre-arms overlay interactivity before click (macOS click-through race). */
  const handleBuilderTabPointerDown = useCallback((tab: BuilderTab): void => {
    armBuilderStripInteractive();
    syncBuilderStripPanelOpen(true, tab);
  }, []);

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

  const handleAgentsPointerDown = useCallback((): void => {
    armBuilderStripInteractive();
    if (!agentRunning) {
      syncBuilderStripPanelOpen(true, "agents");
    }
  }, [agentRunning]);

  const agentsTabTooltip = agentRunning
    ? "Agent running — tap to stop"
    : ALETHEIA_CORE_STRIP
      ? "Agents — Research and Writing"
      : "AI Agents — research, write files, and automate tasks with Claude";

  const handleStorageClick = useCallback((): void => {
    armBuilderStripInteractive();
    dismissOverlayMenus();
    setActiveTab(null);
    window.glass.openGlassStorageProjects();
  }, [dismissOverlayMenus]);

  const storageTabButton = (
    <GlassHoverTooltip label="Glass Storage — upload and browse local files" placement="auto">
      <button
        type="button"
        className={`builder-tab builder-tab--storage glass-btn-depth-3${glassState.glassStorageProjectsActive ? " builder-tab--storage-open" : ""}`}
        data-testid="glass-builder-strip-storage"
        onPointerDown={() => armBuilderStripInteractive()}
        onClick={handleStorageClick}
        aria-label="Glass Storage"
        aria-pressed={glassState.glassStorageProjectsActive === true}
      >
        <Folder className="builder-tab__icon builder-tab__icon--lucide" size={14} strokeWidth={2} aria-hidden="true" />
        Storage
      </button>
    </GlassHoverTooltip>
  );

  const agentsTabButton = (
    <GlassHoverTooltip label={agentsTabTooltip} placement="auto">
      <button
        type="button"
        className={`builder-tab builder-tab--agents${activeTab === "agents" ? " builder-tab--active" : ""}${agentRunning ? " builder-tab--agents-running" : ""}`}
        onPointerDown={handleAgentsPointerDown}
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
  );

  const handleAletheiaClick = useCallback((): void => {
    armBuilderStripInteractive();
    dismissPowersAndPalette();
    if (activeTab !== null) {
      closeBuilderPanel();
    }
    if (glassState.aletheiaDashboardActive) {
      window.glass.closeAletheiaDashboard();
    }
    setAletheiaMenuOpen((open) => {
      const next = !open;
      syncAletheiaStripMenuOpen(next);
      return next;
    });
  }, [activeTab, closeBuilderPanel, dismissPowersAndPalette, glassState.aletheiaDashboardActive]);

  const handleAletheiaActivate = useCallback((): void => {
    armBuilderStripInteractive();
    closeAletheiaMenu();
    if (!companion.active) {
      dispatchAletheiaCommand("toggle-companion-mode", { origin: "strip" });
    }
  }, [closeAletheiaMenu, companion.active]);

  const handleAletheiaDashboard = useCallback((): void => {
    armBuilderStripInteractive();
    closeAletheiaMenu();
    if (glassState.aletheiaDashboardActive) {
      window.glass.closeAletheiaDashboard();
    } else {
      window.glass.openAletheiaDashboard();
    }
  }, [closeAletheiaMenu, glassState.aletheiaDashboardActive]);

  const handleAletheiaDeactivate = useCallback((): void => {
    armBuilderStripInteractive();
    closeAletheiaMenu();
    if (!companion.active) return;
    if (agentRunning) {
      dispatchAletheiaCommand("stop-everything", { origin: "strip" });
      return;
    }
    dispatchAletheiaCommand("toggle-companion-mode", { origin: "strip" });
  }, [agentRunning, closeAletheiaMenu, companion.active]);

  const handleAletheiaUseComputer = useCallback((): void => {
    armBuilderStripInteractive();
    closeAletheiaMenu();
    ensureAletheiaDispatchRegistered();
    dispatchAletheiaCommand("aletheia-use-computer-shortcut");
  }, [closeAletheiaMenu]);

  const aletheiaNameClass = `builder-tab builder-tab--aletheia${companion.active ? " builder-tab--companion--active" : ""}${delegatedTaskRunning ? " builder-tab--aletheia--delegated" : ""}${deployedExecutionActive ? " builder-tab--aletheia--founder-tier" : ""}${aletheiaSweeping ? " builder-tab--aletheia--revealing" : ""}${aletheiaMenuOpen ? " builder-tab--aletheia-menu-open" : ""}${glassState.aletheiaDashboardActive ? " builder-tab--aletheia-dashboard-open" : ""}`;

  const renderAletheiaNameButton = (): JSX.Element => (
    <button
      ref={aletheiaButtonRef}
      type="button"
      className={aletheiaNameClass}
      onPointerDownCapture={handlePointerDownCapture}
      onClick={handleAletheiaClick}
      onPointerEnter={replayAletheiaTruthSweep}
      aria-label="Aletheia — open menu"
      aria-haspopup="menu"
      aria-expanded={aletheiaMenuOpen}
      aria-pressed={aletheiaMenuOpen}
      data-testid="glass-companion-toggle"
    >
      <span
        className={`builder-tab__glass-sweep${aletheiaSweeping ? " builder-tab__glass-sweep--active" : ""}`}
        aria-hidden="true"
      >
        <span className="builder-tab__glass-sweep-bar" onAnimationEnd={handleAletheiaSweepEnd} />
      </span>
      <span
        className={`builder-companion-toggle__dot${companion.active ? " builder-companion-toggle__dot--live" : ""}${delegatedTaskRunning ? " builder-companion-toggle__dot--delegated" : ""}`}
        aria-hidden="true"
      />
      <span className="builder-tab__aletheia-label" aria-hidden="true">
        <span className="builder-tab__aletheia-label-face">Aletheia</span>
      </span>
      {pendingAdviceCount > 0 && companion.active ? (
        <span
          className="builder-tab__aletheia-advice-badge"
          aria-hidden="true"
          data-testid="builder-strip-aletheia-advice-badge"
        >
          {pendingAdviceCount}
        </span>
      ) : null}
    </button>
  );

  const renderAletheiaGroup = (): JSX.Element => (
    <div className="builder-strip__aletheia-wrap">
      {aletheiaMenuOpen ? (
        renderAletheiaNameButton()
      ) : (
        <GlassHoverTooltip label={companionTooltip} placement="auto">
          {renderAletheiaNameButton()}
        </GlassHoverTooltip>
      )}
      <AletheiaStripMenu
        open={aletheiaMenuOpen}
        anchorRef={aletheiaButtonRef}
        companionActive={companion.active}
        dashboardActive={glassState.aletheiaDashboardActive === true}
        useComputerActive={glassState.aletheiaUseComputerForNextTask === true}
        onClose={closeAletheiaMenu}
        onActivate={handleAletheiaActivate}
        onDeactivate={handleAletheiaDeactivate}
        onDashboard={handleAletheiaDashboard}
        onUseComputer={handleAletheiaUseComputer}
      />
    </div>
  );

  const handleClosePanel = useCallback((): void => {
    closeBuilderPanel();
  }, [closeBuilderPanel]);

  // Expose extract-tab opener via ref so overlay card can trigger it without prop drilling
  useEffect(() => {
    return window.glass.onOpenCoderWithPrompt(() => {
      dismissOverlayMenus();
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
      if (tab === "prompts" || tab === "keys" || tab === "extract" || tab === "agents" || tab === "storage") {
        armBuilderStripInteractive();
        syncBuilderStripPanelOpen(true, tab);
        setActiveTab(tab);
      }
    };
    window.addEventListener("glass-palette-open-builder-tab", onPaletteOpenTab);
    return () => window.removeEventListener("glass-palette-open-builder-tab", onPaletteOpenTab);
  }, []);

  return (
    <>
      {/* Panel — floats above the strip, inside the overlay */}
      {(ALETHEIA_CORE_STRIP ? activeTab === "agents" : activeTab !== null) && (
        <div
          className={[
            "builder-panel-host",
            activeTab === "agents" && "builder-panel-host--agents",
          ].filter(Boolean).join(" ")}
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
        className={`builder-strip${aletheiaMenuOpen ? " builder-strip--aletheia-menu-open" : ""}${ALETHEIA_CORE_STRIP ? " builder-strip--aletheia-core" : ""}`}
        data-testid="glass-builder-strip"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDownCapture={handlePointerDownCapture}
      >
        {ALETHEIA_CORE_STRIP ? (
          <>
            <div className="builder-strip__slot builder-strip__slot--start">
              {agentsTabButton}
              {storageTabButton}
            </div>
            <div className="builder-strip__slot builder-strip__slot--center">
              {renderAletheiaGroup()}
            </div>
            <div className="builder-strip__slot builder-strip__slot--end">
              <GlassHoverTooltip label="Quit Glass entirely" placement="auto">
                <BuilderStripExitButton />
              </GlassHoverTooltip>
            </div>
          </>
        ) : (
          <>
        <GlassHoverTooltip label="Glass System — setup, providers, sessions, and council" placement="auto">
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
            aria-label="Open Glass System dashboard"
            aria-pressed={glassState.glassDashboardActive === true}
          >
            <LayoutGrid className="builder-tab__icon builder-tab__icon--lucide" size={14} strokeWidth={2} aria-hidden="true" />
            System
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="Prompt Library — saved prompts and generator"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab${activeTab === "prompts" ? " builder-tab--active" : ""}`}
            onPointerDown={() => handleBuilderTabPointerDown("prompts")}
            onClick={() => handleTabClick("prompts")}
            aria-label="Prompt Library"
          >
            <span className="builder-tab__icon">⌥</span>
            Prompts
          </button>
        </GlassHoverTooltip>

        {/* L3.1 — hidden by glass.strip.minimalPublic flag; visible when showPowerUserTabs */}
        {showPowerUserTabsValue && (
          <GlassHoverTooltip
            label="API Keys & Spend — store keys and track usage"
            placement="auto"
          >
            <button
              type="button"
              className={`builder-tab${activeTab === "keys" ? " builder-tab--active" : ""}`}
              onPointerDown={() => handleBuilderTabPointerDown("keys")}
              onClick={() => handleTabClick("keys")}
              aria-label="API Keys and Spend"
            >
              <span className="builder-tab__icon">🗝</span>
              API Keys
            </button>
          </GlassHoverTooltip>
        )}

        <GlassHoverTooltip
          label="Watch any build video you care about — extract their plan into a launch-ready master prompt · one-click to Glass, Cursor, or Claude"
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab${activeTab === "extract" ? " builder-tab--active" : ""}`}
            onPointerDown={() => handleBuilderTabPointerDown("extract")}
            onClick={() => handleTabClick("extract")}
            aria-label="Extract & Build Mode"
          >
            <span className="builder-tab__icon">⬡</span>
            Extract &amp; Build Mode
          </button>
        </GlassHoverTooltip>

        <GlassHoverTooltip
          label="Terminal — run shell commands in a docked panel"
          placement="auto"
        >
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

        {storageTabButton}

        <div className="builder-strip__divider" aria-hidden="true" />

        {renderAletheiaGroup()}

        <GlassHoverTooltip
          label={agentsTabTooltip}
          placement="auto"
        >
          <button
            type="button"
            className={`builder-tab builder-tab--agents${activeTab === "agents" ? " builder-tab--active" : ""}${agentRunning ? " builder-tab--agents-running" : ""}`}
            onPointerDown={handleAgentsPointerDown}
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

        <GlassHoverTooltip label="Quit Glass entirely" placement="auto">
          <BuilderStripExitButton />
        </GlassHoverTooltip>
          </>
        )}
      </div>
    </>
  );
}
