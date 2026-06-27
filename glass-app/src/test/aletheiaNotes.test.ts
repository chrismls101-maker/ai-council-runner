import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAletheiaNote,
  formatAletheiaNotesContext,
  selectRelevantAletheiaNotes,
} from "../shared/aletheiaNotes.ts";

test("selectRelevantAletheiaNotes ranks keyword matches", () => {
  const notes = [
    createAletheiaNote({
      body: "Deferred cross-app context dependency",
      rationale: "Complexity vs timeline",
      category: "decision",
      source: "user",
      now: Date.now() - 1000,
    }),
    createAletheiaNote({
      body: "Preferred morning standup format",
      category: "preference",
      source: "user",
      now: Date.now() - 2000,
    }),
  ];

  const relevant = selectRelevantAletheiaNotes(notes, "What did we decide about cross-app context?");
  assert.equal(relevant.length, 1);
  assert.match(relevant[0]!.body, /cross-app context/i);
});

test("selectRelevantAletheiaNotes strips trailing punctuation from query words", () => {
  const notes = [
    createAletheiaNote({
      body: "Deferred cross-app context dependency",
      category: "decision",
      source: "user",
    }),
  ];
  const relevant = selectRelevantAletheiaNotes(notes, "What about context?");
  assert.equal(relevant.length, 1);
  assert.match(relevant[0]!.body, /context/i);
});

test("formatAletheiaNotesContext includes guidance for natural reference", () => {
  const note = createAletheiaNote({
    body: "Ship Phase 3 before Phase 4",
    rationale: "Dependency order",
    category: "decision",
    source: "assistant",
  });
  const context = formatAletheiaNotesContext([note]);
  assert.ok(context);
  assert.match(context!, /Aletheia notes/i);
  assert.match(context!, /Ship Phase 3/i);
  assert.match(context!, /Dependency order/i);
});
