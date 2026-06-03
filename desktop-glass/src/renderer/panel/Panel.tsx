import { useEffect, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { StatusPill } from "../components/StatusPill.tsx";
import type { PanelTab, SavedMoment } from "../../shared/types.ts";
import type { ExtractedNotes } from "../../shared/types.ts";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "insights", label: "Insights" },
  { id: "context", label: "Context" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "actions", label: "Actions" },
];

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

function TabContent({ tab, notes }: { tab: PanelTab; notes: ExtractedNotes }): JSX.Element {
  switch (tab) {
    case "summary":
      return (
        <>
          <p className="section-title">Summary</p>
          {notes.summary ? (
            <div className="summary-box">{notes.summary}</div>
          ) : (
            <p className="empty">
              No summary yet. Add transcript text or capture a screen, then save a
              moment.
            </p>
          )}
          <p className="section-title">Key ideas</p>
          <NoteList items={notes.keyIdeas} empty="No key ideas detected yet." />
        </>
      );
    case "insights":
      return (
        <>
          <p className="section-title">Key ideas</p>
          <NoteList items={notes.keyIdeas} empty="No insights detected yet." />
        </>
      );
    case "hypotheses":
      return (
        <>
          <p className="section-title">Hypotheses</p>
          <NoteList
            items={notes.hypotheses}
            empty="No hypotheses detected. Try phrases like 'maybe', 'I think', 'what if'."
          />
        </>
      );
    case "actions":
      return (
        <>
          <p className="section-title">Action items</p>
          <NoteList
            items={notes.actionItems}
            empty="No action items detected. Try 'we need to', 'next step', 'follow up'."
          />
        </>
      );
    case "context":
      return (
        <>
          <p className="section-title">Open questions</p>
          <NoteList items={notes.questions} empty="No questions detected yet." />
        </>
      );
    default:
      return <p className="empty">—</p>;
  }
}

function Transcript({ transcript }: { transcript: string }): JSX.Element {
  const [draft, setDraft] = useState("");

  return (
    <div className="transcript">
      <p className="section-title">Live transcript (manual input v1)</p>
      <p className="empty">
        Listening engine not connected yet. Paste transcript or use screen capture.
      </p>
      {transcript ? (
        <div className="summary-box" style={{ whiteSpace: "pre-wrap" }}>
          {transcript}
        </div>
      ) : null}
      <textarea
        value={draft}
        placeholder="Type or paste what is being said…"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="transcript__row">
        <button
          className="gbtn gbtn--primary"
          disabled={!draft.trim()}
          onClick={() => {
            if (!draft.trim()) return;
            send({ type: "append-transcript", text: draft.trim() });
            setDraft("");
          }}
        >
          Add to transcript
        </button>
        <button
          className="gbtn"
          disabled={!transcript}
          onClick={() => send({ type: "save-moment", kind: "transcript" })}
        >
          Save Moment
        </button>
        <button
          className="gbtn"
          disabled={!transcript}
          onClick={() => send({ type: "send-transcript" })}
        >
          Send to IIVO
        </button>
        <button
          className="gbtn gbtn--ghost"
          disabled={!transcript}
          onClick={() => send({ type: "clear-transcript" })}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function MomentCard({ moment }: { moment: SavedMoment }): JSX.Element {
  const time = new Date(moment.createdAt).toLocaleTimeString();
  return (
    <div className="moment">
      <div className="moment__meta">
        <span className="moment__kind">{moment.kind}</span>
        <span>{time}</span>
      </div>
      {moment.sourceTitle ? (
        <div className="moment__meta">
          <span>{moment.sourceTitle}</span>
        </div>
      ) : null}
      <div className="moment__note">{moment.note}</div>
      <div className="moment__actions">
        <button className="gbtn" onClick={() => send({ type: "send-moment", id: moment.id })}>
          {moment.sentToIivo ? "Open in IIVO" : "Send to IIVO"}
        </button>
        <button
          className="gbtn gbtn--danger"
          onClick={() => send({ type: "delete-moment", id: moment.id })}
        >
          Delete
        </button>
        {moment.sentToIivo ? <span className="badge-sent">✓ sent</span> : null}
      </div>
    </div>
  );
}

export function Panel(): JSX.Element {
  const state = useGlassState();
  const [tab, setTab] = useState<PanelTab>(state.panelTab);

  useEffect(() => {
    setTab(state.panelTab);
  }, [state.panelTab]);

  return (
    <div className="panel">
      <div className="panel__header">
        <div className="panel__brand">
          <span className="dock__logo" />
          <div>
            <div className="panel__title">IIVO Glass</div>
            <div className="panel__subtitle">AI Overlay Companion</div>
          </div>
        </div>
        <StatusPill status={state.privacy.status} />
      </div>

      {state.lastError ? <div className="error-banner">{state.lastError}</div> : null}

      <div className="panel__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${t.id === tab ? "tab--active" : ""}`}
            onClick={() => {
              setTab(t.id);
              send({ type: "set-tab", tab: t.id });
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel__body">
        <TabContent tab={tab} notes={state.notes} />

        <Transcript transcript={state.transcript} />

        <p className="section-title" style={{ marginTop: 16 }}>
          Saved moments ({state.moments.length})
        </p>
        {state.moments.length === 0 ? (
          <p className="empty">No saved moments yet.</p>
        ) : (
          state.moments.map((m) => <MomentCard key={m.id} moment={m} />)
        )}
        {state.moments.length > 0 ? (
          <button
            className="gbtn gbtn--ghost"
            onClick={() => send({ type: "clear-moments" })}
          >
            Clear all moments
          </button>
        ) : null}
      </div>

      <div className="privacy">
        <div className="privacy__row">
          <span className={`privacy__flag ${state.privacy.listening ? "privacy__flag--on" : ""}`}>
            {state.privacy.listening ? "● Listening" : "○ Not listening"}
          </span>
          <span className={`privacy__flag ${state.privacy.capturing ? "privacy__flag--on" : ""}`}>
            {state.privacy.capturing ? "● Capturing" : "○ Not capturing"}
          </span>
          <button className="gbtn gbtn--danger" onClick={() => send({ type: "stop" })}>
            Stop everything
          </button>
        </div>
        <div>IIVO Glass only captures when you press Capture or Start Listening.</div>
      </div>
    </div>
  );
}
