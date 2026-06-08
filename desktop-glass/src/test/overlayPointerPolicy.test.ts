import test from "node:test";
import assert from "node:assert/strict";
import {
  nextOverlayInteractiveCount,
  overlayFeedNotificationActive,
  overlayRequiresAlwaysInteractive,
  overlayShouldEnableClickThrough,
} from "../shared/overlayPointerPolicy.ts";

test("overlayFeedNotificationActive detects feed source", () => {
  assert.equal(
    overlayFeedNotificationActive({ id: "1", source: "feed", message: "x", isError: false }),
    true,
  );
  assert.equal(
    overlayFeedNotificationActive({ id: "1", source: "notice", message: "x", isError: false }),
    false,
  );
});

test("feed chat stays click-through until hovered", () => {
  assert.equal(
    overlayShouldEnableClickThrough({
      overlayContentVisible: false,
      feedNotificationActive: true,
      interactiveCount: 0,
      alwaysInteractive: false,
    }),
    true,
  );
  assert.equal(
    overlayShouldEnableClickThrough({
      overlayContentVisible: false,
      feedNotificationActive: true,
      interactiveCount: 1,
      alwaysInteractive: false,
    }),
    false,
  );
});

test("modal notices keep overlay interactive", () => {
  assert.equal(
    overlayRequiresAlwaysInteractive({
      updateOnly: false,
      copilotPrompt: false,
      passiveNoticeOnly: true,
    }),
    true,
  );
});

test("nextOverlayInteractiveCount clamps at zero", () => {
  assert.equal(nextOverlayInteractiveCount(0, -1), 0);
  assert.equal(nextOverlayInteractiveCount(1, -1), 0);
});
