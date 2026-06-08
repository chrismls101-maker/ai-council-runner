import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("landing gate exposes password reveal and unlock storage key", () => {
  const gate = readFileSync(join(root, "src/components/glass-landing/LandingGate.tsx"), "utf8");
  const utils = readFileSync(join(root, "src/utils/landingGate.ts"), "utf8");

  assert.match(gate, /landing-gate-password-reveal/);
  assert.match(gate, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(utils, /iivo_landing_gate_unlocked/);
});

test("public landing route wraps page with landing gate", () => {
  const router = readFileSync(join(root, "src/AppRouter.tsx"), "utf8");
  assert.match(router, /LandingGate/);
  assert.match(router, /GlassLandingPage/);
});
