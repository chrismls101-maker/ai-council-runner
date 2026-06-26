import { send } from "../useGlassState.ts";
import type { GlassState } from "../../shared/ipc.ts";
import { CopyButton } from "../components/CopyButton.tsx";
import { IivoAnalysisPanel } from "../components/IivoAnalysisPanel.tsx";

function NoteList({ items, empty }: { items: string[]; empty: string }): JSX.Element {
  if (items.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="note-list">
      {items.map((item, idx) => (
        <li key={idx}>{item}</li>
      ))}
    </ul>
  );
}

export function SummaryView({ state }: { state: GlassState }): JSX.Element {
  const hasSession = !!state.session;
  const summary = hasSession ? state.sessionSummary : state.notes.summary;
  const analysisRunning = state.iivoAnalysis.status === "running";
  const sendBusy =
    state.sessionActionStatus === "preparing" || state.sessionActionStatus === "sending";

  return (
    <>
      <p className="section-title">{hasSession ? "Session summary" : "Summary"}</p>
      {summary ? (
        <div className="summary-box" style={{ whiteSpace: "pre-wrap" }}>
          {summary}
        </div>
      ) : (
        <p className="empty">
          No summary yet. Start a session, capture screens, and add notes — then
          Extract Insights.
        </p>
      )}
      {hasSession ? (
        <>
          <div className="transcript__row">
            <CopyButton className="gbtn" text={summary ?? ""} disabled={!summary}>
              Copy Summary
            </CopyButton>
            <button
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "session-send-summary" })}
              disabled={!summary}
            >
              Send Summary to IIVO
            </button>
          </div>
          <div className="transcript__row">
            <button
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "session-open-in-iivo" })}
              disabled={!summary || sendBusy}
            >
              Open in IIVO
            </button>
            <button
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "session-analyze-now" })}
              disabled={!summary || sendBusy || analysisRunning}
            >
              {analysisRunning ? "Analyzing…" : "Analyze Now"}
            </button>
          </div>
          <p className="empty">
            Open in IIVO creates a Context Bridge item and opens the browser.
            Analyze Now sends the session to your configured IIVO server.
          </p>
          <IivoAnalysisPanel analysis={state.iivoAnalysis} />
        </>
      ) : (
        <>
          <p className="section-title">Key ideas</p>
          <NoteList items={state.notes.keyIdeas} empty="No key ideas detected yet." />
        </>
      )}
    </>
  );
}
