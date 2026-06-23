# Cursor Code Review — Glass Index + Screen-Aware Coder

Review of implementation from `CURSOR_BUILD_GLASS_INDEX.md`.  
**Status:** `npx tsc --noEmit` passes. Fixes tracked below — implement in priority order.

---

## Critical

### 1. SQLite writes can throw uncaught during concurrent index + watcher
**File:** `src/main/glassIndex.ts` ~238–246, `src/main/index.ts` ~9502–9504  
**Issue:** `indexFile()` has no try/catch around `db.prepare(...).run()`. `indexProject` and the chokidar watcher both call `indexFile` concurrently (e.g. reindex via **Index now** while watcher is active). `SQLITE_BUSY` can cause unhandled rejections in main.  
**Fix:** Wrap DB writes in try/catch; add per-project mutex so only one index operation runs at a time; pause watcher during `indexProject`/`reindexProject`.

### 2. Agent start can block up to 60s on semantic search
**File:** `src/main/index.ts` ~9711–9712, `glassIndex.ts` ~156  
**Issue:** `agentRun` **awaits** `searchIndex()` before `{ started: true }`. `embedText` uses a **60s** timeout — slow Ollama freezes Agents UI on every Coder run when index exists.  
**Fix:** Cap query-embed timeout to ~5s for search; keep 60s for bulk indexing only.

---

## High

### 3. Semantic pre-seed paths not validated on disk
**File:** `src/main/index.ts` ~9712–9713, `agentCoderBootstrap.ts` ~176–177  
**Fix:** Filter with `existsSync` + project-root containment before bootstrap.

### 4. Screen-detected file path not validated
**File:** `src/main/screenContext.ts` ~150–156, `agentCoderBootstrap.ts` ~168–173  
**Fix:** `stat` path; drop if missing or outside `codeWorkspaceRoot`.

### 5. Ollama model pull can hang indefinitely
**File:** `src/main/glassIndex.ts` ~121–142  
**Fix:** AbortSignal timeout on pull fetch; cap read loop duration.

### 6. Mid-index Ollama failure → silent partial index marked “ready”
**File:** `src/main/glassIndex.ts` ~289–296, `index.ts` ~9554–9559  
**Fix:** Track consecutive embed failures; surface error if threshold exceeded.

### 7. No minimum similarity threshold in search
**File:** `src/main/glassIndex.ts` ~334–350  
**Fix:** Filter `score >= 0.3` before `.slice(0, topN)`.

### 8. Screen context outside project still injected
**File:** `agentCoderBootstrap.ts` ~168–173  
**Fix:** Same containment check as #4.

---

## Medium

### 9. No batch transactions during full index
**File:** `src/main/glassIndex.ts` ~289–294  
**Fix:** Use prepared upsert + `db.transaction()` for each write after embed.

### 10. Glass-index DB never closed on quit
**File:** `src/main/glassIndex.ts` ~27–28; `index.ts` ~11030–11032  
**Fix:** Export `closeAllIndexDbs()`; call in `will-quit`.

### 11. User can run Coder before screen detect finishes
**File:** `GlassAgentPanel.tsx` ~211–217  
**Fix:** Disable Run while `screenDetecting`.

### 12. `detectScreenFile` IPC has no end-to-end 2s cap in main
**File:** `index.ts` ~9876–9879  
**Fix:** Wrap capture + Haiku in one `screenDetectTimeout`.

### 13. No privacy disclosure for Anthropic screenshot upload
**File:** `Panel.tsx` ~822–827  
**Fix:** Hint under “Screen-aware context” about Claude Haiku screenshot.

### 14. `agentRun` blocks on bootstrap before `{ started: true }`
**File:** `index.ts` ~9705–9772  
**Note:** Correct per spec; file walk when index empty can add latency (acceptable).

### 15. Reindex deletes entire index while watcher active
**File:** `index.ts` ~9838, `glassIndex.ts` ~303–305  
**Fix:** `stopWatching(root)` before reindex; restart after.

### 16. Screen capture permission denial not surfaced
**File:** `capture.ts` ~64–67, `index.ts` ~9876–9891  
**Fix:** Return `detectError` on permission failure; show in chip.

---

## Low

### 17. Symlinks skipped (safe, incomplete coverage)
### 18. Binary `.ts` files may produce garbage embeddings
### 19. Duplicate context when prompt mentions same file
### 20. In-flight IPC after card collapse (UI ignores; main still completes)
### 21. `DEFAULT_GLASS_USER_SETTINGS` omits explicit coder index flags — **Fixed**

### Low-priority follow-ups — **Fixed 2026-06-22**

- **#17** Symlink-aware walk with `realpath` cycle guard
- **#18** Binary content rejection via `isMostlyTextContent`
- **#19** Skip screen context when prompt already mentions detected file
- **#20** Detect generation counter ignores stale IPC after collapse/submit

---

## Checklist (pre-fix)

| Area | Status |
|------|--------|
| Ollama missing model | ✅ Graceful |
| `embedText` timeout | ⚠️ Too long on search path |
| DB reused per project | ✅ |
| DB closed on quit | ❌ |
| Batch transactions | ❌ |
| `.gitignore` auto-add | ✅ |
| `searchIndex` never throws | ✅ |
| Haiku model + ~2s timeout | ✅ |
| IPC channels + preload | ✅ |
| Watcher lifecycle | ⚠️ Reindex race |
| `tsc --noEmit` | ✅ |

---

## Fix priority order

1. Mutex + try/catch on SQLite (#1)
2. Short search embed timeout (#2)
3. Validate pre-seed + screen paths (#3, #4, #8)
4. Pull timeout + pause watcher during reindex (#5, #15)
5. Min cosine threshold (#7)
6. Batch transactions + close DBs on quit (#9, #10)
7. Mid-index failure detection (#6)
8. UI: disable run while detecting, privacy copy, permission errors (#11, #13, #16)
9. End-to-end 2s cap in main (#12)
10. Default settings explicit (#21)

---

*Review completed 2026-06-22. Fixes applied in follow-up work on same branch (mutex, search timeout, path validation, watcher pause, cosine threshold, DB close, UI polish).*
