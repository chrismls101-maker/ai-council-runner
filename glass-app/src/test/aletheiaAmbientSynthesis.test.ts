import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ambientSynthesisForUserContext,
  buildAletheiaAmbientSynthesis,
} from "../shared/aletheiaAmbientSynthesis.ts";

describe("buildAletheiaAmbientSynthesis", () => {
  test("connects terminal error with matching clipboard", () => {
    const snapshot = buildAletheiaAmbientSynthesis({
      activeApp: "Cursor",
      clipboardText: "TypeError: Cannot read property 'map' of undefined",
      terminalBlocks: [
        {
          command: "npm test",
          output: "TypeError: Cannot read property 'map' of undefined\n    at Object.<anonymous>",
          status: "error",
          exitCode: 1,
        },
      ],
      screenDigestFresh: true,
      screenDigest: "Editing auth.ts in Cursor.",
    });

    assert.ok(snapshot.ready);
    assert.ok(snapshot.connections.some((row) => row.id === "terminal_clipboard_error"));
    assert.match(snapshot.connectedPicture ?? "", /clipboard matches/i);
  });

  test("connects dev app with terminal error", () => {
    const snapshot = buildAletheiaAmbientSynthesis({
      activeApp: "Cursor",
      terminalBlocks: [
        {
          command: "npm run build",
          output: "error TS2345: Argument of type 'string' is not assignable",
          status: "error",
          exitCode: 1,
        },
      ],
    });

    assert.ok(snapshot.connections.some((row) => row.id === "terminal_dev_app"));
  });

  test("produces enriched context when ready", () => {
    const snapshot = buildAletheiaAmbientSynthesis({
      activeApp: "Cursor",
      screenDigestFresh: true,
      screenDigest: "Working in Cursor on GlassLandingPage.tsx",
      clipboardText: "const foo = bar;",
      terminalBlocks: [
        {
          command: "npm test",
          output: "FAIL src/test/example.test.ts",
          status: "error",
          exitCode: 1,
        },
      ],
    });

    const ctx = ambientSynthesisForUserContext(snapshot);
    assert.ok(ctx?.includes("Ambient synthesis"));
  });

  test("confirmOnly context is shorter", () => {
    const snapshot = buildAletheiaAmbientSynthesis({
      activeApp: "Cursor",
      clipboardText: "TypeError: boom",
      terminalBlocks: [
        {
          command: "npm test",
          output: "TypeError: boom",
          status: "error",
          exitCode: 1,
        },
      ],
    });

    const confirm = ambientSynthesisForUserContext(snapshot, { confirmOnly: true });
    const full = ambientSynthesisForUserContext(snapshot);
    assert.ok(confirm?.includes("Observed context for confirmation"));
    assert.ok(full && full.length > (confirm?.length ?? 0));
  });
});
