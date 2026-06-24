import { parseMarkdown } from "./GlassResponsePanel.tsx";
import type { CoderTranscriptCollapsedTextItem } from "../../shared/glassIdeTranscriptCollapse.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

interface GlassIdeTranscriptReasoningProps {
  item: CoderTranscriptCollapsedTextItem;
  showCaret?: boolean;
}

export function GlassIdeTranscriptReasoning({
  item,
  showCaret = false,
}: GlassIdeTranscriptReasoningProps): JSX.Element {
  return (
    <details
      className="gide-transcript-reasoning"
      data-testid="glass-ide-transcript-reasoning"
      onPointerDown={ensureOverlayInteractive}
    >
      <summary className="gide-transcript-reasoning__summary">
        <span className="gide-transcript-reasoning__label">Reasoning</span>
        <span className="gide-transcript-reasoning__preview">{item.preview}</span>
      </summary>
      <div className="gide-transcript-reasoning__body glass-selectable-text">
        {parseMarkdown(item.text)}
        {showCaret ? <span className="gide-transcript__caret" aria-hidden="true" /> : null}
      </div>
    </details>
  );
}
