import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPANION_LOOKING_SPEECH,
  COMPANION_TTS_MAX_CHARS,
  companionPrefersResponsePanel,
  companionSpeechTextFromResponse,
  companionStatusLabel,
  companionUserWantsDepth,
  shouldAutoStartCompanionSystemAudio,
} from "../shared/glassCompanion.ts";

test("companionSpeechTextFromResponse prefers shortAnswer", () => {
  const text = companionSpeechTextFromResponse({
    prompt: "What is this?",
    answer: "Short overlay snippet",
    shortAnswer: "This is the spoken summary.",
    fullAnswer: "# Long\n\nDetailed markdown body that should not be read aloud.",
    at: new Date().toISOString(),
  });
  assert.equal(text, "This is the spoken summary.");
});

test("companionSpeechTextFromResponse strips markdown from full answer", () => {
  const text = companionSpeechTextFromResponse({
    prompt: "Explain",
    answer: "overlay",
    fullAnswer: "## Header\n\nUse **`npm run glass:dev`** to start.",
    at: new Date().toISOString(),
  });
  assert.match(text, /npm run glass:dev/);
  assert.doesNotMatch(text, /##/);
  assert.doesNotMatch(text, /\*\*/);
});

test("companionSpeechTextFromResponse truncates long answers", () => {
  const long = "word ".repeat(200).trim();
  const text = companionSpeechTextFromResponse(
    {
      prompt: "Long",
      answer: long,
      at: new Date().toISOString(),
    },
    80,
  );
  assert.ok(text.length <= 82);
  assert.match(text, /…$/);
});

test("companionStatusLabel prefixes Voice Mode labels", () => {
  assert.equal(companionStatusLabel("listening"), "Aletheia · Listening");
  assert.equal(companionStatusLabel("looking"), "Aletheia · Looking");
  assert.equal(companionStatusLabel("idle"), "Aletheia · On");
  assert.equal(companionStatusLabel("listening", { speaking: true }), "Aletheia · Speaking");
  assert.equal(
    companionStatusLabel("listening", { hearingMachineAudio: true }),
    "Aletheia · Listening · + audio",
  );
});

test("COMPANION_LOOKING_SPEECH is a short visual-ask cue", () => {
  assert.ok(COMPANION_LOOKING_SPEECH.length < 80);
  assert.match(COMPANION_LOOKING_SPEECH, /look/i);
});

test("Aletheia warm-up and ready speech are short intro cues", async () => {
  const {
    COMPANION_WARMING_SPEECH,
    COMPANION_READY_SPEECH,
    COMPANION_THINKING_SPEECH,
    COMPANION_MACHINE_AUDIO_DISCLOSURE,
    ALETHEIA_IDENTITY_NAME,
  } = await import("../shared/glassCompanion.ts");
  assert.equal(ALETHEIA_IDENTITY_NAME, "Aletheia");
  assert.ok(COMPANION_WARMING_SPEECH.length < 80);
  assert.match(COMPANION_READY_SPEECH, /Aletheia/i);
  assert.ok(COMPANION_THINKING_SPEECH.length < 60);
  assert.match(COMPANION_MACHINE_AUDIO_DISCLOSURE, /screen audio/i);
});

test("COMPANION_TTS_MAX_CHARS keeps Phase 1 speech bounded", () => {
  assert.equal(COMPANION_TTS_MAX_CHARS, 600);
});

test("companionPrefersResponsePanel detects generative and depth prompts", () => {
  assert.equal(companionPrefersResponsePanel("Generate a project plan for my app"), true);
  assert.equal(companionPrefersResponsePanel("What is TypeScript?"), false);
  assert.equal(companionUserWantsDepth("Give me the long version"), true);
  assert.equal(companionUserWantsDepth("yes go deep"), true);
  assert.equal(companionUserWantsDepth("tell me everything"), true);
  assert.equal(companionUserWantsDepth("break this down"), true);
  assert.equal(companionPrefersResponsePanel("walk me through this in detail"), true);
});

test("shouldAutoStartCompanionSystemAudio when virtual device or connected", () => {
  assert.equal(shouldAutoStartCompanionSystemAudio({ systemAudioStatus: "available" }), true);
  assert.equal(
    shouldAutoStartCompanionSystemAudio({
      selectedVirtualAudioDeviceId: "blackhole-id",
      virtualAudioDevices: [
        { deviceId: "blackhole-id", label: "BlackHole 2ch", displayName: "BlackHole 2ch", kind: "blackhole" },
      ],
    }),
    true,
  );
  assert.equal(shouldAutoStartCompanionSystemAudio({ systemAudioStatus: "not_tested" }), false);
});
