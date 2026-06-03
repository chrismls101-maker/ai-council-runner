import type { ReactNode } from "react";
import type { AgentStatus } from "../types";

type IndicatorStatus = AgentStatus | "pending";

export function InlineStatusIcon({ status }: { status: IndicatorStatus }) {
  if (status === "complete") {
    return (
      <span className="inline-status-icon inline-status-icon-static" aria-hidden="true">
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-status-icon inline-status-icon-static inline-status-icon-error"
        aria-hidden="true"
      >
        !
      </span>
    );
  }
  if (status === "running") {
    return <span className="processing-dot active" aria-hidden="true" />;
  }
  return (
    <span className="inline-status-icon inline-status-icon-static" aria-hidden="true">
      ○
    </span>
  );
}

export function StatusTextLine({
  text,
  running,
}: {
  text: ReactNode;
  running: boolean;
}) {
  if (typeof text !== "string") {
    return (
      <span className={`inline-status-text${running ? " status-text-active" : ""}`}>
        {text}
        {running && (
          <span className="thinking-ellipsis" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
      </span>
    );
  }

  const display = running ? text.replace(/(\u2026|\.\.\.)$/, "") : text;
  return (
    <span className={`inline-status-text${running ? " status-text-active" : ""}`}>
      {display}
      {running && (
        <span className="thinking-ellipsis" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      )}
    </span>
  );
}
