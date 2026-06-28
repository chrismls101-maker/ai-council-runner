#!/usr/bin/env node
/**
 * Glass memory audit — row counts, D2C cross-links, orphan detection.
 *
 * Usage:
 *   node scripts/glass-memory-audit.mjs
 *   node scripts/glass-memory-audit.mjs --json
 *   node scripts/glass-memory-audit.mjs --user-data "$HOME/Library/Application Support/IIVO Glass"
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";

function parseArgs(argv) {
  const out = {
    json: false,
    userData: join(homedir(), "Library", "Application Support", "IIVO Glass"),
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--user-data" && argv[i + 1]) out.userData = argv[++i];
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function countTable(db, table) {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    return Number(row?.n ?? 0);
  } catch {
    return null;
  }
}

function main() {
  const { json, userData } = parseArgs(process.argv);
  const dbPath = join(userData, "session-history.db");
  const projectsIndexPath = join(userData, "glass-storage", "projects-index.json");
  const settingsPath = join(userData, "glass-settings.json");

  const report = {
    userData,
    dbPath,
    dbExists: existsSync(dbPath),
    tables: {},
    recentD2cNotes: [],
    orphanLinks: [],
    latestDesignToCodeProjectId: null,
    d2cSemanticMemoryTags: [],
    projectsIndexCount: 0,
  };

  const settings = readJson(settingsPath);
  report.latestDesignToCodeProjectId = settings?.latestDesignToCodeProjectId ?? null;

  const projectsIndex = readJson(projectsIndexPath);
  const projects = Array.isArray(projectsIndex) ? projectsIndex : [];
  report.projectsIndexCount = projects.length;
  const projectIds = new Set(projects.map((p) => p.id));

  if (existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true });
    for (const table of [
      "memories",
      "user_context",
      "aletheia_notes",
      "aletheia_sessions",
      "sessions",
      "messages",
    ]) {
      report.tables[table] = countTable(db, table);
    }

    try {
      report.recentD2cNotes = db
        .prepare(
          `SELECT id, body, linked_project_id, created_at
           FROM aletheia_notes
           WHERE body LIKE 'Design to Code:%'
           ORDER BY created_at DESC
           LIMIT 10`,
        )
        .all();
    } catch {
      report.recentD2cNotes = [];
    }

    for (const note of report.recentD2cNotes) {
      const linked = note.linked_project_id?.trim();
      if (linked && !projectIds.has(linked)) {
        report.orphanLinks.push({
          noteId: note.id,
          linkedProjectId: linked,
        });
      }
    }

    try {
      report.d2cSemanticMemoryTags = db
        .prepare(
          `SELECT tags, summary, created_at FROM memories
           WHERE tags LIKE '%d2c:%'
           ORDER BY created_at DESC
           LIMIT 10`,
        )
        .all();
    } catch {
      report.d2cSemanticMemoryTags = [];
    }

    db.close();
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("[glass-memory-audit]");
  console.log(`userData: ${userData}`);
  console.log(`session-history.db: ${report.dbExists ? "found" : "missing"}`);
  if (report.dbExists) {
    console.log("table counts:", report.tables);
    console.log(`projects-index: ${report.projectsIndexCount} projects`);
    console.log(`latestDesignToCodeProjectId: ${report.latestDesignToCodeProjectId ?? "(none)"}`);
    console.log(`recent D2C notes: ${report.recentD2cNotes.length}`);
    if (report.orphanLinks.length) {
      console.warn("orphan note→project links:", report.orphanLinks);
    } else {
      console.log("orphan note→project links: none");
    }
    console.log(`recent d2c semantic memories: ${report.d2cSemanticMemoryTags.length}`);
  }
}

main();
