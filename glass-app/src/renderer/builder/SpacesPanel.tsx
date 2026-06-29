import { SPACES_MODES } from "../../shared/glassPathwaysTypes.ts";
import { GlassPathwaysView } from "./GlassPathwaysView.tsx";
import "./SpacesPanel.css";

interface SpacesPanelProps {
  onClose?: () => void;
  /** strip-launcher = compact popover over Spaces tab; workspace = full-screen shell */
  variant?: "strip-launcher" | "workspace";
  theme?: "light" | "dark";
  savedListOpen?: boolean;
  onToggleSavedList?: () => void;
}

export function SpacesPanel({
  onClose,
  variant = "strip-launcher",
  theme = "dark",
  savedListOpen = false,
  onToggleSavedList,
}: SpacesPanelProps): JSX.Element {
  const isWorkspace = variant === "workspace";

  const handleOpenMode = (modeId: string): void => {
    if (modeId === "glass-pathways") {
      window.glass.openGlassSpaces();
      onClose?.();
    }
  };

  return (
    <div
      className={`spaces-panel spaces-panel--${variant} spaces-panel--${theme}`}
      data-testid="glass-spaces-panel"
    >
      {!isWorkspace ? (
        <>
          <div className="spaces-panel__header spaces-panel__header--launcher">
            <span className="spaces-panel__brand">Spaces</span>
            {onClose ? (
              <button
                type="button"
                className="spaces-panel__close"
                onClick={onClose}
                aria-label="Close Spaces panel"
              >
                ✕
              </button>
            ) : null}
          </div>
          <div className="spaces-panel__launcher" role="list">
            {SPACES_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="spaces-panel__mode-card"
                role="listitem"
                onClick={() => handleOpenMode(m.id)}
                data-testid={`glass-spaces-open-${m.id}`}
              >
                <span className="spaces-panel__mode-label">{m.label}</span>
                <span className="spaces-panel__mode-hint">Open full screen</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="spaces-panel__body">
          <GlassPathwaysView
            layout="workspace"
            theme={theme}
            savedListOpen={savedListOpen}
            onToggleSavedList={onToggleSavedList}
          />
        </div>
      )}
    </div>
  );
}
