import assert from "node:assert/strict";
import { test } from "node:test";
import { FounderAuthError } from "../../src/server/auth/founderAuth.ts";
import { normalizeUserRole } from "../../src/server/auth/userRoles.ts";

test("FounderAuthError carries HTTP status", () => {
  const err = new FounderAuthError(403, "Founder access required.");
  assert.equal(err.status, 403);
  assert.equal(err.message, "Founder access required.");
});

test("normalizeUserRole treats founder and admin distinctly", () => {
  assert.equal(normalizeUserRole("founder"), "founder");
  assert.equal(normalizeUserRole("admin"), "admin");
  assert.notEqual(normalizeUserRole("admin"), "founder");
});
