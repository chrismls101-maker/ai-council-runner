# IIVO Glass — Baseline v0.5.0

**Date:** 2026-06-12  
**Branch:** main  
**Typecheck:** ✅ clean  
**Tests:** 1,192 passing / 0 failing  
**New since v0.4.0:** +103 tests (cross-session memory + terminal events)

---

## Health snapshot

| Metric | Value |
|--------|-------|
| Total tests | **1,192** |
| Passing | **1,192** |
| Failing | **0** |
| TypeScript errors | **0** |
| Test suites | 54 |

---

## What shipped in v0.5.0

### Power 1 — Cross-session memory (Tasks #70–#74)

Wingman now remembers past sessions across restarts. Sessions are saved to a JSONL file on disk, searchable by keyword, and surfaced in the report view as "Similar past sessions."

| Task | File | What it does |
|------|------|--------------|
| #70 | `src/shared/wingmanMemory.ts` | `WingmanSessionRecord` type, JSONL append/read/search, `formatSessionAge`, `formatSessionDuration` |
| #71 | `src/main/index.ts` | Auto-save to JSONL on `wingman-end`; `wingman-search-sessions` IPC command; `wingmanMemory` in `GlassState` |
| #72 | `src/shared/ipc.ts` + `src/renderer/useGlassState.ts` | `WingmanMemoryState` in GlassState; search results + loading flag; fallback state |
| #72 | `src/renderer/panel/WingmanPanel.tsx` | Report view now shows up to 3 past similar sessions; `PastSessionCard` component (expandable) |
| #73 | `src/test/wingmanMemory.test.ts` | 40 unit tests for all memory helpers |
| #74 | `package.json` | Added to test runner; typecheck + full suite clean |

**Memory contract:**
- Storage: `~/.iivo-glass/wingman-sessions.jsonl` (append-safe, crash-safe)
- Search: keyword match across goal + summary + keyFindings (case-insensitive)
- Privacy: on-device only, never sent to any server
- Session record format: `WingmanSessionRecord` — id, goal, startedAt, endedAt, duration, appsUsed, summary, keyFindings, notVerified, warningsIssued, nextSteps

---

### Power 2 — Terminal awareness (Tasks #75–#77)

Wingman can read terminal output (read-only, via macOS Accessibility API / osascript) when the user opts in. Errors, test failures, and build successes are auto-captured into the session as structured events.

| Task | File | What it does |
|------|------|--------------|
| #75 | `src/shared/terminalEvents.ts` | Full terminal event type system + pure parser (no Electron imports) |
| #76 | `src/shared/wingmanSession.ts` | `terminalEvents: TerminalEvent[]` + `terminalWatching: boolean` on session; `terminalEvents` in report |
| #76 | `src/shared/ipc.ts` | `wingman-terminal-toggle` GlassCommand |
| #77 | `src/main/index.ts` | `readFrontTerminalOutput()` — osascript for Terminal.app + iTerm2, null for others; `startTerminalWatching()` 10s interval; `stopTerminalWatching()`; auto-note on error event; loop detection from terminal events |

**Terminal awareness contract:**
- Opt-in only: `terminalWatching: false` by default
- Toggle: `wingman-terminal-toggle` IPC command
- Supported: Terminal.app, iTerm2 (scripting dictionary read)
- Graceful null: Ghostty, Warp, Kitty, Alacritty return null (no crash, no error)
- Poll interval: 10 seconds
- Deduplication: 60-second fingerprint window (type + first 50 chars of snippet)
- Loop detection: same error fingerprint 3× within 20 minutes → `loopWarning: true` + notice
- Privacy: last 120 lines of output, only error/success signal lines retained (not raw output), nothing sent to server
- Auto-note: each unique terminal event creates a `source: "wingman"` note in the session

**Detection patterns (15 precedence levels):**
1. TypeScript compiler errors (TS_ERROR_RE)
2. Error count summary ("N errors")
3. Jest/Vitest FAIL line
4. Jest bullet failures (● test name)
5. Node test runner failures (not ok N)
6. Mocha failures ("N failing")
7. Node runtime errors (TypeError/ReferenceError/etc. prefix)
8. Uncaught exceptions
9. Stack traces with error context
10. npm ERR!
11. Build success ("Build succeeded", "Compiled successfully", Vite built)
12. Jest pass ("Tests: N passed")
13. All tests pass ("All tests passed")
14. Mocha pass ("N passing")
15. Node test runner pass (ok N — with passing/passed context)

---

### Power 3 — Hybrid panel design (Tasks #78–#79)

WingmanPanel rebuilt from 519 lines to the full Liquid Glass + Signal hybrid design.

