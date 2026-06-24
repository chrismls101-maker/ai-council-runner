import type { MouseEvent } from "react";
import { X } from "lucide-react";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";

export type WorkspaceSessionTab = {
  id: string;
  title: string;
};

interface Props {
  sessions: WorkspaceSessionTab[];
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
  onClose: (sessionId: string, event: MouseEvent) => void;
  shortenTitle?: (title: string, max?: number) => string;
  ariaLabel?: string;
}

function defaultShorten(title: string, max = 28): string {
  if (!title) return "Untitled";
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

export function WorkspaceSessionTabs({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
  shortenTitle = defaultShorten,
  ariaLabel = "Open sessions",
}: Props): JSX.Element {
  return (
    <div className="ws-tabs" role="tablist" aria-label={ariaLabel}>
      {sessions.map((session, index) => {
        const active = session.id === activeSessionId;
        return (
          <div key={session.id} className="ws-tab-item">
            {index > 0 ? <span className="ws-tab-divider" aria-hidden="true" /> : null}
            <div className={`ws-tab${active ? " ws-tab--active" : ""}`}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="ws-tab__main"
                onClick={() => onSelect(session.id)}
                onPointerDown={prepareGlassTextPointerDown}
                title={session.title}
              >
                {shortenTitle(session.title)}
              </button>
              <button
                type="button"
                className="ws-tab__close"
                onClick={(event) => onClose(session.id, event)}
                onPointerDown={prepareGlassTextPointerDown}
                aria-label={`Close ${session.title}`}
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
