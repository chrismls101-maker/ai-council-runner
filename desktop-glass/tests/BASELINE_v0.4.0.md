# IIVO Glass — Baseline v0.4.0

**Date:** 2026-06-11  
**Branch:** main  
**Typecheck:** ✅ clean  
**Tests:** 1,089 passing / 0 failing  
**New since v0.3.0:** +41 tests (Wingman unit suite)

---

## Health snapshot

| Metric | Value |
|--------|-------|
| Total tests | **1,089** |
| Passing | **1,089** |
| Failing | **0** |
| TypeScript errors | **0** |
| Test suites | 40 (39 shown in runner + wingmanSession) |

---

## What shipped in v0.4.0 — Wingman Mode (Tasks #43–#60)

### Core engine (Tasks #43–#51)

| Task | File | What it does |
|------|------|--------------|
| #43 | `src/shared/wingmanSession.ts` | Full type system + all business logic |
| #44 | `src/shared/ipc.ts` | 4 IPC commands + `WingmanState` in `GlassState` |
| #45 | `src/renderer/useGlassState.ts` | `wingman: DEFAULT_WINGMAN_STATE` in fallback |
| #46 | `src/main/index.ts` | `wingman-start` + 30s passive app snapshot accumulator |
| #47 | `src/main/index.ts` | `wingman-inspect` — task-aware visual ask with session context |
| #48 | `src/main/index.ts` | `wingman-add-note` + loop detection |
| #49 | `src/main/index.ts` | `wingman-end` + async AI report generation |
| #50 | `src/shared/wingmanSession.ts` | `buildWingmanReportPrompt` + `buildVerificationChecklist` |
| #51 | `src/shared/wingmanSession.ts` | `detectScopeDrift` — 4 rule-pairs |

### Mode consolidation (Task #52)

Work mode removed from all user-facing surfaces. Changes:

| File | Change |
|------|--------|
| `src/shared/glassModePresets.ts` | `GlassModeId` → 4 values (no "work"); `GLASS_MODE_ORDER` = `["listen", "meetings", "wingman"]`; `work` preset removed; `wingman` preset expanded to cover work use cases; `deriveActiveMode` returns "wingman" for general_workflow; `modePrimaryActionLabel` updated |
| `src/renderer/dock/Dock.tsx` | `MODE_COLORS` record — "work" entry removed |
| `src/renderer/panel/CopilotPanel.tsx` | `activeMode` derivation: `return "wingman"` instead of `"work"` |
| `src/shared/activeListeningContext.ts` | `deriveActiveListeningMode`: `return "wingman"` |
| `src/test/glassModePresets.test.ts` | Fully rewritten for 3-mode grid |
| `src/test/liveTranslate.test.ts` | `GLASS_MODE_ORDER` assertion updated |
| `src/test/activeListening.test.ts` | Work preset test → Wingman preset test |
| `tests/e2e/glass-modes.spec.ts` | "Work activates" → "Wingman activates"; "four mode cards" → "three mode cards" |

### UI (Tasks #53–#54)

| Task | File | What it does |
|------|------|--------------|
| #53 | `src/renderer/panel/WingmanPanel.tsx` | 3-state panel: inactive / active session / report |
| #54 | `src/renderer/panel/CopilotPanel.tsx` | `WingmanPanel` import + conditional render when `activeMode === "wingman"` |
| #54 | `src/renderer/styles/glass.css` | ~280 lines of Wingman CSS (all 3 states + buttons + report) |

### Tests and QA (Tasks #55–#60)

| Task | File | Count |
|------|------|-------|
| #55 | `src/test/wingmanSession.test.ts` | 41 unit tests |
| #56 | `package.json` | Added to test runner |
| #57 | `tests/e2e/glass-wingman.spec.ts` | 14 E2E tests |
| #58 | `scripts/glass-qa-wingman.mjs` | QA script (lifecycle + language contract) |
| #59 | `GLASS_CONTRACT.md` | §20 added; coverage table updated; E2E index updated |
| #60 | `tests/BASELINE_v0.4.0.md` | This file |

