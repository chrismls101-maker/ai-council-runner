import { useEffect, useRef, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import type { LiveNoteSection } from "../../shared/listenLiveNotes.ts";
import { liveNoteSectionLabel } from "../../shared/listenLiveNotes.ts";
import { collapseDuplicateTranscriptLines } from "../../shared/transcriptDedupe.ts";
import { formatListeningDuration } from "../../shared/audioChunks.ts";

const NOTES_SECTION_ORDER: LiveNoteSection[] = [
  "keyIdeas",
  "concepts",
  "quotes",
  "questions",
  "actionIdeas",
  "frameworks",
  "warnings",
  "developing",
];

function NoteSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section className="live-notes__section" data-testid={`glass-live-notes-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <h3 className="section-title">{title}</h3>
      <ul className="live-notes__list">
        {items.map((item, i) => (
          <li key={`${title}-${i}`} className="live-notes__item">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListenStatusBar({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes;
  const sessionListening = state.privacy.listening;
  const listening = sessionListening || notes?.listeningStatus === "listening";
  const building = notes?.listeningStatus === "building";
  const elapsedMs = Math.max(state.stt?.listeningElapsedMs ?? 0, 0);
  const timerLabel = formatListeningDuration(elapsedMs);

  return (
    <div className="live-notes__status" data-testid="glass-live-notes-status">
      {listening ? (
        <span className="live-notes__timer" data-testid="glass-live-notes-timer">
          {timerLabel}
        </span>
      ) : null}
      <span className={`live-notes__pill ${listening ? "live-notes__pill--on" : ""}`}>
        {building ? "Building context…" : listening ? "Listening" : "Idle"}
      </span>
      <span className="live-notes__pill live-notes__pill--muted" data-testid="glass-live-notes-mic-off">
        Mic Off
      </span>
      <span className="live-notes__pill live-notes__pill--muted" data-testid="glass-live-notes-source">
        {notes?.sourceLabel ?? "System Audio"}
      </span>
      {notes?.lastRefreshMs ? (
        <span className="live-notes__pill live-notes__pill--muted live-notes__pill--time">
          Notes updated {new Date(notes.lastUpdatedAt ?? notes.lastRefreshMs).toLocaleTimeString()}
        </span>
      ) : null}
    </div>
  );
}

function LiveNotesContent({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes!;

  const hasSections = NOTES_SECTION_ORDER.some((s) => (notes.sections[s]?.length ?? 0) > 0);

  return (
    <>
      <p className="live-notes__hint">
        IIVO interprets what you&apos;re hearing — notes refresh every 10–20 seconds.
      </p>

      {notes.currentTopic ? (
        <section className="live-notes__topic" data-testid="glass-live-notes-topic">
          <h3 className="section-title">Current topic</h3>
          <p className="live-notes__topic-text">{notes.currentTopic}</p>
        </section>
      ) : null}

      {hasSections ? (
        NOTES_SECTION_ORDER.map((section) => (
          <NoteSection
            key={section}
            title={liveNoteSectionLabel(section)}
            items={notes.sections[section] ?? []}
          />
        ))
      ) : (
        <p className="empty" data-testid="glass-live-notes-building">
          Building meaning-based notes from live audio…
        </p>
      )}

      {notes.developingCount ? (
        <p className="empty" data-testid="glass-live-notes-developing">
          {notes.developingCount} idea{notes.developingCount === 1 ? "" : "s"} still developing.
        </p>
      ) : null}

      {notes.checkpointCount ? (
        <p className="empty" data-testid="glass-live-notes-checkpoints">
          {notes.checkpointCount} topic checkpoint{notes.checkpointCount === 1 ? "" : "s"} saved this session.
        </p>
      ) : null}
    </>
  );
}

function LiveTranscriptContent({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes!;

  return (
    <div className="live-notes__transcript-panel" data-testid="glass-live-transcript-tab">
      <p className="live-notes__hint">
        Reference transcript — system audio only. {notes.transcriptChunkCount} chunk
        {notes.transcriptChunkCount === 1 ? "" : "s"}
        {notes.duplicateTranscriptCount > 0
          ? ` · ${notes.duplicateTranscriptCount} duplicate line(s) deduped`
          : ""}
      </p>
      {state.transcript || notes.rollingPreview ? (
        <div className="summary-box live-notes__transcript-body">
          {collapseDuplicateTranscriptLines(state.transcript || notes.rollingPreview || "")}
        </div>
      ) : (
        <p className="empty">Transcript fragments appear here as system audio is captured.</p>
      )}
    </div>
  );
}

export function LiveNotesTab({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUpRef.current = distanceFromBottom > 48;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolledUpRef.current || tab !== "notes") return;
    el.scrollTop = el.scrollHeight;
  }, [
    tab,
    notes?.lastUpdatedAt,
    notes?.lastRefreshMs,
    notes?.transcriptChunkCount,
    notes?.currentTopic,
    notes?.entries?.length ?? 0,
    notes?.sections.keyIdeas.length,
    notes?.sections.developing?.length ?? 0,
  ]);

  if (!notes) {
    return (
      <div className="live-notes live-notes--scroll" data-testid="glass-live-notes-empty">
        <p className="empty">Start Listen mode to see IIVO Notes here.</p>
      </div>
    );
  }

  return (
    <div className="live-notes live-notes--tabbed" data-testid="glass-live-notes">
      <ListenStatusBar state={state} />

      <div className="live-notes__tabs" role="tablist" data-testid="glass-live-notes-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "notes"}
          className={`live-notes__tab${tab === "notes" ? " live-notes__tab--active" : ""}`}
          data-testid="glass-live-notes-tab-notes"
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "transcript"}
          className={`live-notes__tab${tab === "transcript" ? " live-notes__tab--active" : ""}`}
          data-testid="glass-live-notes-tab-transcript"
          onClick={() => setTab("transcript")}
        >
          Transcript
        </button>
      </div>

      <div
        ref={scrollRef}
        className="live-notes live-notes--scroll live-notes__panel"
        data-testid={tab === "notes" ? "glass-live-notes-panel" : "glass-live-transcript-panel"}
      >
        {tab === "notes" ? <LiveNotesContent state={state} /> : <LiveTranscriptContent state={state} />}
      </div>
    </div>
  );
}
