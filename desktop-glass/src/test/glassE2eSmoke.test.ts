import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  commandBarLayoutFromDisplay,
  overlayLayoutFromDisplay,
} from "../shared/glassLayoutMath.ts";
import type { DisplayLayoutContext } from "../shared/glassLayoutMath.ts";
import {
  appendCommandFeedItem,
  createCommandFeedItem,
} from "../shared/commandFeed.ts";
import {
  COUNCIL_RESPONSE_MARKERS,
  glassAskRequestIsDirectOnly,
  glassDirectResponseIsClean,
  sourceExcludesRunCouncilFull,
} from "../shared/glassDirectGuard.ts";
import { buildGlassAskUrl } from "../main/glassAskClient.ts";
import { DEFAULT_CONFIG } from "../shared/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const display: DisplayLayoutContext = {
  id: 1,
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
};

test("overlay bounds match display bounds", () => {
  const overlay = overlayLayoutFromDisplay(display);
  assert.equal(overlay.x, display.bounds.x);
  assert.equal(overlay.y, display.bounds.y);
  assert.equal(overlay.width, display.bounds.width);
  assert.equal(overlay.height, display.bounds.height);
});

test("command bar is centered near bottom of workArea", () => {
  const bar = commandBarLayoutFromDisplay(display);
  assert.ok(bar.y > display.workArea.y + display.workArea.height * 0.5);
  assert.ok(bar.x + bar.width / 2 > display.workArea.x + display.workArea.width * 0.35);
  assert.ok(bar.x + bar.width / 2 < display.workArea.x + display.workArea.width * 0.65);
});

test("command submit flow creates thinking then response cards", () => {
  const fullFeed = appendCommandFeedItem(
    [
      createCommandFeedItem("command", "What am I working on?", { prompt: "What am I working on?" }),
      createCommandFeedItem("thinking", "IIVO is thinking…"),
    ],
    createCommandFeedItem("response", "You are editing IIVO Glass.", {
      prompt: "What am I working on?",
      fullBody: "You are editing IIVO Glass.",
    }),
  );
  assert.equal(fullFeed.length, 3);
  assert.equal(fullFeed[1].kind, "thinking");
  assert.equal(fullFeed[2].kind, "response");
});

test("cancel removes thinking and adds cancelled message", () => {
  const feed = [
    createCommandFeedItem("command", "hello", { prompt: "hello" }),
    createCommandFeedItem("thinking", "IIVO is thinking…"),
  ].filter((item) => item.kind !== "thinking");
  const afterCancel = appendCommandFeedItem(feed, createCommandFeedItem("error", "Request cancelled."));
  assert.equal(afterCancel.some((i) => i.kind === "thinking"), false);
  assert.match(afterCancel.at(-1)?.body ?? "", /cancelled/i);
});

test("buildGlassAskUrl targets direct ask endpoint", () => {
  assert.match(buildGlassAskUrl(DEFAULT_CONFIG), /\/api\/glass\/ask$/);
});

test("glass ask request stays direct-only", () => {
  assert.equal(glassAskRequestIsDirectOnly({ prompt: "hello", responseStyle: "overlay" }), true);
  assert.equal(glassAskRequestIsDirectOnly({ prompt: "hello", mode: "council" }), false);
});

test("direct response rejects council markers", () => {
  assert.equal(glassDirectResponseIsClean("You are editing the overlay."), true);
  assert.equal(glassDirectResponseIsClean("Final Action Plan\n- step"), false);
});

test("server glass ask handler excludes runCouncilFull", () => {
  const handlerSource = readFileSync(join(root, "../../src/server/glass/glassAskHandler.ts"), "utf8");
  const directSource = readFileSync(join(root, "../../src/server/glass/glassDirectAsk.ts"), "utf8");
  assert.equal(sourceExcludesRunCouncilFull(handlerSource), true);
  assert.equal(sourceExcludesRunCouncilFull(directSource), true);
});

test("main submitCommand success path does not auto-open browser", () => {
  const mainSource = readFileSync(join(root, "main/index.ts"), "utf8");
  const start = mainSource.indexOf("async function submitCommand");
  const end = mainSource.indexOf("\nasync function handleCommand", start);
  const block = mainSource.slice(start, end);
  const successBlock = block.slice(block.indexOf("try {"), block.indexOf("} catch"));
  assert.doesNotMatch(successBlock, /openHandoff|openExternal/);
});

test("COUNCIL_RESPONSE_MARKERS covers required phrases", () => {
  for (const phrase of ["Final Action Plan", "Decision Quality", "Sales Attack"]) {
    assert.match(phrase, COUNCIL_RESPONSE_MARKERS);
  }
});
