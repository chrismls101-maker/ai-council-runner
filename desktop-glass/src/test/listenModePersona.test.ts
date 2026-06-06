import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListenProactiveThought,
  buildListenInterruptPersonaGuidance,
  buildListenReportPersonaGuidance,
} from "../shared/listenModePersona.ts";

test("buildListenProactiveThought returns grounded thought and reason", () => {
  const out = buildListenProactiveThought({
    moment: {
      type: "key_idea",
      transcriptAnchors: ["Distribution beats speed for early founders building in public."],
      summary: "Distribution beats speed.",
    },
  });
  assert.ok(out.suggestedThought.length > 40);
  assert.ok(out.reasonSelected.length > 20);
});

test("persona guidance hooks exist for interrupt and report", () => {
  assert.match(buildListenInterruptPersonaGuidance({ intent: "ask_thoughts" }), /thoughtful/i);
  assert.match(buildListenReportPersonaGuidance(), /Report moments/i);
});
