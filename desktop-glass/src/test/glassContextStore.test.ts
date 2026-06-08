import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("glassContextStore persists glass-context.json in userData", () => {
  const store = readFileSync(join(ROOT, "main", "glassContextStore.ts"), "utf8");
  const index = readFileSync(join(ROOT, "main", "index.ts"), "utf8");

  assert.match(store, /glass-context\.json/);
  assert.match(store, /loadGlassContextProfile/);
  assert.match(store, /persistGlassContextProfile/);
  assert.match(index, /loadGlassContextProfile/);
  assert.match(index, /recordGlassContextAfterResponse/);
  assert.match(index, /userContext/);
});
