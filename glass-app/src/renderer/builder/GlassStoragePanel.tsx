import { useEffect } from "react";
import { FolderKanban } from "lucide-react";
import { useGlassState } from "../useGlassState.ts";
import { GlassStorageProjectsBrowser } from "../storage/GlassStorageProjectsBrowser.tsx";
import "./GlassStoragePanel.css";

interface GlassStoragePanelProps {
  onClose: () => void;
  onOpenProjects: () => void;
}

export function GlassStoragePanel({ onClose, onOpenProjects }: GlassStoragePanelProps): JSX.Element {
  const state = useGlassState();
  const projects = state.glassStorageProjects ?? [];

  useEffect(() => {
    window.glass.refreshGlassStorageProjects();
  }, []);

  const handleProjects = (projectId?: string): void => {
    if (projectId) {
      window.glass.openGlassStorageProjects(projectId);
    } else {
      onOpenProjects();
    }
    onClose();
  };

  const handleSelectRecent = (projectId: string): void => {
    handleProjects(projectId);
  };

  return (
    <div className="gsp-panel" data-testid="glass-storage-panel">
      <div className="gsp-header">
        <span className="gsp-title">Glass Storage</span>
        <button
          type="button"
          className="gsp-close"
          onClick={onClose}
          aria-label="Close Glass Storage panel"
        >
          ✕
        </button>
      </div>

      <div className="gsp-body">
        <GlassStorageProjectsBrowser
          projects={projects}
          compact
          onSelect={handleSelectRecent}
          onViewAll={() => handleProjects()}
        />

        <div className="gsp-divider" aria-hidden="true" />

        <button
          type="button"
          className="gsp-item"
          data-testid="glass-storage-projects-item"
          onClick={() => handleProjects()}
        >
          <span className="gsp-item__icon" aria-hidden="true">
            <FolderKanban size={20} strokeWidth={1.75} />
          </span>
          <span className="gsp-item__meta">
            <span className="gsp-item__name">Projects</span>
            <span className="gsp-item__desc">Browse all saved Design to Code projects</span>
          </span>
          <span className="gsp-item__chevron" aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}
