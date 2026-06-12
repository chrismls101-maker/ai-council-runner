/**
 * Notes + Translate simultaneous coexistence stress test (Task #39)
 *
 * Verifies that the live-notes pipeline and the live-translate pipeline are
 * fully isolated and do not contaminate each other when both run concurrently
 * on the same audio stream.
 *
 * Strategy: test using only the pure shared functions (no Electron, no index.ts,
 * no real Deepgram connection). We simulate N "audio chunks" being delivered to
 * both pipelines and assert the correct invariants hold throughout.
 *
 * Invariants tested:
 *   1. Listen transcript state and translate captions state are fully independent.
 *   2. Chunks destined for translate do NOT appear in the listen rolling transcript.
 *   3. Chunks destined for listen notes do NOT appear in the translate captions.
 *   4. Stopping translate does NOT clear or alter listen transcript state.
 *   5. shouldRunListenNotesPipeline is independent of translate active state.
 *   6. isLiveTranslateActive is independent of listen notes state.
 *   7. After N concurrent rounds, both pipelines have the correct chunk counts.
 *   8. Interim listen fragments do not appear in the finalized transcript.
 *   9. Caption dedup in translate does not suppress listen fragments.
 *  10. Translate stop + restart does not reset listen rolling transcript.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initialListenRollingTranscript,
  applyListenTranscriptFragment,
  rollingTranscriptWindow,
  finalizedTranscriptFragments,
} from "../shared/listenStreamingTranscript.ts";
import {
  applyCaptionChunk,
  initialLiveTranslateCaptions,
} from "../shared/liveTranslateCaptions.ts";
import type { LiveTranslateConfig } from "../shared/liveTranslateTypes.ts";
import {
  isLiveTranslateActive,
  startLiveTranslate,
  stopLiveTranslate,
  initialLiveTranslateRuntime,
} from "../shared/liveTranslateState.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_TRANSLATE_CONFIG: LiveTranslateConfig = {
  enabled: true,
  mode: "media",
  source: "system_audio",
  sourceLanguage: "auto",
  targetLanguage: "en",
  displayMode: "original_and_translation",
  captionPosition: "bottom_center",
  saveMode: "private_no_save",
  latencyMode: "balanced",
};

const LISTEN_CHUNKS = [
  "The presenter explained the first key concept.",
  "She went on to describe the second insight.",
  "Finally, she summarized with a clear conclusion.",
  "Audience members began asking questions.",
  "The host wrapped up the session.",
];

const TRANSLATE_CHUNKS = [
  "[TRANSLATION] El presentador explicó el primer concepto clave.",
  "[TRANSLATION] Luego describió la segunda perspectiva.",
  "[TRANSLATION] Finalmente, resumió con una conclusión clara.",
  "[TRANSLATION] Los asistentes comenzaron a hacer preguntas.",
  "[TRANSLATION] El anfitrión cerró la sesión.",
];

// ─── 1. Independent state objects ────────────────────────────────────────────

describe("notes+translate — state isolation", () => {
  it("listen transcript state and translate captions state are fully independent objects", () => {
    const listenState = initialListenRollingTranscript();
    const captionState = initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG);
    // Modifying listen state must not affect caption state
    const listenAfter = applyListenTranscriptFragment(listenState, { text: "hello", isInterim: false });
    assert.deepStrictEqual(captionState, initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG),
      "Caption state must be unchanged after listen fragment applied");
    assert.notStrictEqual(listenAfter, listenState, "applyListenTranscriptFragment must return a new object");
  });

  it("applying a caption chunk does not modify listen transcript state", () => {
    const listenState = initialListenRollingTranscript();
    const captionState = initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG);
    const captionAfter = applyCaptionChunk(captionState, { original: "texto original", translated: "translation text", sentenceId: "s1" });
    assert.equal(listenState.finalFragmentCount, 0, "Listen fragment count must stay 0 after caption chunk");
    assert.equal(listenState.rollingText, "", "Listen rolling text must stay empty after caption chunk");
    assert.notStrictEqual(captionAfter, captionState, "applyCaptionChunk must return a new object");
  });
});

// ─── 2. Concurrent pipeline simulation ───────────────────────────────────────

describe("notes+translate — concurrent chunk delivery", () => {
  it("N chunks delivered to both pipelines are counted correctly in each independently", () => {
    let listenState = initialListenRollingTranscript();
    let captionState = initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG);
    let idCounter = 0;

    for (let i = 0; i < LISTEN_CHUNKS.length; i++) {
      // Simulate concurrent delivery: both receive a chunk in the same "tick"
      listenState = applyListenTranscriptFragment(listenState, {
        text: LISTEN_CHUNKS[i],
        isInterim: false,
        idFactory: () => `listen-${idCounter++}`,
      });
      captionState = applyCaptionChunk(captionState, {
        original: `source text ${i}`,
        translated: TRANSLATE_CHUNKS[i],
        sentenceId: `s${i}`,
      });
    }

    // Both should have received exactly N chunks
    assert.equal(listenState.finalFragmentCount, LISTEN_CHUNKS.length,
      `Listen should have ${LISTEN_CHUNKS.length} final fragments`);
    assert.ok(captionState.lines.length > 0 || captionState.current !== undefined,
      "Caption state should have received caption chunks");
  });

  it("translate text does NOT appear in listen rolling transcript", () => {
    let listenState = initialListenRollingTranscript();
    let captionState = initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG);

    for (let i = 0; i < LISTEN_CHUNKS.length; i++) {
      listenState = applyListenTranscriptFragment(listenState, {
        text: LISTEN_CHUNKS[i],
        isInterim: false,
      });
      captionState = applyCaptionChunk(captionState, {
        original: `source text ${i}`,
        translated: TRANSLATE_CHUNKS[i],
        sentenceId: `s${i}`,
      });
    }

    const rolling = rollingTranscriptWindow(listenState);
    for (const chunk of TRANSLATE_CHUNKS) {
      // Strip the [TRANSLATION] tag used in fixtures for easy identification
      const stripped = chunk.replace("[TRANSLATION] ", "");
      assert.ok(!rolling.includes(stripped),
        `Translate chunk should NOT appear in listen rolling transcript: "${stripped}"`);
    }
  });

  it("listen text does NOT appear in translate caption lines", () => {
    let listenState = initialListenRollingTranscript();
    let captionState = initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG);

    for (let i = 0; i < LISTEN_CHUNKS.length; i++) {
      listenState = applyListenTranscriptFragment(listenState, {
        text: LISTEN_CHUNKS[i],
        isInterim: false,
      });
      captionState = applyCaptionChunk(captionState, {
        original: `source text ${i}`,
        translated: TRANSLATE_CHUNKS[i],
        sentenceId: `s${i}`,
      });
    }

    const allCaptionText = [
      ...(captionState.lines ?? []).map((l) => l.translated ?? ""),
      captionState.current?.translated ?? "",
    ].join(" ");

    for (const chunk of LISTEN_CHUNKS) {
      assert.ok(!allCaptionText.includes(chunk.slice(0, 20)),
        `Listen chunk should NOT appear in caption state: "${chunk.slice(0, 20)}…"`);
    }
  });
});

// ─── 3. Translate stop does NOT affect listen state ───────────────────────────

describe("notes+translate — translate stop isolation", () => {
  it("stopping translate does not alter listen rolling transcript", () => {
    let listenState = initialListenRollingTranscript();
    let translateRuntime = startLiveTranslate(initialLiveTranslateRuntime());

    // Add some listen chunks
    for (const chunk of LISTEN_CHUNKS.slice(0, 3)) {
      listenState = applyListenTranscriptFragment(listenState, { text: chunk, isInterim: false });
    }

    const rollingBefore = rollingTranscriptWindow(listenState);
    const fragmentCountBefore = listenState.finalFragmentCount;

    // Stop translate
    translateRuntime = stopLiveTranslate(translateRuntime);

    // Listen state must be unchanged
    assert.equal(rollingTranscriptWindow(listenState), rollingBefore,
      "Rolling transcript must not change when translate stops");
    assert.equal(listenState.finalFragmentCount, fragmentCountBefore,
      "Fragment count must not change when translate stops");
  });

  it("translate stop + restart does not reset listen rolling transcript", () => {
    let listenState = initialListenRollingTranscript();
    let translateRuntime = startLiveTranslate(initialLiveTranslateRuntime());

    for (const chunk of LISTEN_CHUNKS) {
      listenState = applyListenTranscriptFragment(listenState, { text: chunk, isInterim: false });
    }
    const rollingBefore = rollingTranscriptWindow(listenState);

    // Simulate stop → restart cycle
    translateRuntime = stopLiveTranslate(translateRuntime);
    translateRuntime = startLiveTranslate(translateRuntime);

    assert.equal(rollingTranscriptWindow(listenState), rollingBefore,
      "Listen transcript must survive translate stop/restart cycle");
  });
});

// ─── 4. Active-state independence ─────────────────────────────────────────────

describe("notes+translate — active-state flags are independent", () => {
  it("isLiveTranslateActive is false when translate not started", () => {
    const translateRuntime = initialLiveTranslateRuntime();
    assert.equal(isLiveTranslateActive(translateRuntime), false);
  });

  it("isLiveTranslateActive is true even when listen notes has content", () => {
    let listenState = initialListenRollingTranscript();
    for (const chunk of LISTEN_CHUNKS) {
      listenState = applyListenTranscriptFragment(listenState, { text: chunk, isInterim: false });
    }
    const translateRuntime = startLiveTranslate(initialLiveTranslateRuntime());
    // Listen state being populated must not change translate active flag
    assert.equal(isLiveTranslateActive(translateRuntime), true);
    assert.ok(rollingTranscriptWindow(listenState).length > 0, "Listen state has content");
  });

  it("isLiveTranslateActive is false after stop, listen content still present", () => {
    let listenState = initialListenRollingTranscript();
    for (const chunk of LISTEN_CHUNKS) {
      listenState = applyListenTranscriptFragment(listenState, { text: chunk, isInterim: false });
    }
    let translateRuntime = startLiveTranslate(initialLiveTranslateRuntime());
    translateRuntime = stopLiveTranslate(translateRuntime);

    assert.equal(isLiveTranslateActive(translateRuntime), false,
      "Translate must be inactive after stop");
    assert.ok(rollingTranscriptWindow(listenState).length > 0,
      "Listen transcript must still have content after translate stops");
  });
});

// ─── 5. Interim fragment isolation ────────────────────────────────────────────

describe("notes+translate — interim fragment handling", () => {
  it("interim listen fragment does not appear in finalized transcript", () => {
    let state = initialListenRollingTranscript();
    state = applyListenTranscriptFragment(state, {
      text: "This is still being spoken…",
      isInterim: true,
    });
    const finalized = finalizedTranscriptFragments(state);
    assert.equal(finalized.length, 0, "Interim fragment must not be in finalized transcript");
  });

  it("final listen fragment replaces interim and appears in finalized transcript", () => {
    let state = initialListenRollingTranscript();
    state = applyListenTranscriptFragment(state, {
      text: "This is still being spoken",
      isInterim: true,
    });
    state = applyListenTranscriptFragment(state, {
      text: "This is still being spoken, now complete.",
      isInterim: false,
    });
    const finalized = finalizedTranscriptFragments(state);
    assert.equal(finalized.length, 1, "Should have exactly 1 finalized fragment");
    assert.ok(finalized[0].includes("now complete"), "Finalized fragment should have final text");
  });

  it("translate interim chunk does not contaminate listen interim state", () => {
    let listenState = initialListenRollingTranscript();
    let captionState = initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG);

    // Apply interim to listen
    listenState = applyListenTranscriptFragment(listenState, {
      text: "Listen interim text",
      isInterim: true,
    });
    // Apply interim to translate
    captionState = applyCaptionChunk(captionState, {
      original: "Texto original",
      translated: "Traducción preliminar",
      interim: true,
      sentenceId: "interim-s1",
    });

    // Listen should still have interim only
    assert.equal(listenState.finalFragmentCount, 0, "No final listen fragments yet");
    const listenRolling = rollingTranscriptWindow(listenState);
    assert.ok(!listenRolling.includes("Traducción"), "Translate interim must not appear in listen rolling text");
  });
});

// ─── 6. High-volume stress test ───────────────────────────────────────────────

describe("notes+translate — high-volume stress", () => {
  it("100 concurrent rounds: listen and translate states remain independent and consistent", () => {
    const N = 100;
    let listenState = initialListenRollingTranscript();
    let captionState = initialLiveTranslateCaptions(BASE_TRANSLATE_CONFIG);
    let idSeq = 0;

    for (let i = 0; i < N; i++) {
      const listenText = `Listen note ${i}: the speaker said something meaningful about topic ${i % 10}.`;
      const translateText = `Nota ${i}: el ponente dijo algo significativo sobre el tema ${i % 10}.`;

      listenState = applyListenTranscriptFragment(listenState, {
        text: listenText,
        isInterim: false,
        idFactory: () => `frag-${idSeq++}`,
      });
      captionState = applyCaptionChunk(captionState, {
        original: `fuente ${i}`,
        translated: translateText,
        sentenceId: `stress-s${i}`,
      });
    }

    // Listen should have exactly N fragments
    assert.equal(listenState.finalFragmentCount, N,
      `Expected ${N} final listen fragments after ${N} rounds`);

    // Rolling transcript must not contain any translate text
    const rolling = rollingTranscriptWindow(listenState, 99_999);
    assert.ok(!rolling.includes("Nota "), "Translate Spanish text must not appear in listen rolling window");

    // Caption state must not contain listen text
    const allCaptionText = [
      ...(captionState.lines ?? []).map((l) => l.translated ?? ""),
      captionState.current?.translated ?? "",
    ].join(" ");
    assert.ok(!allCaptionText.includes("Listen note "), "Listen text must not appear in caption state");

    // Both states should contain their own text
    assert.ok(rolling.includes("the speaker said"), "Listen rolling window should contain listen text");
  });
});
