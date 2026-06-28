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
import { ServerDegradedIndicator } from "./ServerDegradedIndicator.tsx";
import { CaptureTab } from "./CaptureTab.tsx";
import { SessionControlTab } from "./SessionControlTab.tsx";
import { InputSourcesTab } from "./InputSourcesTab.tsx";
import "./GlassPanel.css";

const IS_DEV = process.env.NODE_ENV !== "production";

const ALL_TABS: { id: PanelTab; label: string; devOnly?: boolean }[] = [
  { id: "session", label: "Session" },
  { id: "capture", label: "Capture" },
  { id: "audio", label: "Input & Sources" },
  { id: "founder", label: "Founder" },
  { id: "diagnostics", label: "Diagnostics", devOnly: true },
];

const TAB_PAGE_TITLE: Partial<Record<PanelTab, string>> = {
  session: "Session",
  capture: "Capture",
  audio: "Input & Sources",
  founder: "Founder",
  diagnostics: "Diagnostics",
  context: "Context",
  hypotheses: "Hypotheses",
  actions: "Actions",
};

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

function PanelTabBody({
  tab,
  state,
  sessionLive,
  captureSubTab,
  onCaptureSubTabChange,
}: {
  tab: PanelTab;
  state: ReturnType<typeof useGlassState>;
  sessionLive: boolean;
  captureSubTab: CaptureSubTab;
  onCaptureSubTabChange: (subTab: CaptureSubTab) => void;
}): JSX.Element | null {
  if (tab === "session") {
    return <SessionControlTab state={state} sessionLive={sessionLive} />;
  }
  if (tab === "capture") {
    return (
      <CaptureTab
        state={state}
        activeSubTab={captureSubTab}
        onSubTabChange={onCaptureSubTabChange}
      />
    );
  }
  if (tab === "audio") {
    return <InputSourcesTab state={state} />;
  }
  if (tab === "founder" && state.iivoAccountLink?.role === "founder") {
    return <FounderTab state={state} link={state.iivoAccountLink} />;
  }
  if (tab === "diagnostics") {
    return (
      <>
        <ListeningControls compact={false} />
        <OperationDiagnosticsFooter />
        <p className="hint panel__privacy-note">
          Glass captures screen/audio only when you start it. Audio chunks may be sent to
          OpenAI for transcription when STT is enabled. Transcript stays local until you
          send or analyze.
        </p>
      </>
    );
  }
  if (tab === "context" || tab === "hypotheses" || tab === "actions") {
    return (
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
    );
  }
  return null;
}

export function Panel(): JSX.Element {
  const state = useGlassState();
  const [tab, setTab] = useState<PanelTab>("session");
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
    return true;
  });

  const sessionLive =
    state.session?.status === "active" || state.session?.status === "paused";

  const selectTab = (next: PanelTab): void => {
    if (next === tab) return;
    setTab(next);
    send({ type: "set-tab", tab: next });
  };

  const pageTitle = TAB_PAGE_TITLE[tab] ?? "Session";
  const captureBodyClass = tab === "capture" ? " panel__body--live-notes" : "";
  const diagnosticsBodyClass = tab === "diagnostics" ? " panel__body--diagnostics" : "";

  return (
    <div className="panel glass-panel-app" data-testid="glass-panel">
      <header className="panel__header">
        <div className="panel__brand">
          <span className="dock__logo" />
          <div>
            <div className="panel__title">IIVO Glass</div>
            <div className="panel__subtitle">Session &amp; capture</div>
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
          aria-label="Close panel"
        >
          ✕
        </button>
      </header>

      <div className="panel__shell">
        <nav className="panel__nav" aria-label="Panel sections" onPointerDown={(e) => e.stopPropagation()}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`panel__nav-tab${t.id === tab ? " panel__nav-tab--active" : ""}`}
              data-testid={`glass-panel-tab-${t.id}`}
              aria-current={t.id === tab ? "page" : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                selectTab(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel__stage glass-panel-app__stage">
          <header className="glass-panel-app__page-head">
            <h1 className="glass-panel-app__page-title">{pageTitle}</h1>
          </header>
          <div className={`panel__body panel-tab-view glass-panel-app__page-body${captureBodyClass}${diagnosticsBodyClass}`}>
            <PanelTabBody
              tab={tab}
              state={state}
              sessionLive={sessionLive}
              captureSubTab={captureSubTab}
              onCaptureSubTabChange={(subTab) => {
                if (subTab === captureSubTab) return;
                setCaptureSubTab(subTab);
                send({ type: "set-capture-sub-tab", subTab });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
