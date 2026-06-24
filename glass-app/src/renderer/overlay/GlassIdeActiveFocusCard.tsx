import type { GlassIdeActiveFocusModel } from "../../shared/glassIdeActiveFocus.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeActiveFocusCardProps {
  focus: GlassIdeActiveFocusModel;
  onOpenFile?: (relativePath: string) => void;
  onTrustEdits?: (runId: string) => void;
}

export function GlassIdeActiveFocusCard({
  focus,
  onOpenFile,
  onTrustEdits,
}: GlassIdeActiveFocusCardProps): JSX.Element | null {
  if (!focus.visible) return null;

  return (
    <section
      className={`gide-active-focus gide-active-focus--${focus.tone}`}
      data-testid="glass-ide-active-focus"
      aria-live="polite"
    >
      <div className="gide-active-focus__main">
        <span className="gide-active-focus__eyebrow">{focus.eyebrow}</span>
        <p className="gide-active-focus__title" title={focus.title}>{focus.title}</p>
        {focus.detail ? (
          <p className="gide-active-focus__detail">{focus.detail}</p>
        ) : null}
      </div>
      <div className="gide-active-focus__aside">
        {focus.showTrustEdits && focus.runId && onTrustEdits ? (
          <button
            type="button"
            className="gide-active-focus__trust"
            data-testid="glass-ide-trust-edits"
            onClick={() => onTrustEdits(focus.runId!)}
            onPointerDown={ensureOverlayInteractive}
          >
            Trust edits for this run
          </button>
        ) : null}
        {focus.relativePath && onOpenFile ? (
          <button
            type="button"
            className="gide-active-focus__open"
            onClick={() => onOpenFile(focus.relativePath!)}
            onPointerDown={ensureOverlayInteractive}
          >
            Open
          </button>
        ) : null}
        {focus.usageLine ? (
          <span className="gide-active-focus__usage">{focus.usageLine}</span>
        ) : null}
      </div>
    </section>
  );
}
