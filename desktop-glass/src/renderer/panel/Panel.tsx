import { useEffect, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";

const IS_DEV = process.env.NODE_ENV !== "production";
import {
  formatDisplayTargetLabel,
  GLASS_HOTKEY_PRESETS,
  type GlassDisplayTarget,
  type GlassHotkeyPreset,
} from "../../shared/glassSettings.ts";
import { StatusPill } from "../components/StatusPill.tsx";
import { SessionPill } from "../components/SessionPill.tsx";
import { CopyButton } from "../components/CopyButton.tsx";
import type { GlassState } from "../../shared/ipc.ts";
import { collapseDuplicateTranscriptLines, dedupeTranscriptEventsForDisplay } from "../../shared/transcriptDedupe.ts";
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
  buildPanelStatusCards,
  type PanelStatusCard,
} from "../../shared/panelStatusGrid.ts";
import {
  WINDOW_CONTEXT_PERMISSION_MESSAGE,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
} from "../../shared/windowContextTypes.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { IivoAnalysisPanel } from "../components/IivoAnalysisPanel.tsx";
import { ListeningControls, OperationDiagnosticsFooter } from "../components/ListeningControls.tsx";
import { SetupSection } from "./SetupSection.tsx";
import { CopilotPanel } from "./CopilotPanel.tsx";
import { AudioTab } from "./AudioTab.tsx";
import AccountTab from "./AccountTab.tsx";
import { LiveNotesTab } from "./LiveNotesTab.tsx";
import { PowerStackTab } from "./PowerStackTab.tsx";