| Task | File | What it does |
|------|------|--------------|
| #78 | `src/renderer/panel/WingmanPanel.tsx` | Complete rebuild — arc bar, vitals, spotlight card, unified feed, terminal toggle, hybrid report view |
| #79 | `src/renderer/styles/glass.css` | +370 lines `wm-hb-*` CSS — all 3 states, arc, vitals, spotlight, feed, toggle, report |

**Design system (`wm-hb-*`):**

| Element | CSS token | Notes |
|---------|-----------|-------|
| Panel shell | `wm-hb-panel` | `border-left: 2.5px` + `border-top: 2px` in `--wm-accent` |
| Error state | `wm-hb-panel--error` | `--wm-accent: rgba(226,75,74,0.90)` |
| Healthy state | `wm-hb-panel--healthy` | `--wm-accent: rgba(123,186,58,0.90)` |
| Neutral state | `wm-hb-panel--neutral` | `--wm-accent: rgba(255,255,255,0.18)` |
| Arc bar | `wm-hb-arcrow` / `wm-hb-arcline` / `wm-hb-arcfill` | Signal-style timeline; event dots positioned proportionally |
| Arc timestamp | `wm-hb-arctime` | Time of last terminal event, right-aligned |
| Vitals row | `wm-hb-vitals` / `wm-hb-vital` | 3 columns: error count, last pass, duration |
| Spotlight | `wm-hb-spotlight` | Most recent terminal event — error (red bg tint) or healthy (green bg tint) |
| Feed | `wm-hb-feed` / `wm-hb-fi` | Unified: terminal events (red/green pip) + inspections (purple pip) + notes (gray pip) |
| Feed text | `wm-hb-ftext` | Informative: "build error: TS2345", "inspect: null check missing", "note: ..." |
| Terminal toggle | `wm-hb-toggle` / `wm-hb-pill-on` / `wm-hb-pill-off` | Bottom strip; opt-in toggle wired to `wingman-terminal-toggle` |
| Backdrop | `backdrop-filter: blur(20px) saturate(1.5)` | Liquid Glass see-through on macOS vibrancy window |

**Active panel sections (top → bottom):**
1. Arc bar — fill % based on elapsed time (60 min = full); colored dots for each event
2. Vitals — Errors / Last pass / Duration (3 glassy columns)
3. Task goal — `wm-hb-task-lbl` + `wm-hb-task-goal`
4. Loop warning (amber) — when `session.loopWarning || detectTerminalLoop(...)`
5. Spotlight card — most recent terminal event (error=red tint, healthy=green tint) or last inspection
6. Unified feed — last 5 events, chrono order, monospace labels
7. Inspect screen / End buttons
8. Add note inline row
9. Privacy label — "App titles + terminal · Screenshot only on inspect"
10. Terminal toggle strip

**Report sections:**
1. Arc bar replay (100% fill)
2. Status badge (Resolved / Unresolved) + title + meta
3. Goal
4. What happened (AI summary)
5. Terminal events (timestamped, colored pips)
6. Key findings
7. Could not verify
8. Warnings
9. Next steps
10. Similar past sessions (from cross-session memory)
11. New session button

---

### Tests (Tasks #80–#81)

| Task | File | Count |
|------|------|-------|
| #80 | `src/test/terminalEvents.test.ts` | 62 unit tests |
| #81 | `package.json` | Added to test runner |

**terminalEvents.test.ts covers:**
- `formatTerminalSnippet` — ANSI stripping, first-line extraction, truncation
- `buildEventLabel` — all 5 event type prefixes
- `buildTerminalEvent` — field presence, snippet trim, timestamp
- `terminalEventFingerprint` — consistency, type-sensitivity, char limit, whitespace normalisation
- `isDuplicateTerminalEvent` — empty list, within window, outside window, different type
- `parseTerminalOutput` — all 15 detection patterns; precedence (error beats success); dedup; source propagation; max-1-event-per-call invariant
- `isTerminalApp` — known apps, non-terminal apps, case-insensitive, empty string
- `detectTerminalLoop` — empty, fewer than 3, same error 3×, outside window, success events ignored, mixed types, different fingerprints

---

## Cumulative unit test breakdown

| Suite | Count | What it covers |
|-------|-------|----------------|
| `wingmanSession.test.ts` | 41 | Factory, snapshot dedup, deriveAppsUsed, detectLoop, detectScopeDrift, buildVerificationChecklist, buildWingmanReport, buildWingmanReportPrompt, confidence contract |
| `wingmanMemory.test.ts` | 40 | JSONL append/read, search relevance, ranking, formatSessionAge/Duration, edge cases |
| `terminalEvents.test.ts` | 62 | All 15 parse patterns, dedup, fingerprint, loop detection, isTerminalApp |
| All prior suites (v0.4.0) | 1,049 | Unchanged |
| **Total** | **1,192** | |

