import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExplainSelectionPrompt,
  matchGlassIdeEditorVoiceIntent,
  resolveGlassIdeFileQuery,
} from "../shared/glassIdeEditorContext.ts";

describe("glassIdeEditorContext voice", () => {
  const ctx = {
    relativePath: "src/auth/login.ts",
    language: "typescript",
    selectionStartLine: 4,
    selectionEndLine: 6,
    selectionStartColumn: 1,
    selectionEndColumn: 2,
    selectedText: "export function login() {}",
    cursorLine: 4,
    cursorColumn: 1,
    updatedAt: Date.now(),
  };

  it("matches explain selection", () => {
    const intent = matchGlassIdeEditorVoiceIntent("explain this function", ctx);
    assert.equal(intent?.kind, "explain_selection");
    assert.match(intent?.prompt ?? "", /login\.ts/);
  });

  it("matches what changed here", () => {
    const intent = matchGlassIdeEditorVoiceIntent("what changed here?", ctx);
    assert.equal(intent?.kind, "what_changed");
  });

  it("matches open file by name", () => {
    const intent = matchGlassIdeEditorVoiceIntent("open the auth file", ctx);
    assert.equal(intent?.kind, "open_file");
    assert.equal(intent?.query, "auth");
  });

  it("buildExplainSelectionPrompt includes selection", () => {
    const prompt = buildExplainSelectionPrompt(ctx);
    assert.match(prompt, /export function login/);
  });

  it("resolveGlassIdeFileQuery finds by basename", () => {
    const resolved = resolveGlassIdeFileQuery("login.ts", [
      "src/auth/login.ts",
      "src/other.ts",
    ]);
    assert.equal(resolved, "src/auth/login.ts");
  });
});
