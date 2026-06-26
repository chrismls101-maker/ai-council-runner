import { useEffect, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { collapseDuplicateTranscriptLines } from "../../shared/transcriptDedupe.ts";
import type { PanelTab, SavedMoment } from "../../shared/types.ts";
import type { ExtractedNotes } from "../../shared/types.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import { ListeningControls, OperationDiagnosticsFooter } from "../components/ListeningControls.tsx";
import { StatusPill } from "../components/StatusPill.tsx";
import { SessionPill } from "../components/SessionPill.tsx";
import {
  resolvePanelNavigation,
  type CaptureSubTab,
} from "../../shared/panelTabRouting.ts";
import FounderTab from "./FounderTab.tsx";
import { PowerStackTab } from "./PowerStackTab.tsx";
import { ServerDegradedIndicator } from "./ServerDegradedIndicator.tsx";
import { CaptureTab } from "./CaptureTab.tsx";
import { SessionControlTab } from "./SessionControlTab.tsx";
import { InputSourcesTab } from "./InputSourcesTab.tsx";

const IS_DEV = process.env.NODE_ENV !== "production";

const ALL_TABS: { id: PanelTab; label: string; devOnly?: boolean; builderOnly?: boolean }[] = [
  { id: "session", label: "Session" },
  { id: "capture", label: "Capture" },
  { id: "audio", label: "Input & Sources" },
  { id: "founder", label: "Founder" },
  { id: "diagnostics", label: "Diagnostics", devOnly: true },
  { id: "power-stack", label: "POWER STACK", builderOnly: true },
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
        Input source: use Session above · current: {tx.modeLabels[tx.selectedMode] ?? tx.selectedMode} · STT:{" "}
        {tx.sttProviderLabel}
      </p>
      <p className="empty">{tx.sttStatusMessage}</p>
      {tx.micPathLabel ? <p className="empty">{tx.micPathLabel}</p> : null}
      {transcript ? (
        <div className="summary-box" style={{ whiteSpace: "pre-wrap" }}>
          {collapseDuplicateTranscriptLines(transcript)}
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
  const isBuilder = state.persona === "developer";
  const [tab, setTab] = useState<PanelTab>(isBuilder ? "power-stack" : "session");
  const [captureSubTab, setCaptureSubTab] = useState<CaptureSubTab>("notes");

  useEffect(() => {
    const nav = resolvePanelNavigation(state.panelTab);
    setTab(nav.panelTab);
    if (nav.captureSubTab) {
      setCaptureSubTab(nav.captureSubTab);
    }
  }, [state.panelTab, state.captureSubTab]);

  useEffect(() => {
    if (state.captureSubTab) {
      setCaptureSubTab(state.captureSubTab);
    }
  }, [state.captureSubTab]);

  const TABS = ALL_TABS.filter((t) => {
    if (t.id === "founder" && state.iivoAccountLink?.role !== "founder") return false;
    if (t.devOnly && !IS_DEV) return false;
    if (t.builderOnly && !isBuilder) return false;
    return true;
  });

  const sessionLive =
    state.session?.status === "active" || state.session?.status === "paused";

  const selectTab = (next: PanelTab): void => {
    setTab(next);
    send({ type: "set-tab", tab: next });
  };

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
          <ServerDegradedIndicator state={state} />
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
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel__stage">
          {tab === "session" ? (
            <div className="panel__body">
              <SessionControlTab state={state} sessionLive={sessionLive} />
            </div>
          ) : null}

          {tab === "capture" ? (
            <div className="panel__body panel__body--live-notes">
              <CaptureTab
                state={state}
                activeSubTab={captureSubTab}
                onSubTabChange={(subTab) => {
                  if (subTab === captureSubTab) return;
                  setCaptureSubTab(subTab);
                  send({ type: "set-capture-sub-tab", subTab });
                }}
              />
            </div>
          ) : null}

          {tab === "audio" ? (
            <div className="panel__body">
              <InputSourcesTab state={state} />
            </div>
          ) : null}

          {tab === "founder" && state.iivoAccountLink?.role === "founder" ? (
            <div className="panel__body">
              <FounderTab state={state} link={state.iivoAccountLink} />
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
