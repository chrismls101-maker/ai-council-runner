import type { GlassState } from "../../shared/ipc.ts";
import type { LiveNoteSection } from "../../shared/listenLiveNotes.ts";
import { liveNoteSectionLabel } from "../../shared/listenLiveNotes.ts";
import { collapseDuplicateTranscriptLines } from "../../shared/transcriptDedupe.ts";

const SECTION_ORDER: LiveNoteSection[] = [
  "keyIdeas",
  "quotes",
  "concepts",
  "warnings",
  "frameworks",
  "questions",
  "actionIdeas",
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
  const listening = notes?.listeningStatus === "listening";
  const building = notes?.listeningStatus === "building";

  return (
    <div className="live-notes__status" data-testid="glass-live-notes-status">
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

export function LiveNotesTab({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes;

  if (!notes) {
    return (
      <div className="live-notes" data-testid="glass-live-notes-empty">
        <p className="empty">Start Listen mode to see IIVO Notes here.</p>
      </div>
    );
  }

  const hasSections = SECTION_ORDER.some((s) => notes.sections[s].length > 0);

  return (
    <div className="live-notes" data-testid="glass-live-notes">
      <ListenStatusBar state={state} />

      <p className="live-notes__hint">
        Notes refresh every ~15 seconds from what you&apos;re hearing — no need to wait for long transcript blocks.
      </p>

      {notes.currentTopic ? (
        <section className="live-notes__topic" data-testid="glass-live-notes-topic">
          <h3 className="section-title">Current topic</h3>
          <p className="live-notes__topic-text">{notes.currentTopic}</p>
        </section>
      ) : null}

      {hasSections ? (
        SECTION_ORDER.map((section) => (
          <NoteSection key={section} title={liveNoteSectionLabel(section)} items={notes.sections[section]} />
        ))
      ) : (
        <p className="empty" data-testid="glass-live-notes-building">
          Building notes from live audio…
        </p>
      )}

      {notes.developingCount ? (
        <p className="empty" data-testid="glass-live-notes-developing">
          {notes.developingCount} idea{notes.developingCount === 1 ? "" : "s"} still developing.
        </p>
      ) : null}

      {notes.checkpointCount ? (
        <p className="empty" data-testid="glass-live-notes-checkpoints">
          {notes.checkpointCount} topic checkpoint{notes.checkpointCount === 1 ? "" : "s"} saved for your report.
        </p>
      ) : null}

      <details className="live-notes__transcript" data-testid="glass-live-notes-transcript">
        <summary className="section-title">
          Raw transcript ({notes.transcriptChunkCount} chunks) — collapsed by default
        </summary>
        {state.transcript || notes.rollingPreview ? (
          <div className="summary-box live-notes__transcript-body">
            {collapseDuplicateTranscriptLines(state.transcript || notes.rollingPreview || "")}
          </div>
        ) : (
          <p className="empty">Transcript fragments appear here as system audio is captured.</p>
        )}
        {notes.duplicateTranscriptCount > 0 ? (
          <p className="empty">Deduped {notes.duplicateTranscriptCount} repeated fragment(s).</p>
        ) : null}
      </details>
    </div>
  );
}
