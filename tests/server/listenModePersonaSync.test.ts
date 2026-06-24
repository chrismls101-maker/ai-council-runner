import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LISTEN_MODE_PERSONA_NAME,
  buildActiveListeningPromptBlock,
  getListenModePersonaCore,
  getListenModePersonaHardRules,
} from "../../src/server/glass/activeListeningPrompt.ts";
import {
  getListenModePersonaCore as desktopCore,
  getListenModePersonaHardRules as desktopRules,
  LISTEN_MODE_PERSONA_NAME as desktopName,
} from "../../glass-app/src/shared/listenModePersona.ts";

test("desktop and server persona names match", () => {
  assert.equal(desktopName, LISTEN_MODE_PERSONA_NAME);
});

test("server and desktop persona core share key markers", () => {
  const serverCore = getListenModePersonaCore();
  const deskCore = desktopCore();
  for (const marker of ["Thought Partner", "stay quiet", "Do not invent"]) {
    assert.match(serverCore, new RegExp(marker, "i"), `server missing: ${marker}`);
    assert.match(deskCore, new RegExp(marker, "i"), `desktop missing: ${marker}`);
  }
});

test("hard rules include facial, microphone, and AI tool guards", () => {
  const serverRules = getListenModePersonaHardRules().join(" ");
  const desktopRulesJoined = desktopRules().join(" ");
  for (const marker of ["facial", "microphone", "your AI tool"]) {
    assert.match(serverRules, new RegExp(marker, "i"));
    assert.match(desktopRulesJoined, new RegExp(marker, "i"));
  }
});

test("listen mode prompt block includes persona contract", () => {
  const block = buildActiveListeningPromptBlock(
    {
      enabled: true,
      activeMode: "listen",
      windowMinutes: 5,
      chunkCount: 3,
      systemAudioChunkCount: 3,
      microphoneChunkCount: 0,
      recentTranscriptWindow: "Distribution beats speed for founders.",
      detectedIntent: "ask_thoughts",
      currentMoment: {
        momentContextStatus: "ready",
        recentMomentTranscript: "Distribution beats speed for founders.",
      },
    },
    "What do you think about that?",
  );
  assert.match(block, /Thought Partner/);
  assert.match(block, /Do not invent/i);
  assert.match(block, /facial/i);
  assert.match(block, /microphone/i);
  assert.match(block, /your AI tool/i);
  assert.match(block, /ask_thoughts/);
});

test("thin context uses audio wording on server", () => {
  const block = buildActiveListeningPromptBlock(
    {
      enabled: true,
      activeMode: "listen",
      windowMinutes: 5,
      chunkCount: 0,
      systemAudioChunkCount: 0,
      microphoneChunkCount: 0,
      recentTranscriptWindow: "",
      contextThin: true,
    },
    "Explain this",
  );
  assert.match(block, /building context from the audio/i);
  assert.doesNotMatch(block, /building context from the video/i);
});
