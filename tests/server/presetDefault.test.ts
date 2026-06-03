import assert from "node:assert/strict";
import { buildFullPrompt, PRESETS } from "../../dist/server/presets/index.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test("none preset injects no product scenario block", () => {
  const full = buildFullPrompt("none", "Analyze this screenshot of Design.com");
  assert.ok(!full.includes("AI receptionist named Sarah"));
  assert.ok(!full.includes("pilot customers"));
  assert.equal(PRESETS.none, "");
});

test("ai-front-desk preset still injects when explicitly selected", () => {
  const full = buildFullPrompt("ai-front-desk-sales-test", "What is the first sales move?");
  assert.match(full, /AI Front Desk/i);
  assert.match(full, /pilot customers/i);
});

test("unknown preset id behaves like empty preset context", () => {
  const full = buildFullPrompt("unknown-preset", "Hello");
  assert.ok(!full.includes("AI receptionist named Sarah"));
});
