import { FolderOpen, FolderPlus } from "lucide-react";
import type { GlassState } from "../../shared/ipc.ts";
import { projectFolderLabel } from "../../shared/recentCoderProjects.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import "../workspace/workspaceChrome.css";
import "./GlassIdeProjectGate.css";

export interface GlassIdeProjectGateProps {
  state: GlassState;
  /** Switching project from an open workspace — show cancel instead of exit-only. */
  switching?: boolean;
  title?: string;
  subtitle?: string;
  icon?: string;
  onOpenFolder: () => void;
  onCreateProject?: () => void;
  onSelectRecent: (folderPath: string) => void;
  onCancel?: () => void;
  onExit: () => void;
  onContinueLast?: () => void;
  /** Header already shows exit — hide duplicate footer link */
  hideFooterExit?: boolean;
  /** Inside a full-screen workspace shell — no extra dark scrim behind the card */
  embedded?: boolean;
}

export function GlassIdeProjectGate({
  state,
  switching = false,
  title = "Glass Coder IDE",
  subtitle = "Open or create a project folder to edit, run builds, and review agent changes.",
  icon = "◇",
  onOpenFolder,
  onCreateProject,
  onSelectRecent,
  onCancel,
  onExit,
  onContinueLast,
  hideFooterExit = false,
  embedded = true,
}: GlassIdeProjectGateProps): JSX.Element {
  const recents = (state.glassSettings.recentCoderProjects ?? []).filter(Boolean);
  const lastSession = state.glassSettings.lastCoderSession;
  const canContinue =
    Boolean(lastSession?.prompt?.trim())
    && lastSession
    && Date.now() - lastSession.at < 24 * 60 * 60 * 1000
    && Boolean(state.glassSettings.agentCodeWorkspaceRoot?.trim());

  return (
    <div
      className={`gide-project-gate${embedded ? " gide-project-gate--workspace" : ""}`}
      data-testid="glass-ide-project-gate"
    >
      <div className="gide-project-gate__card">
        <div className="gide-project-gate__icon" aria-hidden="true">{icon}</div>
        <h1 className="gide-project-gate__title">{title}</h1>
        <p className="gide-project-gate__subtitle">
          {subtitle}
        </p>

        <div className="gide-project-gate__actions">
          <button
            type="button"
            className="gide-project-gate__action"
            data-testid="glass-ide-project-gate-open"
            onClick={onOpenFolder}
            onPointerDown={ensureOverlayInteractive}
          >
            <span className="gide-project-gate__action-icon" aria-hidden="true">
              <FolderOpen size={22} strokeWidth={1.65} />
            </span>
            <span className="gide-project-gate__action-label">Open folder</span>
            <span className="gide-project-gate__action-desc">Browse an existing project</span>
          </button>

          {onCreateProject ? (
            <button
              type="button"
              className="gide-project-gate__action"
              data-testid="glass-ide-project-gate-create"
              onClick={onCreateProject}
              onPointerDown={ensureOverlayInteractive}
            >
              <span className="gide-project-gate__action-icon" aria-hidden="true">
                <FolderPlus size={22} strokeWidth={1.65} />
              </span>
              <span className="gide-project-gate__action-label">New project</span>
              <span className="gide-project-gate__action-desc">Create a blank folder</span>
            </button>
          ) : null}
        </div>

        {canContinue && onContinueLast ? (
          <GlassHoverTooltip label="Resume your last Glass Coder task" placement="bottom">
            <button
              type="button"
              className="gide-project-gate__secondary"
              onClick={onContinueLast}
              onPointerDown={ensureOverlayInteractive}
            >
              Continue last task
            </button>
          </GlassHoverTooltip>
        ) : null}

        {recents.length > 0 ? (
          <div className="gide-project-gate__recents">
            <div className="gide-project-gate__recents-label">Recent projects</div>
            <ul className="gide-project-gate__list">
              {recents.map((folderPath) => {
                const active =
                  state.glassSettings.agentCodeWorkspaceRoot?.trim() === folderPath.trim();
                return (
                  <li key={folderPath}>
                    <button
                      type="button"
                      className={`gide-project-gate__recent${active ? " gide-project-gate__recent--active" : ""}`}
                      onClick={() => onSelectRecent(folderPath)}
                      onPointerDown={ensureOverlayInteractive}
                      title={folderPath}
                    >
                      <span className="gide-project-gate__recent-name">
                        {projectFolderLabel(folderPath)}
                      </span>
                      <span className="gide-project-gate__recent-path">{folderPath}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {(switching && onCancel) || !hideFooterExit ? (
        <div className="gide-project-gate__footer">
          {switching && onCancel ? (
            <button
              type="button"
              className="gide-project-gate__link"
              onClick={onCancel}
              onPointerDown={ensureOverlayInteractive}
            >
              Cancel
            </button>
          ) : hideFooterExit ? null : (
            <button
              type="button"
              className="ws-chrome-exit"
              onClick={onExit}
              onPointerDown={ensureOverlayInteractive}
            >
              Exit
            </button>
          )}
        </div>
        ) : null}
      </div>
    </div>
  );
}
