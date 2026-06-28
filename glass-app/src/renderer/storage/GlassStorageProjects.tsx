/**
 * Glass Storage — Projects full-screen workspace (matches agent explorer glass shell).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sun } from "lucide-react";
import { useGlassState } from "../useGlassState.ts";
import { GlassStorageProjectsBrowser } from "./GlassStorageProjectsBrowser.tsx";
import { DesignToCodeProjectDetail } from "./DesignToCodeProjectDetail.tsx";
import { GlassStorageProjectsEmptyHero } from "./GlassStorageProjectsEmptyHero.tsx";
import {
  armGlassStorageProjectsOverlayPointer,
  prepareGlassTextPointerDown,
} from "../glassTextInteraction.ts";
import "../research/ResearchExplorer.css";
import "../workspace/workspaceChrome.css";
import "./GlassStorageProjects.css";

type Theme = "light" | "dark";
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
  const projects = state.glassStorageProjects ?? [];
  const designProjects = useMemo(
    () => projects.filter((p) => p.kind === "design-to-code"),
    [projects],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    if (!visible) return;
    window.glass.refreshGlassStorageProjects();
    document.body.classList.add("glass-body--workspace-active");
    return () => {
      document.body.classList.remove("glass-body--workspace-active");
    };
  }, [visible]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (!visible) return;
    const fromState = state.glassStorageProjectsSelectedId;
    if (typeof fromState === "string" && designProjects.some((p) => p.id === fromState)) {
      setSelectedId(fromState);
    }
  }, [visible, state.glassStorageProjectsSelectedId, designProjects]);

  useEffect(() => {
    if (!visible || designProjects.length === 0) return;
    setSelectedId((current) => {
      if (current && designProjects.some((p) => p.id === current)) return current;
      const fromState = state.glassStorageProjectsSelectedId;
      if (typeof fromState === "string" && designProjects.some((p) => p.id === fromState)) {
        return fromState;
      }
      return designProjects[0]?.id ?? null;
    });
  }, [visible, designProjects, state.glassStorageProjectsSelectedId]);

  const handleHide = useCallback((): void => {
    onClose();
  }, [onClose]);

  const handleSelectProject = useCallback((projectId: string): void => {
    armGlassStorageProjectsOverlayPointer(true);
    setSelectedId(projectId);
  }, []);

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
        className="glass-storage-chrome"
        onPointerDownCapture={() => armGlassStorageProjectsOverlayPointer(true)}
      >
        <div className="glass-storage-chrome__left">
          <span className="glass-storage-chrome__title">Projects</span>
          <span className="glass-storage-chrome__subtitle">Glass Storage</span>
        </div>
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
            onClick={handleHide}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label="Exit Projects"
          >
            Exit Projects
          </button>
        </div>
      </header>

      <div
        className="glass-storage-projects__main"
        onPointerDownCapture={() => armGlassStorageProjectsOverlayPointer(true)}
      >
        <div className="glass-storage-projects__split">
          <aside className="glass-storage-projects__list-pane">
            <GlassStorageProjectsBrowser
              projects={projects}
              selectedId={selectedId}
              onSelect={handleSelectProject}
            />
          </aside>

          <section className="glass-storage-projects__detail-pane" aria-label="Project detail">
            {selectedId ? (
              <DesignToCodeProjectDetail key={selectedId} projectId={selectedId} />
            ) : designProjects.length === 0 ? (
              <GlassStorageProjectsEmptyHero onCapture={handleHide} />
            ) : (
              <div className="glass-storage-projects__detail-empty">
                <p>Select a saved Design to Code project to view its output, files, and refinements.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
