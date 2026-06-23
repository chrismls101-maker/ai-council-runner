import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectAmbientConversation } from "../shared/companionAmbientDetect.ts";

describe("companionAmbientDetect", () => {
  it("suppresses social human-to-human utterances", () => {
    assert.equal(
      detectAmbientConversation("yeah totally that's so funny", undefined, undefined, 0)
        .addressedToCompanion,
      false,
    );
  });

  it("responds to device-directed phrasing", () => {
    assert.equal(
      detectAmbientConversation("can you explain what this does", undefined, undefined, 0)
        .addressedToCompanion,
      true,
    );
  });

  it("always responds to explicit name", () => {
    assert.equal(
      detectAmbientConversation("aletheia what time is it", undefined, undefined, 3)
        .addressedToCompanion,
      true,
    );
  });

  it("suppresses multi-speaker human conversation", () => {
    assert.equal(
      detectAmbientConversation("she said she was going to call", 1, 0, 2)
        .addressedToCompanion,
      false,
    );
  });
});
