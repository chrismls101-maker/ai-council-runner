/**
 * Spaces — full-screen workspace (Research / Storage explorer shell).
 */

import { useCallback, useEffect, useState } from "react";
import { Sun } from "lucide-react";
import {
  persistGlassSpacesTheme,
  readGlassSpacesTheme,
  type GlassSpacesTheme,
} from "../../shared/glassSpacesTheme.ts";
import { prepareGlassTextPointerDown, armGlassSpacesOverlayPointer } from "../glassTextInteraction.ts";
import { SpacesPanel } from "./SpacesPanel.tsx";
import "../research/ResearchExplorer.css";
import "../workspace/workspaceChrome.css";
import "./GlassSpacesWorkspace.css";

interface GlassSpacesWorkspaceProps {
  visible?: boolean;
  onClose: () => void;
}

export function GlassSpacesWorkspace({
  visible = true,
  onClose,
}: GlassSpacesWorkspaceProps): JSX.Element {
  const [theme, setTheme] = useState<GlassSpacesTheme>(() => readGlassSpacesTheme());
  const [savedListOpen, setSavedListOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("glass-body--workspace-active");
    return () => {
      document.body.classList.remove("glass-body--workspace-active");
    };
  }, [visible]);

  useEffect(() => {
    persistGlassSpacesTheme(theme);
  }, [theme]);

  const handleHide = useCallback((): void => {
    onClose();
  }, [onClose]);

  const toggleTheme = useCallback((): void => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const toggleSavedList = useCallback((): void => {
    setSavedListOpen((open) => !open);
  }, []);

  return (
    <div
      className={[
        "glass-spaces-workspace",
        "research-explorer",
        theme === "dark" ? "research-explorer--dark" : "research-explorer--light",
        `glass-spaces-workspace--${theme}`,
        !visible && "research-explorer--hidden",
      ].filter(Boolean).join(" ")}
      data-testid="glass-spaces-workspace"
    >
      <div className="glass-spaces-workspace__glass" aria-hidden="true" />

      <header
        className="research-chrome glass-spaces-chrome"
        onPointerDownCapture={() => armGlassSpacesOverlayPointer(true)}
      >
        <div className="glass-spaces-chrome__left">
          <button
            type="button"
            className={`glass-spaces-chrome__saved-toggle${savedListOpen ? " glass-spaces-chrome__saved-toggle--open" : ""}`}
            onClick={toggleSavedList}
            onPointerDown={prepareGlassTextPointerDown}
            aria-expanded={savedListOpen}
            data-testid="glass-spaces-saved-toggle"
          >
            Saved pathways
          </button>
        </div>

        <h1 className="glass-spaces-chrome__title">Spaces · Glass Pathways</h1>

        <div className="glass-spaces-chrome__right">
          <button
            type="button"
            className="ws-chrome-theme"
            onClick={toggleTheme}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            data-testid="glass-spaces-theme"
          >
            <span className="ws-chrome-theme__icon" aria-hidden="true">
              <Sun size={14} strokeWidth={2} />
            </span>
            <span>{theme === "light" ? "Light" : "Dark"}</span>
          </button>
          <button
            type="button"
            className="ws-chrome-exit"
            onClick={handleHide}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label="Exit Spaces"
            data-testid="glass-spaces-exit"
          >
            Exit Spaces
          </button>
        </div>
      </header>

      <div
        className="glass-spaces-workspace__main"
        onPointerDownCapture={() => armGlassSpacesOverlayPointer(true)}
      >
        <SpacesPanel
          variant="workspace"
          theme={theme}
          savedListOpen={savedListOpen}
          onToggleSavedList={toggleSavedList}
        />
      </div>
    </div>
  );
}