---

## §1–§20 contract coverage

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
| 20 | Wingman Mode | ✅ Unit (41) + E2E (14) + QA script |

---

## Five-mode system status

| Mode | Status | Audio | Session |
|------|--------|-------|---------|
| Listen | ✅ Fully tested | System audio | ✅ |
| Meetings | ✅ Fully tested | Mic or system | ✅ |
| ~~Work~~ | ❌ Removed (absorbed into Wingman) | — | — |
| Wingman | ✅ Fully tested | None | ✅ |
| Translate | ✅ Fully tested | System or mic | ✅ |
| Voice | ✅ Fully tested | Mic | No session |

---

## Wingman type system

```typescript
WingmanState  { active, session, inspecting, report }
WingmanSession { id, goal, startedAt, endedAt?, appSnapshots, inspections, notes, loopWarning }
WingmanInspection { id, triggeredBy, timestamp, screenshotRef, prompt?, response, type, confidence, scopeDriftWarning? }
// confidence: "observed" | "inferred"  — NEVER "verified"
WingmanNote   { id, timestamp, content, source }
WingmanReport { goal, duration, appsUsed, summary, keyFindings, warningsIssued, observedOnly, notVerified, nextSteps }
```

---

## Unit test breakdown (v0.4.0)

| Suite | Count | What it covers |
|-------|-------|----------------|
| wingmanSession.test.ts | 41 | Factory, snapshot dedup, deriveAppsUsed, detectLoop (5 cases), detectScopeDrift (6 cases), buildVerificationChecklist (5 cases), buildWingmanReport (7 cases), buildWingmanReportPrompt (4 cases), confidence type contract |
| glassModePresets.test.ts | ~11 | Updated for 3-mode grid (Work removed, Wingman covers both) |
| activeListening.test.ts | updated | Work → Wingman preset assertion |
| liveTranslate.test.ts | updated | GLASS_MODE_ORDER assertion |
| All prior suites | 1,048 | Unchanged from v0.3.0 baseline |

**Total: 1,089 / 0**

---

## E2E spec inventory

| Spec | Tests | Key scenarios |
|------|-------|---------------|
| `glass-wingman.spec.ts` | 14 | Mode card visible, Work absent, default state, IPC lifecycle, active/inactive/report panel states, add note UI + IPC, no audio, report generation, end no-op |
| `glass-modes.spec.ts` | updated | "Three mode cards" (not four); Work card absent; Wingman activates with diagnostic mode |

---

## Known remaining gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| `wingman-inspect` E2E coverage | Medium | Requires live screen capture; tested via QA script only |
| Meeting Intelligence E2E | Medium | No Playwright spec yet; unit + QA script only |
| Update check E2E | Low | Stubbed server required |
| Wingman cross-session memory | Future | Task #61 — after V1 ships |
| Wingman git diff integration | Future | Task #62 |
| Agent API interception | Future | Task #63 — highest long-term value |
| True claim verification | Future | Task #64 — depends on #62, #63 |

---

## WINGMAN_BUILD_PLAN.md checklist status

- [x] Wingman mode activates from the dock
- [x] User can set a task goal
- [x] App/window timeline tracks passively throughout session
- [x] Inspect Screen captures screenshot and returns task-aware response
- [x] Responses never use "verified" language
- [x] Loop detection fires when same error appears twice
- [x] Scope drift warning fires when inspection mentions out-of-scope areas
- [x] Session ends with structured report including observedOnly + notVerified
- [x] Panel shows session state — not a chat window
- [x] Privacy indicator visible throughout session
- [x] Work mode removed from user-facing UI
- [x] All unit tests passing
- [x] Playwright E2E spec passing
- [x] Typecheck clean
- [x] GLASS_CONTRACT.md §20 written
- [x] BASELINE_v0.4.0.md written
