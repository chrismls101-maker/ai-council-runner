import { useEffect, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { StatusPill } from "../components/StatusPill.tsx";
import { SessionPill } from "../components/SessionPill.tsx";
import type { GlassState } from "../../shared/ipc.ts";
import type { PanelTab, SavedMoment } from "../../shared/types.ts";
import type { ExtractedNotes } from "../../shared/types.ts";
import type {
  GlassInsightType,
  GlassSession,
  GlassSessionEvent,
  GlassSessionInsight,
} from "../../shared/sessionTypes.ts";
import { INSIGHT_TYPE_LABELS } from "../../shared/sessionIntelligence.ts";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "session", label: "Session" },
  { id: "insights", label: "Insights" },
  { id: "context", label: "Context" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "actions", label: "Actions" },
];

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be unavailable; ignore */
  }
}

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

// ---------- Summary tab ----------
function SummaryView({ state }: { state: GlassState }): JSX.Element {
  const hasSession = !!state.session;
  const summary = hasSession ? state.sessionSummary : state.notes.summary;
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
        <div className="transcript__row">
          <button className="gbtn" onClick={() => void copyText(summary)} disabled={!summary}>
            Copy Summary
          </button>
          <button
            className="gbtn gbtn--primary"
            onClick={() => send({ type: "session-send-summary" })}
            disabled={!summary}
          >
            Send Summary to IIVO
          </button>
        </div>
      ) : (
        <>
          <p className="section-title">Key ideas</p>
          <NoteList items={state.notes.keyIdeas} empty="No key ideas detected yet." />
        </>
      )}
    </>
  );
}

// ---------- Session tab ----------
const EVENT_FILTERS = ["All", "Captures", "Notes", "Insights", "Actions", "Risks"] as const;
type EventFilter = (typeof EVENT_FILTERS)[number];

function eventMatchesFilter(e: GlassSessionEvent, filter: EventFilter): boolean {
  switch (filter) {
    case "Captures":
      return e.kind === "screen_capture";
    case "Notes":
      return e.kind === "manual_note" || e.kind === "transcript_note" || e.kind === "saved_moment";
    default:
      return true;
  }
}

