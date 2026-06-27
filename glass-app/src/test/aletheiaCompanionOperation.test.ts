import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abortAletheiaCompanionOperation,
  finishAletheiaCompanionOperation,
  getAletheiaCompanionAbortSignal,
  isAletheiaCompanionOperationAborted,
  startAletheiaCompanionOperation,
} from "../main/aletheiaCompanionOperation.ts";

test("startAletheiaCompanionOperation aborts the previous operation", () => {
  const first = startAletheiaCompanionOperation();
  assert.equal(first.signal.aborted, false);
  const second = startAletheiaCompanionOperation();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  finishAletheiaCompanionOperation(second);
});

test("abortAletheiaCompanionOperation cancels the active signal", () => {
  const op = startAletheiaCompanionOperation();
  abortAletheiaCompanionOperation();
  assert.equal(op.signal.aborted, true);
  assert.equal(getAletheiaCompanionAbortSignal(), undefined);
  assert.equal(isAletheiaCompanionOperationAborted(op.signal), true);
});
