import type { IivoAnalysisState } from "../../shared/ipc.ts";
import { send } from "../useGlassState.ts";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be unavailable; ignore */
  }
}

export function IivoAnalysisPanel({ analysis }: { analysis: IivoAnalysisState }): JSX.Element | null {
  if (analysis.status === "idle" && !analysis.text) return null;

  const canOpenInIivo = !!analysis.contextId;
  const isRunning = analysis.status === "running";
  const isFailed = analysis.status === "failed";
  const isDone = analysis.status === "done" && !!analysis.text;

  return (
    <div className="iivo-analysis">
      <p className="section-title">IIVO Analysis</p>
      {analysis.estimatedCredits != null && isRunning ? (
        <p className="empty">Estimated ~{analysis.estimatedCredits} credits.</p>
      ) : null}
      {isRunning ? <p className="empty">Running Council analysis…</p> : null}
      {isFailed ? (
        <>
          <div className="error-banner">{analysis.error ?? "Analysis failed."}</div>
          <div className="transcript__row">
            <button className="gbtn gbtn--primary" onClick={() => send({ type: "session-open-in-iivo" })}>
              Open in IIVO
            </button>
          </div>
        </>
      ) : null}
      {isDone ? (
        <>
          <div className="summary-box" style={{ whiteSpace: "pre-wrap" }}>
            {analysis.text}
          </div>
          <div className="transcript__row">
            <button className="gbtn" onClick={() => void copyText(analysis.text ?? "")}>
              Copy Analysis
            </button>
            {canOpenInIivo ? (
              <button className="gbtn" onClick={() => send({ type: "session-open-in-iivo" })}>
                Open full analysis in IIVO
              </button>
            ) : null}
            <button
              className="gbtn"
              onClick={() =>
                send({
                  type: "save-moment",
                  note: analysis.text?.slice(0, 200) ?? "IIVO analysis",
                  kind: "note",
                })
              }
            >
              Save Moment
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
