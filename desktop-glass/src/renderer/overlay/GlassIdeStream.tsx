/**
 * Glass IDE — timeline activity feed (Phase A stream column).
 */

import { useMemo, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import { buildGlassIdeStreamFeed } from "../../shared/glassIdeStreamFeed.ts";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
import { parseMarkdown } from "./GlassResponsePanel.tsx";
import "./GlassIdeStream.css";

export interface GlassIdeStreamProps {
  state: GlassState;
  answer: string;
  runId: string | null;
  taskPrompt?: string;
  onOpenFile?: (relativePath: string) => void;
}

function FeedRow({
  icon,
  label,
  detail,
  tone,
  relativePath,
  onOpenFile,
}: {
  icon: string;
  label: string;
  detail?: string;
  tone: string;
  relativePath?: string;
  onOpenFile?: (relativePath: string) => void;
}): JSX.Element {
  return (
    <li className={`gide-feed-row gide-feed-row--${tone}`}>
      <span className="gide-feed-row__icon" aria-hidden="true">{icon}</span>
      <div className="gide-feed-row__body">
        <div className="gide-feed-row__label-row">
          <span className="gide-feed-row__label">{label}</span>
          {relativePath && onOpenFile ? (
            <button
              type="button"
              className="gide-feed-row__open"
              onClick={() => onOpenFile(relativePath)}
              onPointerDown={ensureOverlayInteractive}
            >
              Open
            </button>
          ) : null}
        </div>
        {detail ? <span className="gide-feed-row__detail">{detail}</span> : null}
      </div>
    </li>
  );
}

export function GlassIdeStream({
  state,
  answer,
  runId,
  taskPrompt,
  onOpenFile,
}: GlassIdeStreamProps): JSX.Element {
  const [outputOpen, setOutputOpen] = useState(false);

  const feed = useMemo(
    () => buildGlassIdeStreamFeed({ state, answer, runId, taskPrompt }),
    [state, answer, runId, taskPrompt],
  );

  const rendered = useMemo(() => (answer.trim() ? parseMarkdown(answer) : null), [answer]);

  return (
    <div className="gide-ide-feed" data-testid="glass-ide-stream">
      {feed.idle ? (
        <p className="gide-feed-idle">{feed.idleLabel}</p>
      ) : (
        <ul className="gide-feed-list" onWheel={handlePaletteListWheel}>
          {feed.items.map((item) => (
            <FeedRow
              key={item.id}
              icon={item.icon}
              label={item.label}
              detail={item.detail}
              tone={item.tone}
              relativePath={item.relativePath}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      )}

      {feed.showQaFixAll && feed.qaRunId ? (
        <div className="gide-feed-qa-actions">
          <button
            type="button"
            className="gide-feed-qa-fix"
            onClick={() => void window.glass.qaPipelineFixAll({ runId: feed.qaRunId! })}
            onPointerDown={ensureOverlayInteractive}
          >
            Fix all QA issues
          </button>
        </div>
      ) : null}

      {feed.hasStreamOutput ? (
        <details
          className="gide-feed-output"
          open={outputOpen}
          onToggle={(e) => setOutputOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            className="gide-feed-output__summary"
            onPointerDown={ensureOverlayInteractive}
          >
            Agent output
            <span className="gide-feed-output__hint">expand for full detail</span>
          </summary>
          <div
            className="gide-feed-output__body glass-selectable-text"
            onWheel={handlePaletteListWheel}
            onPointerDown={ensureOverlayInteractive}
          >
            {rendered}
          </div>
        </details>
      ) : null}
    </div>
  );
}
