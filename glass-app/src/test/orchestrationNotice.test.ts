import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emitOrchestrationNotice,
  resetOrchestrationNoticeForTests,
  setOrchestrationNoticeSink,
} from "../main/orchestrationNotice.ts";

test("emitOrchestrationNotice debounces identical messages within 60s", () => {
  resetOrchestrationNoticeForTests();
  const seen: string[] = [];
  setOrchestrationNoticeSink((msg) => seen.push(msg));
  emitOrchestrationNotice("Memory: using keyword fallback.");
  emitOrchestrationNotice("Memory: using keyword fallback.");
  assert.equal(seen.length, 1);
  setOrchestrationNoticeSink(null);
});

test("emitOrchestrationNotice allows different messages", () => {
  resetOrchestrationNoticeForTests();
  const seen: string[] = [];
  setOrchestrationNoticeSink((msg) => seen.push(msg));
  emitOrchestrationNotice("Design: auto-repair verified.");
  emitOrchestrationNotice("Memory: using keyword fallback.");
  assert.equal(seen.length, 2);
  setOrchestrationNoticeSink(null);
});
