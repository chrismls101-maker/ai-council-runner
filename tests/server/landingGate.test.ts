/**
 * Landing page password gate — enabled only when LANDING_PASSWORD is set.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getLandingPassword,
  isLandingGateEnabled,
  verifyLandingPassword,
} from "../../dist/server/landingGate.js";

function withLandingPassword<T>(password: string | undefined, fn: () => T): T {
  const prev = process.env.LANDING_PASSWORD;
  if (password === undefined) delete process.env.LANDING_PASSWORD;
  else process.env.LANDING_PASSWORD = password;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.LANDING_PASSWORD;
    else process.env.LANDING_PASSWORD = prev;
  }
}

test("gate is disabled when LANDING_PASSWORD is unset", () => {
  withLandingPassword(undefined, () => {
    assert.equal(getLandingPassword(), undefined);
    assert.equal(isLandingGateEnabled(), false);
    assert.equal(verifyLandingPassword("anything"), true);
  });
});

test("gate is enabled and verifies password when LANDING_PASSWORD is set", () => {
  withLandingPassword("preview-secret", () => {
    assert.equal(getLandingPassword(), "preview-secret");
    assert.equal(isLandingGateEnabled(), true);
    assert.equal(verifyLandingPassword("preview-secret"), true);
    assert.equal(verifyLandingPassword("wrong"), false);
  });
});
