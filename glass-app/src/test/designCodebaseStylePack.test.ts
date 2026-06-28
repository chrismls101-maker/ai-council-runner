import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildCodebaseStylePack } from "../main/design/designCodebaseStylePack.ts";

describe("buildCodebaseStylePack", () => {
  test("returns none confidence when file read not granted", async () => {
    const pack = await buildCodebaseStylePack({
      ctx: {
        fileName: "Button.tsx",
        language: "TypeScript (React)",
        filePath: "/src/Button.tsx",
        content: "export const Button = () => null;",
      },
      importedFiles: [],
      readFileGranted: false,
      stackFallback: "react-tsx",
    });
    assert.equal(pack.confidence, "none");
    assert.equal(pack.framework, "react-tsx");
    assert.equal(pack.openFileContext, undefined);
  });

  test("returns none when granted but file path missing", async () => {
    const pack = await buildCodebaseStylePack({
      ctx: {
        fileName: null,
        language: null,
        filePath: null,
        content: null,
      },
      importedFiles: [],
      readFileGranted: true,
      stackFallback: "vue",
    });
    assert.equal(pack.confidence, "none");
    assert.equal(pack.framework, "vue");
  });
});
