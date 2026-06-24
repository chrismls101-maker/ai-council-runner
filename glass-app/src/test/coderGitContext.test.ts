import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCoderGitBootstrap,
  parseGitPorcelain,
} from "../shared/coderGitContext.ts";

test("parseGitPorcelain extracts status and path", () => {
  const files = parseGitPorcelain(" M src/a.ts\n?? new.ts\n");
  assert.equal(files.length, 2);
  assert.equal(files[0]?.path, "src/a.ts");
  assert.equal(files[1]?.path, "new.ts");
});

test("formatCoderGitBootstrap includes branch and porcelain", () => {
  const text = formatCoderGitBootstrap({
    branch: "main",
    porcelainLines: [" M src/auth.ts"],
    diffStatLines: [" src/auth.ts | 4 +++---"],
  });
  assert.ok(text);
  assert.match(text!, /Branch: main/);
  assert.match(text!, /src\/auth\.ts/);
});
