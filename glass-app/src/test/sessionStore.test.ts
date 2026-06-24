import { test } from "node:test";
import assert from "node:assert/strict";
import { GlassSessionStore } from "../shared/sessionStore.ts";

function deps() {
  let n = 0;
  let t = 0;
  return {
    idFactory: () => `id-${++n}`,
    clock: () => `2026-01-01T00:00:${String(++t).padStart(2, "0")}.000Z`,
  };
}

test("no session is current on a fresh store (no recording on launch)", () => {
  const store = new GlassSessionStore(deps());
  assert.equal(store.current(), null);
  assert.equal(store.list().length, 0);
});

test("start/pause/resume/end transitions and records lifecycle events", () => {
  const store = new GlassSessionStore(deps());
  const s = store.startSession("My Session");
  assert.equal(s.status, "active");
  assert.equal(s.title, "My Session");

  store.pauseSession();
  assert.equal(store.current()?.status, "paused");
  store.resumeSession();
  assert.equal(store.current()?.status, "active");
  store.endSession();
  assert.equal(store.current()?.status, "ended");

  const kinds = store.current()!.events.map((e) => e.kind);
  assert.deepEqual(kinds, [
    "session_started",
    "session_paused",
    "session_resumed",
    "session_ended",
  ]);
});

test("addEvent is blocked after the session ends", () => {
  const store = new GlassSessionStore(deps());
  store.startSession();
  assert.ok(store.addEvent({ kind: "manual_note", title: "note" }));
  store.endSession();
  assert.equal(store.addEvent({ kind: "manual_note", title: "after end" }), null);
});

test("insights can be added, accepted, and deleted", () => {
  const store = new GlassSessionStore(deps());
  store.startSession();
  const i = store.addInsight({ type: "risk", title: "r", text: "a risk" })!;
  store.updateInsight(i.id, { accepted: true });
  assert.equal(store.current()?.insights[0].accepted, true);
  assert.equal(store.deleteInsight(i.id), true);
  assert.equal(store.current()?.insights.length, 0);
});

test("clearSession empties events/insights but keeps the session", () => {
  const store = new GlassSessionStore(deps());
  store.startSession();
  store.addEvent({ kind: "manual_note", title: "x" });
  store.addInsight({ type: "action", title: "a", text: "do x" });
  store.clearSession();
  assert.equal(store.current()?.events.length, 0);
  assert.equal(store.current()?.insights.length, 0);
  assert.ok(store.current());
});

test("serialize / hydrate marks interrupted active session as ended (no phantom session on relaunch)", () => {
  const store = new GlassSessionStore(deps());
  store.startSession("Persisted");
  store.addEvent({ kind: "manual_note", title: "keep" });
  const restored = GlassSessionStore.hydrate(store.serialize(), deps());
  // Session should be preserved in history but NOT active on relaunch.
  assert.equal(restored.current(), null);
  const inHistory = restored.list().find((s) => s.title === "Persisted");
  assert.ok(inHistory, "session kept in history");
  assert.equal(inHistory?.status, "ended");
  assert.equal(inHistory?.events.length, 2);
});

test("hydrate does not resume an ended session as current", () => {
  const store = new GlassSessionStore(deps());
  store.startSession();
  store.endSession();
  const restored = GlassSessionStore.hydrate(store.serialize(), deps());
  assert.equal(restored.current(), null);
  assert.equal(restored.list().length, 1);
});

test("hydrate of corrupt json yields an empty store", () => {
  const restored = GlassSessionStore.hydrate("not json", deps());
  assert.equal(restored.list().length, 0);
});

test("persists all sessions without a cap", () => {
  const store = new GlassSessionStore(deps());
  for (let i = 0; i < 25; i += 1) {
    store.createSession(`s${i}`);
    store.endSession();
  }
  assert.equal(store.list().length, 25);
});

test("migrateSession fills missing fields", () => {
  const restored = GlassSessionStore.hydrate(
    JSON.stringify({ sessions: [{ id: "old", title: "Old" }], currentId: null }),
    deps(),
  );
  const s = restored.list()[0];
  assert.equal(s.status, "ended");
  assert.ok(Array.isArray(s.events));
  assert.ok(Array.isArray(s.insights));
  assert.ok(s.startedAt);
});
