import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectPrivacyIntent,
  detectResumeIntent,
} from "../shared/companionPrivacyDetect.ts";

describe("companionPrivacyDetect", () => {
  it("detects privacy triggers", () => {
    assert.equal(detectPrivacyIntent("stop listening").isPrivacy, true);
    assert.equal(detectPrivacyIntent("give us a minute").isPrivacy, true);
    assert.equal(detectPrivacyIntent("hello there").isPrivacy, false);
  });

  it("parses duration from privacy phrase", () => {
    assert.equal(detectPrivacyIntent("come back in 15 minutes").durationMs, 900_000);
    assert.equal(detectPrivacyIntent("check back in 2 hours").durationMs, 7_200_000);
  });

  it("detects resume triggers", () => {
    assert.equal(detectResumeIntent("come back"), true);
    assert.equal(detectResumeIntent("you're good now"), true);
    assert.equal(detectResumeIntent("random chatter"), false);
  });

  it("does not treat timed privacy phrase as resume", () => {
    assert.equal(detectResumeIntent("come back in 15 minutes"), false);
  });
});