const ALL_TABS: { id: PanelTab; label: string; devOnly?: boolean; builderOnly?: boolean }[] = [
  { id: "power-stack", label: "POWER STACK", builderOnly: true },
  { id: "setup", label: "Setup" },
  { id: "copilot", label: "Copilot" },
  { id: "live-notes", label: "Notes" },
  { id: "session", label: "Session" },
  { id: "audio", label: "Audio" },
  { id: "summary", label: "Summary" },
  { id: "account", label: "Account" },
  { id: "diagnostics", label: "Diagnostics", devOnly: true },
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
        <CopyButton className="gbtn gbtn--ghost" text={insight.text}>
          Copy
        </CopyButton>
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
      <p className="empty">
        Input source: use Session Copilot above · current: {tx.modeLabels[tx.selectedMode] ?? tx.selectedMode} · STT:{" "}
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
          {collapseDuplicateTranscriptLines(transcript)}
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


// ---------- Profile editor ----------

const PERSONA_LABELS: Record<NonNullable<GlassState["persona"]>, string> = {
  developer: "Builder",
  sales: "Closer",
  operator: "Operator",
  writer: "Creator",
  general: "Explorer",
};

function ProfileEditor({ state }: { state: GlassState }): JSX.Element {
  const profile = state.glassUserProfile;
  const persona = state.persona;
  const [draft, setDraft] = useState({
    name: profile?.name ?? "",
    usualWork: profile?.usualWork ?? "",
    currentFocus: profile?.currentFocus ?? "",
  });
  const [saved, setSaved] = useState(false);

  // Sync from state when profile changes externally
  useEffect(() => {
    setDraft({
      name: profile?.name ?? "",
      usualWork: profile?.usualWork ?? "",
      currentFocus: profile?.currentFocus ?? "",
    });
  }, [profile?.name, profile?.usualWork, profile?.currentFocus]);

  const handleSave = (): void => {
    send({ type: "update-glass-profile", profile: { ...draft, updatedAt: new Date().toISOString() } });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const dirty =
    draft.name !== (profile?.name ?? "") ||
    draft.usualWork !== (profile?.usualWork ?? "") ||
    draft.currentFocus !== (profile?.currentFocus ?? "");

  return (
    <section className="panel-profile-editor" data-testid="glass-panel-profile-section">
      <p className="section-title">Your profile</p>
      <p className="hint">
        IIVO uses these to calibrate responses to your work and context.
      </p>
      <div className="panel-profile-fields">
        <label className="panel-profile-field">
          <span className="panel-profile-label">Name</span>
          <input
            type="text"
            className="panel-profile-input"
            value={draft.name}
            onChange={(e) => { setDraft((d) => ({ ...d, name: e.target.value })); setSaved(false); }}
            placeholder="Your name"
            autoComplete="off"
            data-testid="glass-panel-profile-name"
          />
        </label>
        <label className="panel-profile-field">
          <span className="panel-profile-label">Usual work</span>
          <input
            type="text"
            className="panel-profile-input"
            value={draft.usualWork}
            onChange={(e) => { setDraft((d) => ({ ...d, usualWork: e.target.value })); setSaved(false); }}
            placeholder="e.g. product strategy, engineering, sales"
            autoComplete="off"
            data-testid="glass-panel-profile-work"
          />
        </label>
        <label className="panel-profile-field">
          <span className="panel-profile-label">Current focus</span>
          <input
            type="text"
            className="panel-profile-input"
            value={draft.currentFocus}
            onChange={(e) => { setDraft((d) => ({ ...d, currentFocus: e.target.value })); setSaved(false); }}
            placeholder="What are you working on right now?"
            autoComplete="off"
            data-testid="glass-panel-profile-focus"
          />
        </label>
      </div>
      <div className="panel-profile-actions">
        <button
          type="button"
          className="gbtn gbtn--primary"
          onClick={handleSave}
          disabled={!dirty && !saved}
          data-testid="glass-panel-profile-save"
        >
          Save profile
        </button>
        {saved ? (
          <span className="panel-profile-saved hint" data-testid="glass-panel-profile-saved">
            ✓ Saved
          </span>
        ) : null}
      </div>
      <div className="panel-profile-persona" data-testid="glass-panel-persona-section">
        <p className="panel-profile-label">Persona</p>
        <p className="hint panel-profile-persona-value" data-testid="glass-panel-persona-value">
          {persona ? PERSONA_LABELS[persona] : "Not set — run calibration to load your power stack."}
        </p>
        <button
          type="button"
          className="gbtn panel-profile-recalibrate"
          onClick={() => send({ type: "glass-onboarding-recalibrate" })}
          data-testid="glass-panel-recalibrate-persona"
        >
          Recalibrate persona
        </button>
        <p className="hint panel-profile-recalibrate-hint">
          Re-run the Sorting Hat to update your power stack and persona fit.
        </p>
      </div>
    </section>
  );
}

// ---------- Status / health grid (primary panel surface) ----------
function StatusGrid({ state }: { state: GlassState }): JSX.Element {
  const sessionLive =
    state.session?.status === "active" || state.session?.status === "paused";
  const analysisRunning = state.iivoAnalysis.status === "running";
  const diag = state.operationDiagnostics;

  const cards = buildPanelStatusCards({
    sessionStatus: state.session?.status ?? null,
    lastError: state.lastError,
    sttStatus: state.stt.status,
    sttEndpoint: state.stt.endpoint,
    captureStatus: diag.captureStatus,
    capturing: state.privacy.capturing,
    systemAudioStatus: state.systemAudioStatus,
    systemAudioDetail: state.systemAudioDetail,
    windowContextStatus: state.windowContext.status,
    listening: state.privacy.listening,
    screenContext: state.screenContextStatus,
    visualAskPayload: state.visualAskPayloadDiagnostics,
    visualAskDiagnostics: state.visualAskDiagnostics,
    setupCapabilities: state.setupCapabilities,
    transcriptionMode: state.transcriptionMode,
  });

  return (
    <div className="status-grid" data-testid="glass-panel-status-grid">
      <SetupSection />
      <ProfileEditor state={state} />
      <p className="section-title">System status</p>
      {state.lastAskResponse ? (
        <div className="summary-box panel__last-ask">
          <strong>Last IIVO answer</strong>
          <div className="panel__last-ask-prompt">{state.lastAskResponse.prompt}</div>
          <div className="panel__last-ask-body">{state.lastAskResponse.answer.slice(0, 280)}</div>
        </div>
      ) : null}
      <div className="summary-box status-grid__cells">
        {cards.map((card) => (
          <StatusGridCell key={card.key} card={card} />
        ))}
      </div>
      {diag.displayInfo ? (
        <p className="hint panel__display-diag">{diag.displayInfo}</p>
      ) : null}
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
      </div>
      <GlassLayoutSettings state={state} />
      {IS_DEV ? <ServerUrlEditor state={state} /> : null}
    </div>
  );
}

function StatusGridCell({ card }: { card: PanelStatusCard }): JSX.Element {
  return (
    <div
      className="status-grid__cell"
      data-testid={`glass-panel-status-${card.key}`}
    >
      <div className="status-grid__cell-head">
        <span className={`status-dot status-dot--${card.level}`} aria-hidden="true" />
        <strong>{card.label}</strong>
      </div>
      <div>{card.status}</div>
      {card.detail ? <div className="status-grid__detail">{card.detail}</div> : null}
    </div>
  );
}

function GlassLayoutSettings({ state }: { state: GlassState }): JSX.Element {
  const settings = state.glassSettings;
  const connected = state.connectedDisplays.length
    ? state.connectedDisplays
    : state.availableDisplayIds.map((id, index) => ({
        id,
        label: `Display ${index + 1}`,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        workArea: { x: 0, y: 0, width: 0, height: 0 },
        scaleFactor: 1,
        isPrimary: index === 0,
        cursorInside: false,
      }));

  const hotkeyOptions = (Object.keys(GLASS_HOTKEY_PRESETS) as GlassHotkeyPreset[]).map((preset) => ({
    preset,
    label: GLASS_HOTKEY_PRESETS[preset].label,
  }));

  const displayOptions: { target: GlassDisplayTarget; label: string; disabled?: boolean }[] = [
    { target: "primary", label: "Primary Display" },
    ...connected
      .filter((display) => !display.isPrimary)
      .map((display) => ({
        target: display.id as GlassDisplayTarget,
        label: display.label,
      })),
    { target: "follow_mouse", label: "Follow Mouse" },
    {
      target: "all_displays",
      label: "All Displays Overlay (coming soon)",
      disabled: true,
    },
  ];

  const activeDisplay =
    connected.find((d) => d.cursorInside)?.label ??
    connected.find((d) =>
      typeof settings.displayTarget === "number" ? d.id === settings.displayTarget : d.isPrimary,
    )?.label ??
    formatDisplayTargetLabel(settings.displayTarget, state.availableDisplayIds);

  return (
    <div className="summary-box panel__settings">
      <p className="section-title">Glass layout</p>
      <p className="hint">
        Glass is on {formatDisplayTargetLabel(settings.displayTarget, state.availableDisplayIds)}.
        {connected.length > 1 ? ` Cursor on ${activeDisplay}.` : ""} Command bar hotkey:{" "}
        {state.operationDiagnostics.hotkeyStatus ?? "—"}
      </p>
      <label className="panel__settings-row">
        <span>Command bar hotkey</span>
        <select
          value={settings.hotkeyPreset}
          onChange={(e) =>
            send({ type: "set-glass-hotkey", preset: e.target.value as GlassHotkeyPreset })
          }
        >
          {hotkeyOptions.map((opt) => (
            <option key={opt.preset} value={opt.preset}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="panel__settings-row">
        <span>Glass Display</span>
        <select
          data-testid="glass-display-select"
          value={
            typeof settings.displayTarget === "number"
              ? String(settings.displayTarget)
              : settings.displayTarget
          }
          onChange={(e) => {
            const value = e.target.value;
            if (value === "all_displays") return;
            const target: GlassDisplayTarget =
              value === "primary" || value === "follow_mouse" ? value : Number(value);
            send({ type: "set-glass-display", target });
          }}
        >
          {displayOptions.map((opt) => (
            <option
              key={String(opt.target)}
              value={typeof opt.target === "number" ? String(opt.target) : opt.target}
              disabled={opt.disabled}
            >
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {connected.length > 1 ? (
        <p className="hint panel__display-list">
          {connected.length} connected displays — select HDMI / external display to move Glass off
          the MacBook screen.
        </p>
      ) : null}
      <button type="button" className="gbtn gbtn--ghost" onClick={() => send({ type: "refresh-glass-layout" })}>
        Refresh display layout
      </button>
      <p className="section-title panel__settings-dock">Dock</p>
      <label className="panel__settings-row panel__settings-row--check">
        <input
          type="checkbox"
          data-testid="glass-dock-lock-toggle"
          checked={settings.chromeLayoutLocked !== false}
          onChange={(e) => send({ type: "set-chrome-layout-locked", locked: e.target.checked })}
        />
        <span>Lock dock position</span>
      </label>
      <p className="hint">
        Uncheck to drag the dock to a new spot, then re-lock it.
      </p>
      <label className="panel__settings-row">
        <span>Dock orientation</span>
        <select
          data-testid="glass-dock-orientation-select"
          value={settings.dockOrientation ?? "horizontal"}
          onChange={(e) =>
            send({
              type: "set-dock-orientation",
              orientation: e.target.value as "horizontal" | "vertical",
            })
          }
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <p className="section-title panel__settings-privacy">Screen capture privacy</p>
      <label className="panel__settings-row panel__settings-row--check">
        <input
          type="checkbox"
          checked={settings.saveVisualAsksToSession !== false}
          onChange={(e) => send({ type: "set-save-visual-asks-to-session", enabled: e.target.checked })}
        />
        <span>Save visual asks to session</span>
      </label>
      <label className="panel__settings-row panel__settings-row--check">
        <input
          type="checkbox"
          checked={settings.autoUploadCapturesToContext === true}
          onChange={(e) =>
            send({ type: "set-auto-upload-captures-to-context", enabled: e.target.checked })
          }
        />
        <span>Auto-upload captures to IIVO Context</span>
      </label>
      <p className="hint">
        Visual asks always send the image to IIVO for that answer only. Context Bridge upload
        happens when you Open in IIVO, Save screen, or enable auto-upload above.
      </p>
    </div>
  );
}

function ServerUrlEditor({ state }: { state: GlassState }): JSX.Element {
  const [apiUrl, setApiUrl] = useState(state.iivoApiUrl);
  const [webUrl, setWebUrl] = useState(state.iivoWebUrl);
  const [saved, setSaved] = useState(false);

  // Sync from state on external change (e.g. another window, IPC round-trip).
  useEffect(() => {
    setApiUrl(state.iivoApiUrl);
    setWebUrl(state.iivoWebUrl);
  }, [state.iivoApiUrl, state.iivoWebUrl]);

  const dirty = apiUrl !== state.iivoApiUrl || webUrl !== state.iivoWebUrl;

  const handleSave = () => {
    send({ type: "set-glass-server-urls", apiUrl, webUrl });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="summary-box panel__settings panel__server-urls" data-testid="glass-panel-server-url-editor">
      <p className="section-title">Server URLs</p>
      <p className="hint">
        Override the default IIVO API and web app URLs (e.g. for a self-hosted instance).
        Leave blank to use the built-in defaults.
      </p>
      <label className="panel__settings-row">
        <span>API URL</span>
        <input
          type="text"
          className="panel__settings-input"
          data-testid="glass-panel-server-url-api"
          placeholder="https://api.iivo.ai"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <label className="panel__settings-row">
        <span>Web URL</span>
        <input
          type="text"
          className="panel__settings-input"
          data-testid="glass-panel-server-url-web"
          placeholder="https://app.iivo.ai"
          value={webUrl}
          onChange={(e) => setWebUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        className="gbtn gbtn--ghost"
        data-testid="glass-panel-server-url-save"
        disabled={!dirty}
        onClick={handleSave}
      >
        {saved ? "Saved ✓" : "Save"}
      </button>
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
  const isBuilder = state.persona === "developer";
  const [tab, setTab] = useState<PanelTab>(isBuilder ? "power-stack" : "setup");

  useEffect(() => {
    setTab(state.panelTab);
  }, [state.panelTab]);

  const TABS = ALL_TABS.filter((t) => {
    if (t.devOnly && !IS_DEV) return false;
    if (t.builderOnly && !isBuilder) return false;
    return true;
  });

  const sessionLive =
    state.session?.status === "active" || state.session?.status === "paused";

  return (
    <div className="panel" data-testid="glass-panel">
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
        <button
          type="button"
          className="gbtn gbtn--ghost panel__close"
          data-testid="glass-panel-close"
          onClick={() => send({ type: "toggle-panel" })}
          title="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="panel__shell">
        <nav className="panel__nav" aria-label="Panel sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`panel__nav-tab ${t.id === tab ? "panel__nav-tab--active" : ""}`}
              data-testid={`glass-panel-tab-${t.id}`}
              aria-current={t.id === tab ? "page" : undefined}
              onClick={() => {
                setTab(t.id);
                send({ type: "set-tab", tab: t.id });
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel__stage">
          {tab === "summary" ? (
            <div className="panel__body">
              <p className="empty panel__hint">
                Ask IIVO from the command bar. Session summaries and analysis live here — use
                Copilot for Listen, Meetings, Work, and Fix.
              </p>
              <SummaryView state={state} />
            </div>
          ) : null}

          {tab === "copilot" ? (
            <div className="panel__body panel__body--copilot" data-testid="glass-panel-copilot-tab">
              <CopilotPanel sessionLive={sessionLive} />
            </div>
          ) : null}

          {tab === "setup" ? (
            <div className="panel__body">
              <StatusGrid state={state} />
            </div>
          ) : null}

          {tab === "audio" ? (
            <div className="panel__body">
              <AudioTab state={state} />
            </div>
          ) : null}

          {tab === "diagnostics" ? (
            <div className="panel__body panel__body--diagnostics">
              <ListeningControls compact={false} />
              <OperationDiagnosticsFooter />
              <p className="hint panel__privacy-note">
                Glass captures screen/audio only when you start it. Audio chunks may be sent to
                OpenAI for transcription when STT is enabled. Transcript stays local until you
                send or analyze.
              </p>
            </div>
          ) : null}

          {tab === "session" ? (
            <div className="panel__body">
              <SessionView session={state.session} state={state} />
            </div>
          ) : null}

          {tab === "insights" ? (
            <div className="panel__body">
              <InsightsView session={state.session} />
            </div>
          ) : null}

          {tab === "account" ? (
            <div className="panel__body">
              <AccountTab state={state} />
            </div>
          ) : null}

          {tab === "live-notes" ? (
            <div className="panel__body panel__body--live-notes" data-testid="glass-panel-notes-tab">
              <LiveNotesTab state={state} />
            </div>
          ) : null}

          {tab === "power-stack" ? (
            <div className="panel__body" style={{ padding: 0, overflow: "hidden", height: "100%" }}>
              <PowerStackTab />
            </div>
          ) : null}

          {tab === "context" || tab === "hypotheses" || tab === "actions" ? (
            <div className="panel__body">
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
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel__footer privacy">
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
      </div>
    </div>
  );
}