function EventCard({ event }: { event: GlassSessionEvent }): JSX.Element {
  const time = new Date(event.timestamp).toLocaleTimeString();
  return (
    <div className="moment">
      <div className="moment__meta">
        <span className="moment__kind">{event.kind.replace(/_/g, " ")}</span>
        <span>
          {event.importance ? `${event.importance} · ` : ""}
          {time}
        </span>
      </div>
      {event.sourceTitle ? (
        <div className="moment__meta">
          <span>{event.sourceTitle}</span>
        </div>
      ) : null}
      <div className="moment__note">{event.title}</div>
      {event.screenshotDataUrl ? (
        <img className="event-thumb" src={event.screenshotDataUrl} alt="capture" />
      ) : null}
      <div className="moment__actions">
        <button className="gbtn" onClick={() => send({ type: "session-send-event", id: event.id })}>
          Send to IIVO
        </button>
        <button
          className="gbtn gbtn--danger"
          onClick={() => send({ type: "session-delete-event", id: event.id })}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ManualNoteBox(): JSX.Element {
  const [draft, setDraft] = useState("");
  return (
    <div className="transcript">
      <p className="section-title">Manual note</p>
      <textarea
        value={draft}
        placeholder="Type a note for this session…"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="transcript__row">
        <button
          className="gbtn gbtn--primary"
          disabled={!draft.trim()}
          onClick={() => {
            send({ type: "session-add-note", text: draft.trim() });
            setDraft("");
          }}
        >
          Add to Session
        </button>
        <button
          className="gbtn"
          disabled={!draft.trim()}
          onClick={() => {
            send({ type: "save-moment", note: draft.trim() });
            setDraft("");
          }}
        >
          Save Moment
        </button>
        <button className="gbtn" onClick={() => send({ type: "session-extract-insights" })}>
          Extract Insights
        </button>
      </div>
    </div>
  );
}

function SessionView({ session }: { session: GlassSession | null }): JSX.Element {
  const [filter, setFilter] = useState<EventFilter>("All");

  if (!session) {
    return (
      <p className="empty">
        No session yet. Click <strong>Start Session</strong> in the dock to begin a
        local work session.
      </p>
    );
  }

  const insightFilter: Record<string, GlassInsightType> = { Actions: "action", Risks: "risk" };
  const showInsights = filter === "Insights" || filter === "Actions" || filter === "Risks";
  const insights = showInsights
    ? session.insights.filter((i) => (filter in insightFilter ? i.type === insightFilter[filter] : true))
    : [];
  const events = !showInsights
    ? [...session.events].reverse().filter((e) => eventMatchesFilter(e, filter))
    : [];

  return (
    <>
      <div className="session-head">
        <div>
          <div className="panel__title">{session.title}</div>
          <div className="panel__subtitle">
            {session.status} · {session.events.length} events · {session.insights.length} insights
          </div>
        </div>
      </div>

      <div className="filter-row">
        {EVENT_FILTERS.map((f) => (
          <button
            key={f}
            className={`tab ${f === filter ? "tab--active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {showInsights ? (
        insights.length === 0 ? (
          <p className="empty">No {filter.toLowerCase()} yet. Try Extract Insights.</p>
        ) : (
          insights.map((i) => <InsightCard key={i.id} insight={i} />)
        )
      ) : events.length === 0 ? (
        <p className="empty">No events for this filter.</p>
      ) : (
        events.map((e) => <EventCard key={e.id} event={e} />)
      )}

      <ManualNoteBox />

      <div className="transcript__row" style={{ marginTop: 8 }}>
        <button className="gbtn gbtn--primary" onClick={() => send({ type: "session-send" })}>
          Send Session to IIVO
        </button>
        <button className="gbtn gbtn--ghost" onClick={() => send({ type: "session-clear" })}>
          Clear session
        </button>
      </div>
    </>
  );
}

// ---------- Insights tab ----------
const INSIGHT_ORDER: GlassInsightType[] = [
  "key_idea",
  "hypothesis",
  "risk",
  "action",
  "question",
  "memory_candidate",
];

function InsightCard({ insight }: { insight: GlassSessionInsight }): JSX.Element {
  return (
    <div className={`moment insight insight--${insight.importance} ${insight.accepted ? "insight--accepted" : ""}`}>
      <div className="moment__meta">
        <span className="moment__kind">{INSIGHT_TYPE_LABELS[insight.type]}</span>
        <span>{insight.accepted ? "★ kept" : insight.importance}</span>
      </div>
      <div className="moment__note">{insight.text}</div>
      <div className="moment__actions">
        {!insight.accepted ? (
          <button className="gbtn" onClick={() => send({ type: "session-accept-insight", id: insight.id })}>
            Keep
          </button>
        ) : null}
        <button
          className="gbtn gbtn--danger"
          onClick={() => send({ type: "session-dismiss-insight", id: insight.id })}
        >
          Dismiss
        </button>
        <button className="gbtn" onClick={() => send({ type: "session-save-insight-moment", id: insight.id })}>
          Save
        </button>
        <button className="gbtn" onClick={() => send({ type: "session-send-insight", id: insight.id })}>
          Send
        </button>
        <button className="gbtn gbtn--ghost" onClick={() => void copyText(insight.text)}>
          Copy
        </button>
      </div>
    </div>
  );
}

function InsightsView({ session }: { session: GlassSession | null }): JSX.Element {
  if (!session) return <p className="empty">Start a session to extract live insights.</p>;
  const grouped = INSIGHT_ORDER.map((type) => ({
    type,
    items: session.insights.filter((i) => i.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <div className="transcript__row">
        <button
          className="gbtn gbtn--primary"
          onClick={() => send({ type: "session-extract-insights" })}
        >
          Extract Insights
        </button>
      </div>
      {grouped.length === 0 ? (
        <p className="empty">
          No insights yet. Add notes / transcript, then Extract Insights. (Deterministic,
          local — no LLM calls.)
        </p>
      ) : (
        grouped.map((g) => (
          <div key={g.type}>
            <p className="section-title">{INSIGHT_TYPE_LABELS[g.type]}</p>
            {g.items.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ))
      )}
    </>
  );
}

// ---------- deterministic notes tabs ----------
function NotesTab({ tab, notes }: { tab: PanelTab; notes: ExtractedNotes }): JSX.Element {
  switch (tab) {
    case "hypotheses":
      return (
        <>
          <p className="section-title">Hypotheses</p>
          <NoteList items={notes.hypotheses} empty="No hypotheses detected. Try 'maybe', 'might', 'what if'." />
        </>
      );
    case "actions":
      return (
        <>
          <p className="section-title">Action items</p>
          <NoteList items={notes.actionItems} empty="No action items detected. Try 'need to', 'next step'." />
        </>
      );
    case "context":
    default:
      return (
        <>
          <p className="section-title">Open questions</p>
          <NoteList items={notes.questions} empty="No questions detected yet." />
        </>
      );
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
        <button className="gbtn gbtn--ghost" disabled={!transcript} onClick={() => send({ type: "clear-transcript" })}>
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
      <div className="moment__note">{moment.note}</div>
      <div className="moment__actions">
        <button className="gbtn" onClick={() => send({ type: "send-moment", id: moment.id })}>
          {moment.sentToIivo ? "Open in IIVO" : "Send to IIVO"}
        </button>
        <button className="gbtn gbtn--danger" onClick={() => send({ type: "delete-moment", id: moment.id })}>
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

  const sessionLive =
    state.session?.status === "active" || state.session?.status === "paused";

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
        <div className="dock__pills">
          <SessionPill status={state.session?.status ?? null} />
          <StatusPill status={state.privacy.status} />
        </div>
      </div>

      {state.lastError ? <div className="error-banner">{state.lastError}</div> : null}
      {state.lastNotice ? <div className="notice-banner">{state.lastNotice}</div> : null}

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
        {tab === "summary" ? <SummaryView state={state} /> : null}
        {tab === "session" ? <SessionView session={state.session} /> : null}
        {tab === "insights" ? <InsightsView session={state.session} /> : null}
        {tab === "context" || tab === "hypotheses" || tab === "actions" ? (
          <>
            <NotesTab tab={tab} notes={state.notes} />
            <Transcript transcript={state.transcript} />
            <p className="section-title" style={{ marginTop: 16 }}>
              Saved moments ({state.moments.length})
            </p>
            {state.moments.length === 0 ? (
              <p className="empty">No saved moments yet.</p>
            ) : (
              state.moments.map((m) => <MomentCard key={m.id} moment={m} />)
            )}
          </>
        ) : null}
      </div>

      <div className="privacy">
        {sessionLive ? (
          <div className="privacy__warning">● IIVO Glass is collecting session events locally.</div>
        ) : null}
        <div className="privacy__row">
          <span className={`privacy__flag ${sessionLive ? "privacy__flag--on" : ""}`}>
            {sessionLive ? "● Session recording" : "○ No session"}
          </span>
          <span className={`privacy__flag ${state.privacy.capturing ? "privacy__flag--on" : ""}`}>
            {state.privacy.capturing ? "● Capturing" : "○ Not capturing"}
          </span>
          <button className="gbtn gbtn--danger" onClick={() => send({ type: "stop" })}>
            Stop everything
          </button>
        </div>
        <div>
          Session recording starts only when you click Start Session. Screen capture
          happens only when you click Capture. Nothing leaves this device until you
          click Send to IIVO.
        </div>
      </div>
    </div>
  );
}
