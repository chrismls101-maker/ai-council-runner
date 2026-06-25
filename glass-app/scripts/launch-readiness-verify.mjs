#!/usr/bin/env node
/**
 * Launch readiness — automated proxy checks for manual QA items.
 * Run: node scripts/launch-readiness-verify.mjs
 */

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  detectUncleanShutdown,
  markSessionClosed,
  markSessionOpen,
  runIntegrityCheckOnFile,
} from "../src/main/glassDatabaseStartup.ts";
import {
  GLASS_DB_MIGRATION_V1,
  GLASS_DB_MIGRATION_V7_MODEL_CALLS,
} from "../src/main/glassDatabaseSchema.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const dir = mkdtempSync(join(tmpdir(), "glass-launch-verify-"));
const dbPath = join(dir, "session-history.db");
const db = new Database(dbPath);
db.exec(GLASS_DB_MIGRATION_V1);
db.exec(`
  CREATE TABLE IF NOT EXISTS app_session_tombstone (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    status TEXT NOT NULL,
    opened_at INTEGER NOT NULL,
    closed_at INTEGER
  );
  INSERT OR IGNORE INTO app_session_tombstone (singleton, status, opened_at, closed_at)
  VALUES (1, 'session_closed', 0, 0);
`);
db.exec(GLASS_DB_MIGRATION_V7_MODEL_CALLS);

// Simulate force-quit: session left open
markSessionOpen(db);
assert(detectUncleanShutdown(db) === true, "unclean shutdown should be detected with open tombstone");

const integrity = runIntegrityCheckOnFile(dbPath);
assert(integrity.ok === true, "integrity_check should pass after abrupt close simulation");

markSessionClosed(db);
assert(detectUncleanShutdown(db) === false, "clean shutdown should clear unclean flag");

db.close();

console.log("PASS: force-quit tombstone simulation (integrity ok, unclean detected then cleared)");
console.log("");
console.log("Manual checks still required:");
console.log("  1. cd glass-app && npm run dev");
console.log("  2. Start a build loop, force-quit in Activity Monitor, relaunch");
console.log('  3. Expect toast: "Glass recovered from an unexpected exit."');
console.log("  4. Confirm ~/Library/Application Support/IIVO Glass/session-history.db exists");
console.log("");
console.log("Fresh install manual:");
console.log('  rm -rf "$HOME/Library/Application Support/IIVO Glass"');
console.log("  cd glass-app && npm run dev  # splash → language → Sorting Hat → activation");
