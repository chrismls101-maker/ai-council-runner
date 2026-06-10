import { useEffect, useRef, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import type { ListenAiNote, LiveNoteSection } from "../../shared/listenLiveNotes.ts";
import { liveNoteSectionLabel } from "../../shared/listenLiveNotes.ts";
import { collapseDuplicateTranscriptLines } from "../../shared/transcriptDedupe.ts";
import { ListenTranslateToggle } from "./TranslateModeSetup.tsx";
import { send } from "../useGlassState.ts";

// ─── Section icons ────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<LiveNoteSection, string> = {
  keyIdeas: "💡",
  frameworks: "⚙️",
  concepts: "📖",
  warnings: "⚠️",
  actionIdeas: "⚡",
  questions: "❓",
  quotes: "💬",
  developing: "·",
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a natural-language ask prompt from a note.
 * Uses the anchor phrase when available (more specific); falls back to note text.
 */
function buildAskPrompt(text: string, anchor?: string): string {
  // Strip template prefixes so the question targets the real content
  const cleanText = text
    .replace(/^\(developing\)\s*/i, "")
    .replace(/^\(needs more context\)\s*/i, "")
    .replace(/^(developing idea|concept|framework|what the speaker|the speaker is)[:\s]*/i, "")
    .trim();

  const topic = (anchor && anchor.length >= 10 ? anchor : cleanText.slice(0, 90)).trim();
  // Escape inner quotes to keep the prompt readable
  const escaped = topic.replace(/"/g, "'");
  return `Tell me more about: "${escaped}"`;
}

/** Skip showing the anchor quote when it's already verbatim inside the note text. */
function anchorIsRedundant(text: string, anchor: string): boolean {
  if (!anchor || anchor.length < 10) return true;
  return text.toLowerCase().includes(anchor.toLowerCase().slice(0, 38));
}

// ─── Note card ────────────────────────────────────────────────────────────────

interface NoteCardData {
  id: string;
  text: string;
  anchor?: string;
  why?: string;
  isAi?: boolean;
  isDeveloping?: boolean;
}

function NoteCard({ text, anchor, why, isAi, isDeveloping }: NoteCardData): JSX.Element {
  // Strip status prefixes — card layout communicates developing state visually
  const cleanText = text
    .replace(/^\(developing\)\s*/i, "")
    .replace(/^\(needs more context\)\s*/i, "")
    .trim();

  const showAnchor = !!anchor && !anchorIsRedundant(cleanText, anchor);

  return (
    <div
      className={`note-card${isAi ? " note-card--ai" : ""}${isDeveloping ? " note-card--developing" : ""}`}
    >
      {isAi && (
        <span className="note-card__ai-badge" aria-label="AI enhanced">
          ✦ AI
        </span>
      )}
      <p className="note-card__text">{cleanText}</p>
      {showAnchor && (
        <p className="note-card__anchor">
          <span className="note-card__quote-mark">&ldquo;</span>
          {anchor}
          <span className="note-card__quote-mark">&rdquo;</span>
        </p>
      )}
      {why && <p className="note-card__why">{why}</p>}
      <div className="note-card__footer">
        <button
          type="button"
          className="note-card__ask-btn"
          aria-label="Ask IIVO about this note"
          onClick={() => send({ type: "prefill-command-bar", text: buildAskPrompt(text, anchor) })}
        >
          Ask ↗
        </button>
      </div>
    </div>
  );
}

// ─── Enriched section ─────────────────────────────────────────────────────────

function EnrichedNoteSection({
  section,
  aiNotes,
  insightStripNoteId,
}: {
  section: LiveNoteSection;
  aiNotes: ListenAiNote[];
  /** Omit the note already shown in the bottom insight strip. */
  insightStripNoteId?: string;
}): JSX.Element | null {
  const aiForSection = aiNotes.filter((n) => n.section === section);

  const cards: NoteCardData[] = [];
  for (const ai of aiForSection) {
    if (insightStripNoteId && ai.id === insightStripNoteId) continue;
    cards.push({ id: ai.id, text: ai.note, anchor: ai.anchor, why: ai.why, isAi: true });
  }

  if (cards.length === 0) return null;

  const icon = SECTION_ICONS[section];
  const label = liveNoteSectionLabel(section);

  return (
    <section
      className="live-notes__section"
      data-testid={`glass-live-notes-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <h3 className="live-notes__section-header">
        <span className="live-notes__section-icon" aria-hidden="true">
          {icon}
        </span>
        {label}
      </h3>
      <div className="live-notes__cards">
        {cards.map((card) => (
          <NoteCard key={card.id} {...card} />
        ))}
      </div>
    </section>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function ListenStatusBar({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes;
  const sessionListening = state.privacy.listening;
  const listening = sessionListening || notes?.listeningStatus === "listening";
  const building = notes?.listeningStatus === "building";
  const aiEnhanced = (notes?.aiNotesCount ?? 0) > 0;

  return (
    <div className="live-notes__status" data-testid="glass-live-notes-status">
      <span className={`live-notes__pill ${listening ? "live-notes__pill--on" : ""}`}>
        {building ? "Building context…" : listening ? "Listening" : "Idle"}
      </span>
      <span
        className="live-notes__pill live-notes__pill--muted"
        data-testid="glass-live-notes-mic-off"
      >
        Mic Off
      </span>
      <span
        className="live-notes__pill live-notes__pill--muted"
        data-testid="glass-live-notes-source"
      >
        {notes?.sourceLabel ?? "System Audio"}
      </span>
      {aiEnhanced && (
        <span
          className="live-notes__pill live-notes__pill--ai"
          data-testid="glass-live-notes-ai-enhanced"
        >
          ✦ AI Enhanced
        </span>
      )}
      {notes?.lastRefreshMs ? (
        <span className="live-notes__pill live-notes__pill--muted live-notes__pill--time">
          Notes updated{" "}
          {new Date(notes.lastUpdatedAt ?? notes.lastRefreshMs).toLocaleTimeString()}
        </span>
      ) : null}
    </div>
  );
}

// ─── Notes content ────────────────────────────────────────────────────────────

function LiveNotesContent({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes!;
  const aiNotes = notes.aiNotes ?? [];
  const hasAiNotes = aiNotes.length > 0;

  return (
    <>
      <p className="live-notes__hint">
        {hasAiNotes
          ? "IIVO interprets what you\u2019re hearing — notes refresh every 10–20 seconds."
          : "Listening\u2026 AI notes appear after the first quality pass (~15s of speech)."}
      </p>

      {notes.currentTopic ? (
        <section className="live-notes__topic" data-testid="glass-live-notes-topic">
          <h3 className="live-notes__section-header">
            <span className="live-notes__section-icon" aria-hidden="true">
              📡
            </span>
            Current topic
          </h3>
          <p className="live-notes__topic-text">{notes.currentTopic}</p>
        </section>
      ) : null}

      {hasAiNotes ? (
        NOTES_SECTION_ORDER.map((section) => (
          <EnrichedNoteSection
            key={section}
            section={section}
            aiNotes={aiNotes}
            insightStripNoteId={notes.latestInsight?.id}
          />
        ))
      ) : (
        <p className="empty" data-testid="glass-live-notes-building">
          Waiting for AI notes from live audio…
        </p>
      )}

      {notes.checkpointCount ? (
        <p className="empty" data-testid="glass-live-notes-checkpoints">
          {notes.checkpointCount} topic checkpoint
          {notes.checkpointCount === 1 ? "" : "s"} saved this session.
        </p>
      ) : null}
    </>
  );
}

// ─── Transcript content ───────────────────────────────────────────────────────

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
        <p className="empty">
          Transcript fragments appear here as system audio is captured.
        </p>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function LiveNotesTab({ state }: { state: GlassState }): JSX.Element {
  const notes = state.listenLiveNotes;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const hasNotes = !!notes;

  // Re-register the scroll listener whenever the tabbed layout mounts/unmounts
  // (notes going from null → object means scrollRef just attached to a new DOM node).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const scrolledUp = distanceFromBottom > 60;
      userScrolledUpRef.current = scrolledUp;
      setUserScrolledUp(scrolledUp);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNotes]);

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
    notes?.aiNotesCount ?? 0,
  ]);

  if (!notes) {
    const isListening = state.privacy?.listening;
    const wrongSessionType =
      isListening &&
      state.copilot?.config?.sessionType &&
      state.copilot.config.sessionType !== "video_learning";
    return (
      <div className="live-notes live-notes--scroll" data-testid="glass-live-notes-empty">
        {wrongSessionType ? (
          <p className="empty" data-testid="glass-live-notes-wrong-session-type">
            Listening… but live notes are off. Set session type to{" "}
            <strong>Video / Learning</strong> in the panel to activate them.
          </p>
        ) : isListening ? (
          <p className="empty" data-testid="glass-live-notes-warming-up">
            Listening… building initial context. Notes will appear once enough audio is
            captured.
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
      <ListenTranslateToggle state={state} />

      <div
        className="live-notes__tabs"
        role="tablist"
        data-testid="glass-live-notes-tabs"
      >
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
          className={`live-notes__tab${
            tab === "transcript" ? " live-notes__tab--active" : ""
          }`}
          data-testid="glass-live-notes-tab-transcript"
          onClick={() => setTab("transcript")}
        >
          Transcript
        </button>
      </div>

      <div className="live-notes__scroll-wrap">
        <div
          ref={scrollRef}
          className="live-notes live-notes--scroll live-notes__panel"
          data-testid={
            tab === "notes" ? "glass-live-notes-panel" : "glass-live-transcript-panel"
          }
        >
          {tab === "notes" ? (
            <LiveNotesContent state={state} />
          ) : (
            <LiveTranscriptContent state={state} />
          )}
        </div>
        {userScrolledUp && (
          <button
            type="button"
            className="live-notes__scroll-to-bottom"
            aria-label="Scroll to latest notes"
            onClick={() => {
              userScrolledUpRef.current = false;
              setUserScrolledUp(false);
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            }}
          >
            ↓ Latest
          </button>
        )}
      </div>
    </div>
  );
}
