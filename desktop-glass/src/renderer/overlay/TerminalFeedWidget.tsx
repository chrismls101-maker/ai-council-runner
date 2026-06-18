import { useRef, useState, useCallback, useEffect } from "react";
import type { LiveTerminalFeed, LiveTerminalLine } from "../../shared/ipc.ts";
import { send } from "../useGlassState.ts";

const MAX_DISPLAY_LINES = 18;

function lineClassName(kind: LiveTerminalLine["kind"]): string {
  switch (kind) {
    case "command": return "tfeed-line tfeed-line--cmd";
    case "error":   return "tfeed-line tfeed-line--err";
    case "system":  return "tfeed-line tfeed-line--sys";
    default:        return "tfeed-line tfeed-line--out";
  }
}

function StatusDot({ success }: { success: boolean | null }): JSX.Element {
  const cls =
    success === null
      ? "tfeed-dot tfeed-dot--idle"
      : success
        ? "tfeed-dot tfeed-dot--ok"
        : "tfeed-dot tfeed-dot--fail";
  return <span className={cls} aria-hidden="true" />;
}

interface Props {
  feed: LiveTerminalFeed;
  /** Position as percent of overlay viewport (top-left origin). */
  pos: { x: number; y: number };
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function TerminalFeedWidget({
  feed,
  pos,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const displayLines = feed.lines.slice(-MAX_DISPLAY_LINES);

  // Auto-scroll to bottom when lines update
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [feed.lines.length]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    },
    [pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging || !dragStart.current || !rootRef.current) return;
      const parent = rootRef.current.offsetParent as HTMLElement | null;
      const pw = parent?.offsetWidth ?? window.innerWidth;
      const ph = parent?.offsetHeight ?? window.innerHeight;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const newX = Math.max(0, Math.min(100, dragStart.current.px + (dx / pw) * 100));
      const newY = Math.max(0, Math.min(85, dragStart.current.py + (dy / ph) * 100));
      send({ type: "terminal-widget-move", x: newX, y: newY });
    },
    [dragging],
  );

  const onPointerUp = useCallback(() => {
    setDragging(false);
    dragStart.current = null;
  }, []);

  const exitLabel =
    feed.lastExitCode !== null
      ? feed.lastExitSuccess
        ? `✓ exit 0`
        : `✗ exit ${feed.lastExitCode}`
      : null;

  return (
    <div
      ref={rootRef}
      className={`tfeed-root${dragging ? " tfeed-root--dragging" : ""}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      data-testid="glass-terminal-widget"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={(e) => {
        if (dragging) return;
        onPointerLeave();
      }}
    >
      {/* Header / drag handle */}
      <div
        className="tfeed-header"
        onPointerDown={onHeaderPointerDown}
        onPointerEnter={onPointerEnter}
      >
        <StatusDot success={feed.lastExitSuccess} />
        <span className="tfeed-app">{feed.appName ?? "Terminal"}</span>
        {feed.activeCommand ? (
          <span className="tfeed-cmd-preview" title={feed.activeCommand}>
            {feed.activeCommand.length > 40
              ? `${feed.activeCommand.slice(0, 40)}…`
              : feed.activeCommand}
          </span>
        ) : (
          <span className="tfeed-cmd-preview tfeed-cmd-preview--idle">idle</span>
        )}
        {exitLabel ? (
          <span className={`tfeed-exit${feed.lastExitSuccess ? " tfeed-exit--ok" : " tfeed-exit--fail"}`}>
            {exitLabel}
          </span>
        ) : null}
        <button
          type="button"
          className="tfeed-close"
          title="Hide terminal widget"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Output body */}
      <div ref={bodyRef} className="tfeed-body" onPointerEnter={onPointerEnter}>
        {displayLines.length === 0 ? (
          <div className="tfeed-empty">Waiting for terminal activity…</div>
        ) : (
          displayLines.map((line, i) => (
            <div key={i} className={lineClassName(line.kind)}>
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
