import { test } from "node:test";
import assert from "node:assert/strict";
import { SavedMomentsStore } from "../shared/savedMoments.ts";

function fixedIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

test("adds and lists newest-first", () => {
  const store = new SavedMomentsStore([], fixedIds());
  store.add({ kind: "note", note: "first", createdAt: "2026-01-01T00:00:00.000Z" });
  store.add({ kind: "screenshot", note: "second", createdAt: "2026-01-02T00:00:00.000Z" });
  const list = store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].note, "second");
});

test("remove deletes by id", () => {
  const store = new SavedMomentsStore([], fixedIds());
  const m = store.add({ kind: "note", note: "x" });
  assert.equal(store.remove(m.id), true);
  assert.equal(store.remove("missing"), false);
  assert.equal(store.size(), 0);
});

test("markSent flags moment with context id", () => {
  const store = new SavedMomentsStore([], fixedIds());
  const m = store.add({ kind: "transcript", note: "x" });
  const updated = store.markSent(m.id, "ctx-9");
  assert.equal(updated?.sentToIivo, true);
  assert.equal(updated?.contextId, "ctx-9");
  assert.equal(store.markSent("missing", "ctx"), null);
});

test("serialize round-trips", () => {
  const store = new SavedMomentsStore([], fixedIds());
  store.add({ kind: "note", note: "keep me", createdAt: "2026-01-01T00:00:00.000Z" });
  const restored = SavedMomentsStore.deserialize(store.serialize(), fixedIds());
  assert.equal(restored.size(), 1);
  assert.equal(restored.list()[0].note, "keep me");
});

test("deserialize of garbage yields empty store", () => {
  const restored = SavedMomentsStore.deserialize("not json");
  assert.equal(restored.size(), 0);
});
