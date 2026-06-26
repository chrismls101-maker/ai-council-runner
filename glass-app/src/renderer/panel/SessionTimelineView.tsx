import { useState } from "react";
import { send } from "../useGlassState.ts";
import type { GlassState } from "../../shared/ipc.ts";
import { CopyButton } from "../components/CopyButton.tsx";
import {
  WINDOW_CONTEXT_PERMISSION_MESSAGE,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
} from "../../shared/windowContextTypes.ts";
import type {
  GlassInsightType,
  GlassSession,
  GlassSessionEvent,
} from "../../shared/sessionTypes.ts";
import { dedupeTranscriptEventsForDisplay } from "../../shared/transcriptDedupe.ts";
import { buildScreenshotThumbnailUrl } from "../../shared/sessionScreenshotUrls.ts";
import { InsightCard } from "./InsightsPanel.tsx";

export function WindowContextDisplay({ state }: { state: GlassState }): JSX.Element {
  const ctx = state.windowContext;
  let label = "Manual source title";
  let detail = WINDOW_CONTEXT_UNAVAILABLE_MESSAGE;

  if (ctx.status === "available" && (ctx.appName || ctx.windowTitle || ctx.displayName)) {
    label = ctx.displayName ?? ctx.windowTitle ?? ctx.appName ?? "Active window";
    detail = [ctx.appName, ctx.windowTitle].filter(Boolean).join(" — ");
  } else if (ctx.status === "permission_required") {
    label = "Active app detection requires permission";
    detail = WINDOW_CONTEXT_PERMISSION_MESSAGE;
  } else if (ctx.sourceName) {
    label = ctx.sourceName;
    detail = "From last screen capture source.";
  }

  return (
    <div className="window-context">
      <p className="section-title">Source context</p>
      <div className="summary-box">
        <strong>{label}</strong>
        {detail ? <div className="empty">{detail}</div> : null}
      </div>
      <div className="transcript__row">
        <button className="gbtn gbtn--ghost" onClick={() => send({ type: "window-context-refresh" })}>
          Refresh
        </button>
      </div>
    </div>
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
      return (
        e.kind === "manual_note" ||
        e.kind === "transcript_note" ||
        e.kind === "saved_moment" ||
        e.kind === "iivo_analysis"
      );
    default:
      return true;
  }
}

function EventScreenshot({ event }: { event: GlassSessionEvent }): JSX.Element {
  const [missing, setMissing] = useState(false);
  const src =
    event.screenshotDataUrl ??
    (event.thumbnailPath ? buildScreenshotThumbnailUrl(event.sessionId, event.id) : null);

  if (!src || missing) {
    if (event.screenshotPath || event.thumbnailPath || event.screenshotDataUrl) {
      return <p className="empty">Screenshot unavailable.</p>;
    }
    return <></>;
  }

  return (
    <img
      className="event-thumb"
      src={src}
      alt="capture"
      onError={() => setMissing(true)}
    />
  );
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
      {event.sourceTitle || event.sourceApp ? (
        <div className="moment__meta">
          <span>
            Source: {[event.sourceApp, event.sourceTitle].filter(Boolean).join(" — ")}
          </span>
        </div>
      ) : null}
      <div className="moment__note">{event.title}</div>
      {event.text && event.kind === "iivo_analysis" ? (
        <div className="summary-box" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
          {event.text}
        </div>
      ) : null}
      <EventScreenshot event={event} />
      <div className="moment__actions">
        {event.kind === "iivo_analysis" && event.text ? (
          <CopyButton className="gbtn" text={event.text ?? ""}>
            Copy Analysis
          </CopyButton>
        ) : null}
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
  const [sourceTitle, setSourceTitle] = useState("");
  return (
    <div className="transcript">
      <p className="section-title">Manual note</p>
      <input
        className="source-input"
        value={sourceTitle}
        placeholder="Source title optional (e.g. app or window name)"
        onChange={(e) => setSourceTitle(e.target.value)}
      />
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
            send({
              type: "session-add-note",
              text: draft.trim(),
              sourceTitle: sourceTitle.trim() || undefined,
            });
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

export function SessionView({ session, state }: { session: GlassSession | null; state: GlassState }): JSX.Element {
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
    ? dedupeTranscriptEventsForDisplay(
        [...session.events].reverse().filter((e) => eventMatchesFilter(e, filter)),
      )
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

      <WindowContextDisplay state={state} />

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
