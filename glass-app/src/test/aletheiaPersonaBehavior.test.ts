import { test } from "node:test";
import assert from "node:assert/strict";
import {
  companionActivationSpeechForMode,
  isFounderCommandTier,
  resolveAletheiaOperatingMode,
  resolveAletheiaPersonaBehavior,
  truncateAletheiaSpokenText,
} from "../shared/aletheiaPersonaBehavior.ts";

import type { IivoAccountLink } from "../shared/iivoAccountLink.ts";

const founderLink: IivoAccountLink = {
  sessionToken: "t",
  userId: "u1",
  email: "f@example.com",
  name: "Founder",
  role: "founder",
  fullBuildLoop: true,
  linkedAt: new Date().toISOString(),
};

const adminLink: IivoAccountLink = {
  ...founderLink,
  role: "admin",
};

test("isFounderCommandTier requires explicit Deployed Execution", () => {
  assert.equal(
    isFounderCommandTier({ accountLink: founderLink, deployedExecutionActive: true }),
    true,
  );
  assert.equal(isFounderCommandTier({ accountLink: founderLink }), false);
  assert.equal(
    isFounderCommandTier({ accountLink: adminLink, deployedExecutionActive: true }),
    false,
  );
});

test("resolveAletheiaOperatingMode maps persona and founder tier", () => {
  assert.equal(resolveAletheiaOperatingMode("general", false), "guided");
  assert.equal(resolveAletheiaOperatingMode("developer", false), "developer_terse");
  assert.equal(resolveAletheiaOperatingMode("general", true), "founder_operational");
});

test("resolveAletheiaPersonaBehavior differs founder tier vs general user", () => {
  const founder = resolveAletheiaPersonaBehavior({
    persona: "general",
    accountLink: founderLink,
    deployedExecutionActive: true,
  });
  const founderPassive = resolveAletheiaPersonaBehavior({
    persona: "general",
    accountLink: founderLink,
  });
  const guided = resolveAletheiaPersonaBehavior({ persona: "general" });

  assert.equal(founder.operatingMode, "founder_operational");
  assert.equal(founderPassive.operatingMode, "guided");
  assert.equal(guided.operatingMode, "guided");
  assert.equal(founder.initiativeLevel, "high");
  assert.equal(guided.initiativeLevel, "low");
  assert.notEqual(founder.activationSpeech, guided.activationSpeech);
  assert.match(founder.promptDirective, /founder operational/i);
  assert.match(guided.promptDirective, /guided/i);
});

test("companionActivationSpeechForMode stays brief for founder", () => {
  const speech = companionActivationSpeechForMode("founder_operational");
  assert.ok(speech.length < 48);
  assert.match(speech, /move/i);
});

test("truncateAletheiaSpokenText respects persona tts cap", () => {
  const snapshot = resolveAletheiaPersonaBehavior({ persona: "developer" });
  const long = "word ".repeat(200);
  const spoken = truncateAletheiaSpokenText(long, snapshot);
  assert.ok(spoken.length <= snapshot.ttsMaxChars + 1);
  assert.match(spoken, /…$/);
});
