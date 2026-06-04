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
import { buildScreenshotThumbnailUrl } from "../../shared/sessionScreenshotUrls.ts";
import {
  WINDOW_CONTEXT_PERMISSION_MESSAGE,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
} from "../../shared/windowContextTypes.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { IivoAnalysisPanel } from "../components/IivoAnalysisPanel.tsx";
import { ListeningControls, OperationDiagnosticsFooter } from "../components/ListeningControls.tsx";

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

function WindowContextDisplay({ state }: { state: GlassState }): JSX.Element {
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
          <button className="gbtn" onClick={() => void copyText(event.text ?? "")}>
            Copy Analysis
          </button>
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

function SessionView({ session, state }: { session: GlassSession | null; state: GlassState }): JSX.Element {
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
  const tx = useTranscriptionContext();

  return (
    <div className="transcript">
      <p className="section-title">Live transcript</p>
      <div className="filter-row">
        {tx.modeOptions.map((mode) => (
          <button
            key={mode}
            className={`tab ${tx.selectedMode === mode ? "tab--active" : ""}`}
            onClick={() => tx.setMode(mode)}
          >
            {tx.modeLabels[mode]}
          </button>
        ))}
      </div>
      <p className="empty">
        Source: {tx.modeLabels[tx.selectedMode] ?? tx.selectedMode} · STT Provider:{" "}
        {tx.sttProviderLabel}
      </p>
      <p className="empty">{tx.sttStatusMessage}</p>
      {tx.sttFixHint ? <p className="empty">{tx.sttFixHint}</p> : null}
      {tx.micPathLabel ? <p className="empty">{tx.micPathLabel}</p> : null}
      <p className="empty">{tx.statusMessage}</p>
      {tx.systemAudioHint ? <p className="empty">{tx.systemAudioHint}</p> : null}
      {tx.lastTranscript ? (
        <>
          <p className="section-title">Last transcript</p>
          <div className="summary-box" style={{ whiteSpace: "pre-wrap" }}>
            {tx.lastTranscript}
          </div>
        </>
      ) : null}
      {transcript ? (
        <div className="summary-box" style={{ whiteSpace: "pre-wrap" }}>
          {transcript}
        </div>
      ) : null}
      {tx.interimText ? (
        <div className="summary-box" style={{ opacity: 0.7 }}>
          {tx.interimText}
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
            send({ type: "add-transcript-chunk", text: draft.trim() });
            setDraft("");
          }}
        >
          Add to Session
        </button>
        {tx.interimText ? (
          <button className="gbtn" onClick={tx.addChunkToSession}>
            Add transcript chunk
          </button>
        ) : null}
        <button
          className="gbtn"
          disabled={!tx.canTranscribeLastChunk}
          onClick={tx.transcribeLastChunk}
        >
          Transcribe Last Chunk
        </button>
        <button className="gbtn gbtn--ghost" disabled={!transcript} onClick={() => send({ type: "clear-transcript" })}>
          Clear
        </button>
      </div>
    </div>
  );
}

// ---------- Status / health grid (primary panel surface) ----------
function StatusGrid({ state }: { state: GlassState }): JSX.Element {
  const sessionLive =
    state.session?.status === "active" || state.session?.status === "paused";
  const analysisRunning = state.iivoAnalysis.status === "running";
  const diag = state.operationDiagnostics;

  const items: { label: string; value: string }[] = [
    { label: "Session", value: sessionLive ? state.session?.status ?? "active" : "none" },
    { label: "STT provider", value: diag.sttProviderStatus ?? state.stt.status },
    { label: "STT endpoint", value: diag.serverSttStatus ?? state.stt.endpoint },
    { label: "Capture", value: diag.captureStatus ?? (state.privacy.capturing ? "capturing" : "idle") },
    { label: "System audio", value: state.systemAudioStatus },
    {
      label: "App detection",
      value:
        state.windowContext.status === "available"
          ? "available"
          : state.windowContext.status === "permission_required"
            ? "needs permission"
            : "unavailable",
    },
    { label: "Hotkey", value: diag.hotkeyStatus ?? "—" },
    { label: "Display", value: diag.displayInfo ?? "primary display" },
  ];

  return (
    <div className="status-grid">
      <p className="section-title">System status</p>
      {state.lastAskResponse ? (
        <div className="summary-box panel__last-ask">
          <strong>Last IIVO answer</strong>
          <div className="panel__last-ask-prompt">{state.lastAskResponse.prompt}</div>
          <div className="panel__last-ask-body">{state.lastAskResponse.answer.slice(0, 280)}</div>
        </div>
      ) : null}
      <div className="summary-box status-grid__cells">
        {items.map((item) => (
          <div key={item.label} className="status-grid__cell">
            <strong>{item.label}</strong>
            <div>{item.value}</div>
          </div>
        ))}
      </div>
      <div className="panel__quick-actions">
        <button
          type="button"
          className="gbtn gbtn--primary"
          onClick={() => send(state.session ? { type: "session-open-in-iivo" } : { type: "open-chat" })}
        >
          Open in IIVO
        </button>
        <button
          type="button"
          className="gbtn gbtn--primary"
          onClick={() => send({ type: "session-analyze-now" })}
          disabled={!state.session || analysisRunning}
        >
          {analysisRunning ? "Analyzing…" : "Analyze Now"}
        </button>
        <button
          type="button"
          className="gbtn"
          onClick={() =>
            send(sessionLive ? { type: "session-capture" } : { type: "capture-screen-only" })
          }
        >
          Capture Screen
        </button>
        <button
          type="button"
          className="gbtn gbtn--danger"
          onClick={() => send({ type: "stop-everything" })}
        >
          Stop Everything
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

      <p className="empty panel__hint">
        Ask IIVO from the command bar at the bottom of your screen. This panel shows
        status, session detail, and diagnostics.
      </p>

      <StatusGrid state={state} />

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
        {tab === "session" ? <SessionView session={state.session} state={state} /> : null}
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
          <span className={`privacy__flag ${state.privacy.listening ? "privacy__flag--on" : ""}`}>
            {state.privacy.listening ? "● Listening" : "○ Not listening"}
          </span>
          <span className={`privacy__flag ${state.privacy.capturing ? "privacy__flag--on" : ""}`}>
            {state.privacy.capturing ? "● Capturing" : "○ Not capturing"}
          </span>
          <button className="gbtn gbtn--danger" onClick={() => send({ type: "stop-everything" })}>
            Stop everything
          </button>
        </div>
        <ListeningControls compact />
        <OperationDiagnosticsFooter />
        <div>
          Glass captures screen/audio only when you start it. IIVO Glass does not capture
          audio on launch. Audio chunks may be sent to OpenAI for transcription when STT is
          enabled. System audio capture only starts when you press Start Listening and may
          require macOS Screen Recording permission or a virtual audio device. Audio and
          transcript stay local until you send or analyze. Stop Listening stops microphone
          and system audio tracks.
        </div>
      </div>
    </div>
  );
}
