import { test } from "node:test";
import assert from "node:assert/strict";
import { formatOverlayPlainText } from "../shared/overlayPlainText.ts";

test("formatOverlayPlainText strips markdown heading markers", () => {
  const plain = formatOverlayPlainText("# Session Debrief — Demo\n\n## Summary\n- Item");
  assert.doesNotMatch(plain, /#/);
  assert.match(plain, /Session Debrief — Demo/);
  assert.match(plain, /Summary/);
  assert.match(plain, /• Item/);
});