---

## §1–§20 contract coverage (updated)

| § | Feature | Status |
|---|---------|--------|
| 1 | Cold launch | ✅ Unit + E2E |
| 2 | First-run onboarding | ✅ Electron overlay |
| 3 | Command bar | ✅ Unit + E2E |
| 4 | Direct response | ✅ Unit + E2E |
| 5 | Pin | ✅ Unit + E2E |
| 6 | Auto-dismiss | ✅ Unit + E2E |
| 7 | Remember this | ✅ Unit + E2E |
| 8 | Council handoff | ✅ Unit + E2E |
| 9 | Listen Mode | ✅ Unit + E2E + scripts |
| 10 | Live Notes | ✅ Unit + scripts + E2E |
| 11 | Live Translate | ✅ Unit + E2E |
| 12 | Visual Ask | ✅ Unit + E2E |
| 13 | Screen context | ✅ Unit + E2E (partial) |
| 14 | Connect panel | ✅ Unit + E2E |
| 15 | Settings | ✅ Unit + E2E |
| 16 | Update check | ⚠️ Unit only (E2E skipped) |
| 17 | Quit cleanly | ✅ E2E |
| 18 | Passive Context Engine | ✅ Unit |
| 19 | Meeting Intelligence | ✅ Unit (45) + QA script |
| 20 | Wingman Mode | ✅ Unit (143) + E2E (14) + QA script |

---

## Wingman type system (v0.5.0)

```typescript
// Session
WingmanSession {
  id, goal, startedAt, endedAt?,
  appSnapshots, inspections, notes,
  loopWarning,
  terminalEvents: TerminalEvent[],   // NEW v0.5.0
  terminalWatching: boolean,          // NEW v0.5.0
}

// Terminal event (v0.5.0)
TerminalEvent {
  id: string;
  type: "build_error" | "test_failure" | "runtime_error" | "build_success" | "test_pass";
  label: string;    // "build error: null not assignable TS2345"
  snippet: string;  // raw, max 200 chars
  timestamp: number;
  source: string;   // "Terminal" | "iTerm2" | …
}

// Report (updated)
WingmanReport { …, terminalEvents?: TerminalEvent[] }

// Memory (v0.5.0)
WingmanSessionRecord { id, goal, startedAt, endedAt, duration, appsUsed, summary, keyFindings, notVerified, warningsIssued, nextSteps }
WingmanMemoryState   { searchResults: WingmanSessionRecord[], loading: boolean, totalSessions: number }
```

---

## IPC commands (full Wingman set)

| Command | Added | What it does |
|---------|-------|--------------|
| `wingman-start` | v0.4.0 | Begin session with goal |
| `wingman-end` | v0.4.0 | End session, generate report, auto-save to memory |
| `wingman-inspect` | v0.4.0 | Screenshot + AI analysis |
| `wingman-add-note` | v0.4.0 | User note into session |
| `wingman-search-sessions` | v0.5.0 | Search JSONL memory by keyword |
| `wingman-terminal-toggle` | v0.5.0 | Toggle terminal watching on/off |

---

## Known remaining gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| `wingman-inspect` E2E | Medium | Requires live screen; tested via QA script only |
| Meeting Intelligence E2E | Medium | No Playwright spec; unit + QA script only |
| Update check E2E | Low | Stubbed server required |
| Terminal awareness E2E | Medium | Needs real terminal session in Playwright |
| Git/file diff integration | Future | Task #62 — "Did the work match the goal?" |
| Agent API interception | Future | Task #63 — highest long-term value |
| True claim verification | Future | Task #64 — depends on #62, #63 |

---

## WINGMAN_BUILD_PLAN.md checklist (v0.5.0)

- [x] Wingman mode activates from the dock
- [x] User can set a task goal
- [x] App/window timeline tracks passively throughout session
- [x] Inspect Screen captures screenshot and returns task-aware response
- [x] Responses never use "verified" language
- [x] Loop detection fires when same error appears 2× (screen) or 3× (terminal) 
- [x] Scope drift warning fires when inspection mentions out-of-scope areas
- [x] Session ends with structured report including observedOnly + notVerified
- [x] Panel shows session state — not a chat window
- [x] Privacy indicator visible throughout session
- [x] Cross-session memory — sessions saved + searchable + shown in report
- [x] Terminal awareness — opt-in, read-only, error/success auto-capture
- [x] Terminal loop detection — same error 3× in 20 min → warning
- [x] Hybrid panel design — Liquid Glass + Signal arc bar + informative feed text
- [x] All unit tests passing (1,192 / 0)
- [x] Typecheck clean
- [x] BASELINE_v0.5.0.md written
