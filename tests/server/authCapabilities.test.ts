import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthCapabilities } from "../../src/server/auth/authCapabilities.ts";

test("getAuthCapabilities reflects configured env vars", () => {
  const prev = { ...process.env };
  try {
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.RESEND_API_KEY;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    let caps = getAuthCapabilities();
    assert.equal(caps.magicLink, false);
    assert.equal(caps.github, false);
    assert.equal(caps.google, false);

    process.env.DATABASE_URL = "postgres://x";
    process.env.BETTER_AUTH_SECRET = "secret";
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    caps = getAuthCapabilities();
    assert.equal(caps.magicLink, true);
    assert.equal(caps.github, true);
    assert.equal(caps.google, false);
  } finally {
    process.env = prev;
  }
});
