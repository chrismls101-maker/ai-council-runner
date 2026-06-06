import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInterpretationFromMoment,
  dedupeMeaningNotes,
  isTranscriptLikeNote,
  meaningNoteFromMoment,
  meaningNoteFromStreamingSentence,
  pickLatestMatureInsight,
} from "../shared/listenMeaningNote.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import { buildListenLiveNotes } from "../shared/listenLiveNotes.ts";

function baseMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  return {
    id: "m1",
    type: "key_idea",
    status: "ready",
    importance: "medium",
    confidence: 0.8,
    summary: "Speaker discusses mindset",
    suggestedThought: "What the speaker is really saying is that repeated attention shapes outcomes.",
    reasonSelected: "This matters because it connects desire to daily behavior.",
    transcriptAnchors: ["You are simply directing your mind power toward a desired end"],
    isStillDeveloping: false,
    firstSeenAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("listenMeaningNote", () => {
  it("rejects transcript-copy notes", () => {
    assert.equal(
      isTranscriptLikeNote(
        "Carnegie explained, you are simply directing your mind power toward a desired end",
        "you are simply directing your mind power toward a desired end",
      ),
      true,
    );
    assert.equal(
      isTranscriptLikeNote(
        "Concept: The speaker is arguing that repeated attention shapes behavior and outcomes.",
      ),
      false,
    );
  });

  it("builds interpretation from moment instead of raw anchor", () => {
    const moment = baseMoment({
      suggestedThought: "",
      summary: "continued his speech with a description of a great universal truth",
      transcriptAnchors: ["continued his speech with a description of a great universal truth"],
      isStillDeveloping: true,
      status: "developing",
    });
    const note = meaningNoteFromMoment(moment);
    assert.ok(note);
    assert.match(note!.note, /developing/i);
    assert.equal(isTranscriptLikeNote(note!.note, note!.transcriptAnchor), false);
  });

  it("promotes mature streaming sentence to key idea interpretation", () => {
    const sentence =
      "The mind must be directed toward desired results instead of fear or lack of achievement.";
    const note = meaningNoteFromStreamingSentence(sentence, "s1", new Date().toISOString());
    assert.ok(note);
    assert.equal(note!.kind, "key_idea");
    assert.match(note!.note, /arguing|speaker/i);
  });

  it("merges related meaning notes via dedupe", () => {
    const a = meaningNoteFromMoment(baseMoment({ id: "a" }));
    const b = meaningNoteFromMoment(
      baseMoment({
        id: "b",
        suggestedThought: "What the speaker is really saying is that repeated attention shapes outcomes.",
      }),
    );
    const merged = dedupeMeaningNotes([a!, b!]);
    assert.equal(merged.length, 1);
  });

  it("picks one mature insight for lightbulb strip", () => {
    const mature = meaningNoteFromMoment(
      baseMoment({
        id: "high",
        confidence: 0.9,
        suggestedThought:
          "The speaker is framing desire as the organizing force behind action, not just motivation.",
        reasonSelected: "This reframes how the listener should track the rest of the talk.",
      }),
    );
    const developing = meaningNoteFromMoment(
      baseMoment({ id: "dev", status: "developing", isStillDeveloping: true }),
    );
    const picked = pickLatestMatureInsight([developing!, mature!]);
    assert.equal(picked?.id, "high");
  });

  it("buildListenLiveNotes produces meaning notes and latest insight", () => {
    const notes = buildListenLiveNotes({
      moments: [baseMoment()],
      rollingTranscript: "You are simply directing your mind power toward a desired end.",
    });
    assert.ok((notes.meaningNotes?.length ?? 0) > 0);
    assert.ok(notes.latestInsight);
    assert.ok(notes.sections.keyIdeas.length > 0);
    assert.equal(
      notes.sections.keyIdeas.some((line) =>
        /continued his speech|simply directing your mind power/i.test(line),
      ),
      false,
    );
  });

  it("buildInterpretation uses whyItMatters from moment", () => {
    const interp = buildInterpretationFromMoment(baseMoment());
    assert.ok(interp.whyItMatters?.includes("connects"));
  });
});
