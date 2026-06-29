/**
 * Glass Storage — full-screen workspace (Files tab).
 */
import { useCallback, useEffect, useState } from "react";
import { Sun } from "lucide-react";
import { useGlassState } from "../useGlassState.ts";
import { GlassStorageFilesTab } from "./GlassStorageFilesTab.tsx";
import {
  armGlassStorageProjectsOverlayPointer,
  prepareGlassTextPointerDown,
} from "../glassTextInteraction.ts";
import "../research/ResearchExplorer.css";
import "../workspace/workspaceChrome.css";
import "./GlassStorageProjects.css";

type Theme = "light" | "dark";
type StorageTab = "files";

const THEME_KEY = "glass-storage-projects-theme";

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

interface Props {
  visible?: boolean;
  onClose: () => void;
}

export function GlassStorageProjects({ visible = true, onClose }: Props): JSX.Element {
  const state = useGlassState();
  const files = state.glassStorageFiles ?? [];
  const [tab] = useState<StorageTab>("files");
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  const refreshFiles = useCallback((): void => {
    window.glass.refreshGlassStorageFiles();
  }, []);

  useEffect(() => {
    if (!visible) return;
    refreshFiles();
    document.body.classList.add("glass-body--workspace-active");
    return () => {
      document.body.classList.remove("glass-body--workspace-active");
    };
  }, [visible, refreshFiles]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <div
      className={[
        "glass-storage-projects",
        `glass-storage-projects--${theme}`,
        !visible && "glass-storage-projects--hidden",
      ].filter(Boolean).join(" ")}
      data-testid="glass-storage-projects-shell"
    >
      <div className="glass-storage-projects__glass" aria-hidden="true" />

      <header
        className="glass-storage-chrome glass-storage-chrome--tabbed"
        onPointerDownCapture={() => armGlassStorageProjectsOverlayPointer(true)}
      >
        <div className="glass-storage-chrome__left">
          <span className="glass-storage-chrome__title">Glass Storage</span>
        </div>

        <nav className="ws-tabs glass-storage-chrome__tabs" aria-label="Glass Storage sections">
          <div className="ws-tab-item">
            <button
              type="button"
              className={`ws-tab ws-tab--active`}
              aria-current="page"
              data-testid="glass-storage-tab-files"
            >
              <span className="ws-tab__main">
                <span className="ws-tab__label">Files</span>
              </span>
            </button>
          </div>
        </nav>

        <div className="glass-storage-chrome__right">
          <button
            type="button"
            className="ws-chrome-theme"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            <span className="ws-chrome-theme__icon" aria-hidden="true">
              <Sun size={14} strokeWidth={1.75} />
            </span>
            <span>{theme === "light" ? "Light" : "Dark"}</span>
          </button>
          <button
            type="button"
            className="ws-chrome-exit"
            onClick={onClose}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label="Exit Glass Storage"
          >
            Exit Storage
          </button>
        </div>
      </header>

      <div
        className="glass-storage-projects__main glass-storage-projects__main--files"
        onPointerDownCapture={() => armGlassStorageProjectsOverlayPointer(true)}
      >
        {tab === "files" ? (
          <GlassStorageFilesTab files={files} onRefresh={refreshFiles} />
        ) : null}
      </div>
    </div>
  );
}
