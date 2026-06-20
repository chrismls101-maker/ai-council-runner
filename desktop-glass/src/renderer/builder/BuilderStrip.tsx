import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { PromptLibraryPanel } from "./PromptLibraryPanel.tsx";
import { ApiKeyManagerPanel } from "./ApiKeyManagerPanel.tsx";
import { PowerPromptPanel } from "./PowerPromptPanel.tsx";
import { SpendTrackerPanel } from "./SpendTrackerPanel.tsx";
import { ExtractModePanel } from "./ExtractModePanel.tsx";
import {
  armBuilderStripInteractive,
  syncBuilderStripPanelOpen,
  useBuilderStripClickThrough,
} from "./useBuilderStripClickThrough.ts";
import "./BuilderStrip.css";

type BuilderTab = "prompts" | "keys" | "power-prompt" | "spend" | "extract";

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

  useBuilderStripClickThrough(activeTab !== null);

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
    setActiveTab((prev) => {
      const next = prev === tab ? null : tab;
      syncBuilderStripPanelOpen(next !== null);
      return next;
    });
  }, []);

  const handleClosePanel = useCallback((): void => {
    syncBuilderStripPanelOpen(false);
    setActiveTab(null);
  }, []);

  // Expose extract-tab opener via ref so overlay card can trigger it without prop drilling
  useEffect(() => {
    if (onOpenExtractRef) {
      onOpenExtractRef.current = () => handleTabClick("extract");
    }
    return () => {
      if (onOpenExtractRef) onOpenExtractRef.current = null;
    };
  }, [onOpenExtractRef, handleTabClick]);

  return (
    <>
      {/* Panel — floats above the strip, inside the overlay */}
      {activeTab !== null && (
        <div
          className="builder-panel-host"
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
        <button
          type="button"
          className={`builder-tab${activeTab === "prompts" ? " builder-tab--active" : ""}`}
          onClick={() => handleTabClick("prompts")}
          aria-label="Prompt Library"
        >
          <span className="builder-tab__icon">⌥</span>
          Prompts
        </button>

        <button
          type="button"
          className={`builder-tab${activeTab === "keys" ? " builder-tab--active" : ""}`}
          onClick={() => handleTabClick("keys")}
          aria-label="API Key Manager"
        >
          <span className="builder-tab__icon">🗝</span>
          API Keys
        </button>

        <button
          type="button"
          className={`builder-tab${activeTab === "power-prompt" ? " builder-tab--active" : ""}`}
          onClick={() => handleTabClick("power-prompt")}
          aria-label="Power Prompt Generator"
        >
          <span className="builder-tab__icon">⚡</span>
          Prompt Gen
        </button>

        <button
          type="button"
          className={`builder-tab${activeTab === "spend" ? " builder-tab--active" : ""}`}
          onClick={() => handleTabClick("spend")}
          aria-label="AI Spend Tracker"
        >
          <span className="builder-tab__icon">💸</span>
          Spend
        </button>

        <button
          type="button"
          className={`builder-tab${activeTab === "extract" ? " builder-tab--active" : ""}`}
          onClick={() => handleTabClick("extract")}
          aria-label="Extract & Build Mode"
          title="Extract & Build Mode — open panel; press START inside to begin"
        >
          <span className="builder-tab__icon">⬡</span>
          Extract &amp; Build Mode
        </button>

        <div className="builder-strip__divider" />
      </div>
    </>
  );
}
