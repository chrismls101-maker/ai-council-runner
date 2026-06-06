import { useState } from "react";
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
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
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

export function LiveNotesTab({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes;
  const [showTranscript, setShowTranscript] = useState(false);

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
      <p className="live-notes__hint">
        Quiet note-taking while you listen — insights save automatically. Ask IIVO from the command bar when you
        want action steps or a report.
      </p>

      {notes.currentTopic ? (
        <section className="live-notes__topic" data-testid="glass-live-notes-topic">
          <h3 className="section-title">Current topic</h3>
          <p className="live-notes__topic-text">{notes.currentTopic}</p>
        </section>
      ) : null}

      {hasSections ? (
        SECTION_ORDER.map((section) => (
          <NoteSection
            key={section}
            title={liveNoteSectionLabel(section)}
            items={notes.sections[section]}
            empty=""
          />
        ))
      ) : (
        <p className="empty" data-testid="glass-live-notes-building">
          Building notes from what you&apos;re hearing…
        </p>
      )}

      <details
        className="live-notes__transcript"
        data-testid="glass-live-notes-transcript"
        open={showTranscript}
        onToggle={(e) => setShowTranscript((e.target as HTMLDetailsElement).open)}
      >
        <summary className="section-title">Raw transcript ({notes.transcriptChunkCount} chunks)</summary>
        {state.transcript ? (
          <div className="summary-box live-notes__transcript-body">
            {collapseDuplicateTranscriptLines(state.transcript)}
          </div>
        ) : (
          <p className="empty">Transcript will appear here as system audio is captured.</p>
        )}
        {notes.duplicateTranscriptCount > 0 ? (
          <p className="empty">Deduped {notes.duplicateTranscriptCount} repeated line(s).</p>
        ) : null}
      </details>
    </div>
  );
}
