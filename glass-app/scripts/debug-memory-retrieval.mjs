#!/usr/bin/env node
/**
 * Manual debug: seed fake session summaries, embed, vector-search, print composite scores.
 *
 * Mirrors glassMemoryEngine compositeScore (distance * 0.7 + recencyPenalty * 0.3).
 * Does NOT touch your live Glass userData unless you pass --db explicitly.
 *
 * Usage:
 *   node scripts/debug-memory-retrieval.mjs
 *   node scripts/debug-memory-retrieval.mjs --query "React dashboard project"
 *   node scripts/debug-memory-retrieval.mjs --db "$HOME/Library/Application Support/IIVO Glass/session-history.db"
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { EmbeddingModel, FlagEmbedding } from "fastembed";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FAKE_SUMMARIES = [
  {
    daysAgo: 14,
    summary:
      "User debugged a React TypeScript dashboard, focusing on chart rendering and API latency.",
  },
  {
    daysAgo: 7,
    summary:
      "User planned a product launch for an AI desktop assistant and drafted release notes.",
  },
  {
    daysAgo: 3,
    summary:
      "User configured SQLite session history and verified memory embeddings for Glass.",
  },
  {
    daysAgo: 1,
    summary:
      "User asked about Whisper STT fallback when Deepgram streaming disconnects mid-session.",
  },
  {
    daysAgo: 0.1,
    summary:
      "User validated zero-config fresh install: activation screen, Anthropic key, first ask.",
  },
];

function parseArgs(argv) {
  const out = { query: "What was I working on with React?", db: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--query" && argv[i + 1]) out.query = argv[++i];
    else if (argv[i] === "--db" && argv[i + 1]) out.db = argv[++i];
  }
  return out;
}

function recencyPenalty(createdAt) {
  const days = (Date.now() - createdAt) / MS_PER_DAY;
  return days / 90;
}

function compositeScore(distance, createdAt) {
  return distance * 0.7 + recencyPenalty(createdAt) * 0.3;
}

function vectorToBlob(v) {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      agent_id TEXT,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      embedding BLOB NOT NULL,
      memory_type TEXT NOT NULL,
      importance REAL DEFAULT 0.5,
      created_at INTEGER NOT NULL,
      accessed_at INTEGER,
      access_count INTEGER DEFAULT 0,
      confirmed_count INTEGER DEFAULT 0,
      provider TEXT,
      tags TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
      embedding float[384]
    );
    CREATE TRIGGER IF NOT EXISTS memories_after_insert AFTER INSERT ON memories BEGIN
      INSERT INTO memories_vec(rowid, embedding) VALUES (new.rowid, new.embedding);
    END;
  `);
}

async function embedPassage(embedder, text) {
  for await (const batch of embedder.passageEmbed([text], 1)) {
    const vector = batch[0];
    if (vector) return new Float32Array(vector);
  }
  throw new Error("passageEmbed returned no vector");
}

async function embedQuery(embedder, text) {
  const vector = await embedder.queryEmbed(text.trim());
  return new Float32Array(vector);
}

async function main() {
  const { query, db: dbPath } = parseArgs(process.argv);
  const tempDir = mkdtempSync(join(tmpdir(), "glass-mem-debug-"));
  const path = dbPath ?? join(tempDir, "debug-memories.db");
  const ownsDb = !dbPath;

  console.log(`[debug-memory] db: ${path}`);
  console.log(`[debug-memory] query: ${query}\n`);

  const db = new Database(path);
  sqliteVec.load(db);
  if (ownsDb) {
    applySchema(db);
  }

  console.log("[debug-memory] loading fastembed all-MiniLM-L6-v2…");
  const embedder = await FlagEmbedding.init({
    model: EmbeddingModel.AllMiniLML6V2,
    cacheDir: join(tempDir, "models"),
    showDownloadProgress: true,
  });

  if (ownsDb) {
    console.log("[debug-memory] seeding 5 fake session summaries…\n");
    const insert = db.prepare(
      `INSERT INTO memories (
        id, session_id, agent_id, content, summary, embedding, memory_type,
        importance, created_at, provider, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const item of FAKE_SUMMARIES) {
      const createdAt = Date.now() - Math.round(item.daysAgo * MS_PER_DAY);
      const embedding = await embedPassage(embedder, item.summary);
      const id = randomUUID();
      insert.run(
        id,
        `debug-session-${id.slice(0, 8)}`,
        "memory-engine",
        item.summary,
        item.summary,
        vectorToBlob(embedding),
        "session_summary",
        0.5,
        createdAt,
        "debug",
        `debug:seed:${id}`,
      );
      console.log(
        `  + ${item.daysAgo}d ago | composite baseline recency=${recencyPenalty(createdAt).toFixed(4)} | ${item.summary.slice(0, 72)}…`,
      );
    }
    console.log("");
  }

  const queryVector = await embedQuery(embedder, query);
  const blob = vectorToBlob(queryVector);

  const k = 8;
  const rows = db
    .prepare(
      `SELECT m.id, m.summary, m.created_at, v.distance
       FROM memories_vec v
       INNER JOIN memories m ON m.rowid = v.rowid
       WHERE v.embedding MATCH ?
         AND k = ?
       ORDER BY v.distance`,
    )
    .all(blob, k);

  const ranked = rows
    .map((row) => ({
      id: row.id,
      summary: row.summary,
      createdAt: row.created_at,
      distance: row.distance,
      recency: recencyPenalty(row.created_at),
      composite: compositeScore(row.distance, row.created_at),
    }))
    .sort((a, b) => a.composite - b.composite);

  console.log("Top 3 by composite score (lower = better match):\n");
  for (const [i, hit] of ranked.slice(0, 3).entries()) {
    const ageDays = ((Date.now() - hit.createdAt) / MS_PER_DAY).toFixed(1);
    console.log(`#${i + 1} composite=${hit.composite.toFixed(4)} distance=${hit.distance.toFixed(4)} recency=${hit.recency.toFixed(4)} age=${ageDays}d`);
    console.log(`   ${hit.summary}\n`);
  }

  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    console.log(
      `[debug-memory] sanity: best composite (${best.composite.toFixed(4)}) should be <= worst (${worst.composite.toFixed(4)}): ${best.composite <= worst.composite ? "OK" : "UNEXPECTED"}`,
    );
  }

  db.close();
  if (ownsDb) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[debug-memory] failed:", err);
  process.exit(1);
});
