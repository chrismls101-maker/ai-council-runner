import assert from "node:assert/strict";
import {
  parseRunIdParam,
  readPendingRunIdHandoff,
} from "../../src/utils/runIdHandoff.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test("parseRunIdParam reads runId from query string", () => {
  assert.equal(parseRunIdParam("?runId=abc-123"), "abc-123");
  assert.equal(parseRunIdParam("?lensAsk=ctx1&runId=run-9"), "run-9");
  assert.equal(parseRunIdParam("?foo=bar"), undefined);
});

test("readPendingRunIdHandoff returns null when absent", () => {
  assert.equal(readPendingRunIdHandoff(""), null);
});

test("parseRunIdParam trims whitespace", () => {
  assert.equal(parseRunIdParam("?runId=%20run-x%20"), "run-x");
});

test("lensAsk param does not satisfy runId handoff", () => {
  assert.equal(parseRunIdParam("?lensAsk=ctx-1"), undefined);
});

console.log("runIdHandoff.test.ts: all assertions passed");
