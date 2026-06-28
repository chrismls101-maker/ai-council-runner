import { FolderKanban, Wand2 } from "lucide-react";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";
import "./GlassStorageProjectsEmptyHero.css";

interface Props {
  onCapture?: () => void;
}

export function GlassStorageProjectsEmptyHero({ onCapture }: Props): JSX.Element {
  const handleCapture = (): void => {
    if (onCapture) {
      onCapture();
      return;
    }
    window.glass.closeGlassStorageProjects();
  };

  return (
    <div className="gsp-empty-hero" data-testid="glass-storage-projects-empty-hero">
      <div className="gsp-empty-hero__preview" aria-hidden="true">
        <div className="gsp-empty-hero__preview-frame">
          <span className="gsp-empty-hero__preview-label">Live preview</span>
          <div className="gsp-empty-hero__preview-placeholder" />
        </div>
      </div>

      <div className="gsp-empty-hero__card">
        <div className="gsp-empty-hero__icon" aria-hidden="true">
          <FolderKanban size={28} strokeWidth={1.5} />
        </div>
        <div className="gsp-empty-hero__chip">Glass Storage</div>
        <h2 className="gsp-empty-hero__title">No saved projects yet</h2>
        <p className="gsp-empty-hero__desc">
          Capture a design with the wand, run Design to Code, and your output auto-saves here —
          capture preview, generated code, revisions, and Aletheia notes.
        </p>
        <button
          type="button"
          className="gsp-empty-hero__cta"
          onPointerDown={prepareGlassTextPointerDown}
          onClick={handleCapture}
        >
          <Wand2 size={16} strokeWidth={1.75} aria-hidden="true" />
          Capture a design
        </button>
        <p className="gsp-empty-hero__hint">
          Use the wand on any feed card, then check back here after a successful run.
        </p>
      </div>
    </div>
  );
}
