import { useEffect, useRef, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import type { CaptureSubTab } from "../../shared/panelTabRouting.ts";
import {
  ListenStatusBar,
  LiveNotesContent,
  LiveTranscriptContent,
} from "./LiveNotesTab.tsx";
import { SessionView } from "./SessionTimelineView.tsx";
import { InsightsView } from "./InsightsPanel.tsx";
import { SummaryView } from "./SummaryPanel.tsx";

const CAPTURE_TABS: { id: CaptureSubTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "transcript", label: "Transcript" },
  { id: "timeline", label: "Timeline" },
  { id: "insights", label: "Insights" },
  { id: "summary", label: "Summary" },
];

type CaptureTabProps = {
  state: GlassState;
  activeSubTab: CaptureSubTab;
  onSubTabChange: (subTab: CaptureSubTab) => void;
};

function LiveTranscriptPanel({ state }: { state: GlassState }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      userScrolledUpRef.current = !atBottom;
      setUserScrolledUp(!atBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [state.listenLiveNotes?.rollingPreview, state.transcript]);

  return (
    <div className="live-notes__scroll-wrap">
      <div
        ref={scrollRef}
        className="live-notes live-notes--scroll live-notes__panel"
        data-testid="glass-live-transcript-panel"
      >
        <LiveTranscriptContent state={state} />
      </div>
      {userScrolledUp ? (
        <button
          type="button"
          className="live-notes__scroll-to-bottom"
          aria-label="Scroll to latest transcript"
          onClick={() => {
            userScrolledUpRef.current = false;
            setUserScrolledUp(false);
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
        >
          ↓ Latest
        </button>
      ) : null}
    </div>
  );
}

function LiveNotesPanel({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes;
  const isListening = state.privacy?.listening;

  if (!notes) {
    const wrongSessionType =
      isListening &&
      state.copilot?.config?.sessionType &&
      state.copilot.config.sessionType !== "video_learning";
    return (
      <div className="live-notes live-notes--tabbed" data-testid="glass-live-notes">
        {wrongSessionType ? (
          <p className="empty" data-testid="glass-live-notes-wrong-session-type">
            Listening… but live notes are off. Set session type to{" "}
            <strong>Video / Learning</strong> in the panel to activate them.
          </p>
        ) : isListening ? (
          <p className="empty" data-testid="glass-live-notes-warming-up">
            Listening… building initial context. Notes will appear once enough audio is captured.
          </p>
        ) : (
          <p className="empty" data-testid="glass-live-notes-no-session">
            Start Listen mode to see IIVO Notes here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="live-notes live-notes--tabbed" data-testid="glass-live-notes">
      <ListenStatusBar state={state} />
      <div className="live-notes__scroll-wrap">
        <div
          className="live-notes live-notes--scroll live-notes__panel"
          data-testid="glass-live-notes-panel"
        >
          <LiveNotesContent state={state} />
        </div>
      </div>
    </div>
  );
}

export function CaptureTab({
  state,
  activeSubTab,
  onSubTabChange,
}: CaptureTabProps): JSX.Element {
  return (
    <div className="panel-capture" data-testid="glass-panel-capture-tab" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-capture__tabs" role="tablist" aria-label="Capture views">
        {CAPTURE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeSubTab === t.id}
            className={`tab panel-capture__tab${activeSubTab === t.id ? " tab--active" : ""}`}
            data-testid={`glass-panel-capture-tab-${t.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSubTabChange(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-capture__body">
        {activeSubTab === "notes" ? <LiveNotesPanel state={state} /> : null}
        {activeSubTab === "transcript" ? <LiveTranscriptPanel state={state} /> : null}
        {activeSubTab === "timeline" ? (
          <SessionView session={state.session} state={state} />
        ) : null}
        {activeSubTab === "insights" ? <InsightsView session={state.session} /> : null}
        {activeSubTab === "summary" ? (
          <>
            <p className="empty panel__hint">
              Ask IIVO from the command bar. Session summaries and analysis live here.
            </p>
            <SummaryView state={state} />
          </>
        ) : null}
      </div>
    </div>
  );
}
