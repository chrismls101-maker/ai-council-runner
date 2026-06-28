import { useCallback, useEffect, useState } from "react";
import type { GlassProjectRecord } from "../../shared/glassStorageProjectTypes.ts";
import { glassProjectStatusLabel } from "../../shared/glassStorageProjectTypes.ts";
import {
  DESIGN_STACK_LABELS,
  DESIGN_TO_CODE_ACTION_LABELS,
} from "../../shared/design/designStackRegistry.ts";
import {
  armGlassStorageProjectsOverlayPointer,
  ensureOverlayInteractive,
  prepareGlassTextPointerDown,
} from "../glassTextInteraction.ts";
import "./GlassStorageProjectsBrowser.css";

interface GlassStorageProjectsBrowserProps {
  projects: GlassProjectRecord[];
  compact?: boolean;
  selectedId?: string | null;
  onSelect?: (projectId: string) => void;
  onViewAll?: () => void;
}

function formatWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function ProjectThumb({ projectId, alt }: { projectId: string; alt: string }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.glass.getGlassStorageProjectThumb(projectId).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!src) {
    return <div className="gspb-thumb gspb-thumb--empty" aria-hidden="true" />;
  }
  return <img className="gspb-thumb" src={src} alt={alt} />;
}

export function GlassStorageProjectsBrowser({
  projects,
  compact = false,
  selectedId = null,
  onSelect,
  onViewAll,
}: GlassStorageProjectsBrowserProps): JSX.Element {
  const designProjects = projects.filter((p) => p.kind === "design-to-code");
  const visible = compact ? designProjects.slice(0, 5) : designProjects;

  const handleCardClick = useCallback((projectId: string): void => {
    if (onSelect) {
      onSelect(projectId);
      return;
    }
    window.glass.openGlassStorageProjects(projectId);
  }, [onSelect]);

  if (!designProjects.length) {
    if (compact) {
      return (
        <div className="gspb-empty-inline gspb-empty-inline--compact" data-testid="glass-storage-projects-empty">
          <p className="gspb-empty-inline__title">No saved projects yet</p>
          <p className="gspb-empty-inline__desc">
            Design to Code results auto-save here after each successful run.
          </p>
        </div>
      );
    }
    return (
      <div className="gspb gspb--list-empty" data-testid="glass-storage-projects-empty">
        <div className="gspb-section-head">
          <span className="gspb-section-head__title">Design to Code</span>
          <span className="gspb-section-head__count">0</span>
        </div>
        <p className="gspb-empty-inline__desc gspb-empty-inline__desc--list">
          No projects saved yet.
        </p>
      </div>
    );
  }

  return (
    <div className={`gspb${compact ? " gspb--compact" : ""}`} data-testid="glass-storage-projects-browser">
      {!compact ? (
        <div className="gspb-section-head">
          <span className="gspb-section-head__title">Design to Code</span>
          <span className="gspb-section-head__count">{designProjects.length}</span>
        </div>
      ) : (
        <div className="gspb-section-head gspb-section-head--compact">
          <span className="gspb-section-head__title">Recent</span>
        </div>
      )}

      <ul className="gspb-list">
        {visible.map((project) => {
          const isSelected = selectedId === project.id;
          const actionLabel = project.action
            ? DESIGN_TO_CODE_ACTION_LABELS[project.action]
            : null;
          const stackLabel = project.stack ? DESIGN_STACK_LABELS[project.stack] : null;
          const metaParts = [
            actionLabel,
            stackLabel,
            project.detectedFileName,
          ].filter(Boolean);

          return (
            <li key={project.id}>
              <button
                type="button"
                className={[
                  "gspb-card",
                  isSelected && "gspb-card--selected",
                ].filter(Boolean).join(" ")}
                data-testid={`glass-storage-project-${project.id}`}
                aria-current={isSelected ? "true" : undefined}
                onPointerDown={(event) => {
                  prepareGlassTextPointerDown(event);
                  armGlassStorageProjectsOverlayPointer(true);
                }}
                onClick={() => handleCardClick(project.id)}
              >
                <ProjectThumb projectId={project.id} alt={project.title} />
                <span className="gspb-card__meta">
                  <span className="gspb-card__title">{project.title}</span>
                  <span className="gspb-card__sub">
                    {project.source}
                    {metaParts.length ? ` · ${metaParts.join(" · ")}` : ""}
                  </span>
                  <span className="gspb-card__time">{formatWhen(project.updatedAt)}</span>
                  {project.status !== "ready" ? (
                    <span
                      className={[
                        "gspb-card__status",
                        project.status === "warning" && "gspb-card__status--warn",
                        project.status === "failed" && "gspb-card__status--fail",
                      ].filter(Boolean).join(" ")}
                    >
                      {glassProjectStatusLabel(project.status, project.saveError)}
                    </span>
                  ) : null}
                </span>
                {project.status === "warning" ? (
                  <span className="gspb-card__badge gspb-card__badge--warn" title="Fidelity notes">
                    !
                  </span>
                ) : project.status === "failed" ? (
                  <span className="gspb-card__badge gspb-card__badge--fail" title="Save issue">
                    !
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {compact && designProjects.length > visible.length && onViewAll ? (
        <button
          type="button"
          className="gspb-view-all"
          onClick={onViewAll}
          onPointerDown={ensureOverlayInteractive}
        >
          View all in Projects
        </button>
      ) : null}
    </div>
  );
}
