import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLikelyEcho } from "../shared/companionEchoDetect.ts";

describe("companionEchoDetect", () => {
  it("detects high token overlap as echo", () => {
    assert.equal(
      isLikelyEcho("the file is at src slash renderer", "the file is at src/renderer"),
      true,
    );
    assert.equal(
      isLikelyEcho("what about the other one", "the file is at src/renderer"),
      false,
    );
  });

  it("returns false when last spoken is empty", () => {
    assert.equal(isLikelyEcho("hello", ""), false);
  });
});
