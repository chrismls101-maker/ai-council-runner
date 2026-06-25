import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  formatGlassAskErrorForUser,
  isGlassAskMissingKeyError,
} from "../shared/glassAskClientUtils.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../shared/glassSettings.ts";
import {
  GLASS_DB_CORE_TABLES,
  GLASS_DB_MIGRATION_V1,
} from "../main/glassDatabaseSchema.ts";

function missingKeyError(): Error {
  const err = new Error("No Anthropic API key found");
  err.name = "GlassAskNoAnthropicKeyError";
  return err;
}

test("default glass settings imply first-run onboarding", () => {
  assert.equal(DEFAULT_GLASS_USER_SETTINGS.onboardingComplete, false);
});

test("fresh install migration V1 creates all four core tables", () => {
  const dir = mkdtempSync(join(tmpdir(), "glass-fresh-"));
  const path = join(dir, "session-history.db");
  const db = new Database(path);
  db.exec(GLASS_DB_MIGRATION_V1);
  for (const table of GLASS_DB_CORE_TABLES) {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) as { name: string } | undefined;
    assert.equal(row?.name, table, `missing table ${table}`);
  }
  db.close();
});

test("formatGlassAskErrorForUser maps missing key to activation guidance", () => {
  const err = missingKeyError();
  assert.equal(isGlassAskMissingKeyError(err), true);
  const message = formatGlassAskErrorForUser(err);
  assert.match(message, /anthropic api key/i);
  assert.doesNotMatch(message, /open in iivo/i);
});

test("formatGlassAskErrorForUser keeps network errors readable", () => {
  const err = new Error("fetch failed: ECONNREFUSED");
  assert.equal(isGlassAskMissingKeyError(err), false);
  assert.match(formatGlassAskErrorForUser(err), /ECONNREFUSED/);
});
