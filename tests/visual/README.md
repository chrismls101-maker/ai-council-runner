# IIVO Visual QA (Playwright)

Headed browser tests that prove the Decision Learning loop end-to-end — UI flow **and** API persistence, run completion, and follow-up answer quality.

## Execution Mode Gate v1

Composer primary controls: **Mode** dropdown (Auto / Quick / Council), **Configure**, context **+**, **Send**. Preset, workflow override, and Auto Router details are under **Configure → Advanced routing**.

- `npm run test:execution-mode` — server resolver unit tests  
- `tests/visual/iivo-execution-mode.spec.ts` — composer layout and localStorage persistence  

During a run, a floating **QA Monitor overlay** appears in the top-right corner of the browser so you can see what the test is doing, what it is waiting for, and which checks have passed.

## QA Monitor overlay

The overlay is injected by Playwright only — it is **not** part of the production app.

| Field | Meaning |
|-------|---------|
| **Title** | `IIVO Visual QA` (or `Passed` / `Failed` at the end) |
| **Step** | Current major step (A, B, C, or D) |
| **Status** | What the test is doing right now |
| **Elapsed** | Time since the run started |
| **Warning** | Shown during live API waits (1–4 minutes is normal) |
| **Next** | Upcoming action (watch/step modes) |
| **Checks** | Pass (✓), active (●), pending (○), fail (✗) checklist |

### What each step means

| Step | What you will see |
|------|-------------------|
| **A** | Product Decision prompt → council run → route check → final answer → Track Execution |
| **B** | Fill Track Execution → save → verify exact fields via API |
| **C** | Open Decision Learning dashboard → stats → open latest decision |
| **D** | Follow-up prompt → council run → verify saved-outcome + caution language in answer |

### When waiting looks “stuck”

During Steps **A** and **D**, the overlay shows:

> Live API call in progress — waiting for IIVO response (typically 1–4 minutes).

This is normal. The test is waiting for real council agents to finish. If elapsed time exceeds ~4 minutes, check API keys and server logs.

### Pass summary

On success, the overlay turns green for ~6 seconds:

**IIVO Visual QA Passed**

- Product Decision completed
- Track Execution saved
- Decision Record verified
- Decision Learning dashboard opened
- Follow-up referenced saved outcome cautiously

### Fail summary

On failure, the overlay turns red and shows:

- Failed step
- Error message
- Suggestion (e.g. do not click Stop during backend run)

Playwright still fails normally and saves screenshots/traces.

### Stop button (do not click during QA)

| When | What Stop does |
|------|----------------|
| **Backend run in flight** | Aborts council → test **fails** (partial status) |
| **Typewriter animating** | Skips animation only → test can still pass |

**Do not click Stop during a backend run.** Use watch/step mode instead if you want to follow slowly.

## IIVO Master QA (v1)

End-to-end qualification before daily-driver testing. See **[MASTER_QA.md](./MASTER_QA.md)** for full coverage, env flags, and troubleshooting.

```bash
npm run dev          # required first
npm run qa:master    # default — deterministic, no live vision/extension
```

Optional: `qa:master:watch`, `qa:master:record`, `qa:master:vision-live`, `qa:master:extension`, `qa:master:full`.

Summary JSON: `test-results/iivo-master-qa-summary.json`.

## IIVO Daily Driver Simulation

Real-world friction scenarios (not basic "What is IIVO?" prompts). See **[DAILY_DRIVER_QA.md](./DAILY_DRIVER_QA.md)**.

```bash
npm run qa:daily          # 10-scenario default pack
npm run qa:daily:full       # extended catalog
npm run qa:daily:live       # + live vision / outcome flows
```

## Prerequisites

- Node.js and project dependencies installed (`npm install`)
- Playwright Chromium installed (`npm run qa:install`)
- API keys in `.env` for live council runs (required for full proof)

## How to run

### 1. Start IIVO

```bash
npm run dev
```

Wait until the client is at `http://localhost:5173` and the server is on `:3001`.

### 2. Standard proof run (with QA Monitor)

```bash
npm run qa:visual
```

**Do not manually interact with the browser** during a standard run.

### 3. Watch mode (recommended for first-time viewing)

```bash
npm run qa:visual:watch
```

Slower actions (~3×), console logs, overlay **Next action** hints, and element highlights before each click.

### 4. Step mode (long pauses between major steps)

```bash
npm run qa:visual:step
```

~4 second pauses between A → B → C → D with overlay updates.

### 5. Record mode (trace + video always on)

```bash
npm run qa:visual:record
```

### 6. Debug mode (Playwright inspector)

```bash
npm run qa:visual:debug
```

### 7. Open HTML report after a run

```bash
npm run qa:report
```

## Warning

**This test uses live API calls and may incur provider costs.**

**Expected duration: 5–10 minutes** for the full A→D flow (two live council runs).

Steps A and D each call the real Auto Router and council pipeline. **Step D runs a second full council** and is often the slowest step — a timeout here does not necessarily mean Decision Learning failed; the council may still be running server-side.

If the test times out:
- Read console logs for Step D diagnostics (`runStatus`, stop button, answer preview)
- Re-run with `npm run qa:visual:record` to capture trace and video
- Do not click **Stop** during backend runs (typewriter Stop only skips animation)

## What a pass proves

| Step | UI checks | API / quality checks |
|------|-----------|----------------------|
| **A** | Product Decision route, final answer, Track Execution | History run `status=complete` |
| **B** | Save Track Execution | Decision record fields match exact saved values |
| **C** | Decision Learning dashboard, open record | — |
| **D** | Follow-up answer | ≥2 saved-outcome signals + ≥1 caution signal; prior record intact |

## Failure artifacts

| Artifact | Location |
|----------|----------|
| Screenshots | `test-results/` |
| Trace (retain-on-failure) | `test-results/` |
| Video (retain-on-failure) | `test-results/` |
| HTML report | `playwright-report/` |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Test timeout at Step D | Normal on slow providers — full run needs **5–10 min**; re-run with `qa:visual:record` |
| Overlay stuck on “Waiting for council…” | Normal for 1–4 min per council; Step D may take up to **5 min** wait |
| `data-status="complete"` failed | Stop was clicked during backend run — re-run without interacting |
| Step D signals failed | Prior outcome not in answer — check decision learning injection |
| No overlay visible | Ensure you ran `qa:visual` (headed), not headless |

## Usage & Credits Visual QA

Two headed tests proving the local credit system. Run both with `npm run qa:usage`, or run each independently.

```bash
npm run qa:usage          # both tests
npm run qa:usage:live     # live charge only
npm run qa:usage:guard    # estimate/guard only (no providers)
```

Watch mode (recommended first time):

```bash
npm run qa:usage:watch
```

Record mode:

```bash
npm run qa:usage:record
```

### Test 1 — Usage live charge flow

**Uses live API calls.** May incur provider costs. Timeout: 10 minutes.

| Step | What it proves |
|------|----------------|
| Reset | Credits reset to 100 via API |
| Direct Answer | Auto Router → Direct Answer; credits 100 → 99 |
| Product Decision | Explicit workflow; credits 99 → 94 |
| Events | Usage events include 1-credit Direct Answer and 5-credit Product Decision |

If Product Decision is slow, run the second test independently — it does not depend on the live run.

### Test 2 — Usage estimate and guard flow

**Does not call live providers.** Timeout: 3 minutes.

| Step | What it proves |
|------|----------------|
| Reset | Credits reset to 100 via API |
| Deep estimate | `POST /api/usage/estimate` → 10 credits; optional UI composer hint |
| Insufficient credits | Set credits to 1; Product Decision blocked in UI; no Stop/history; server 402 |
| Reset | Credits restored to 100 |

### Usage QA warnings

- **Test 1 (live charge)** uses live API calls for Direct Answer and Product Decision.
- **Test 2 (estimate/guard)** verifies Deep estimate and credit blocking without provider calls.
- Step C in the old single test is now API-first in Test 2 — no model submission.

The QA Monitor title shows **IIVO Usage QA** during both tests.

### Test-only credit endpoint

`POST /api/usage/set-local-credits` with body `{ "credits": 1 }` is a **local/dev utility** (404 in production) used in Test 2.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run qa:visual` | Standard headed proof run with QA Monitor |
| `npm run qa:visual:watch` | **Best for watching** — slow + highlights + Next action |
| `npm run qa:visual:step` | Long pauses between major steps |
| `npm run qa:visual:record` | Trace + video always on |
| `npm run qa:visual:debug` | Playwright debug UI |
| `npm run qa:report` | Open HTML report |
| `npm run qa:usage` | Usage & Credits visual QA — both tests (headed) |
| `npm run qa:usage:live` | Usage live charge test only |
| `npm run qa:usage:guard` | Usage estimate/guard test only (no providers) |
| `npm run qa:usage:watch` | Usage QA — slow + highlights |
| `npm run qa:benchmark:record` | Benchmark Lab QA — trace + video always on |
| `npm run qa:readiness` | Public Readiness v1 — UI-only (headed) |
| `npm run qa:readiness:watch` | Public Readiness QA — slow + highlights |
| `npm run qa:readiness:record` | Public Readiness QA — trace + video always on |
| `npm run qa:context` | Context Bridge v1 — UI-only (headed) |
| `npm run qa:context:watch` | Context Bridge QA — slow + highlights |
| `npm run qa:context:record` | Context Bridge QA — trace + video always on |

## Context Bridge Visual QA

```bash
npm run qa:context
npm run qa:context:watch
npm run qa:context:record
```

| Test | What it checks |
|------|----------------|
| **A — Paste Context** | + menu → Paste Context → attach chip → remove chip |
| **B — Save Evidence** | Save as Evidence → Context Library → delete item |
| **C — Ask IIVO** | Skipped unless `CONTEXT_QA_LIVE=1` (live provider) |
| **D — Trust Copy** | Context Bridge disclosure in Trust & Privacy |

## Benchmark Lab Visual QA

```bash
npm run qa:benchmark
npm run qa:benchmark:watch
```

Uses live API calls (baseline + IIVO). Resets credits are not required but recommended before running.

## Public Readiness Visual QA

```bash
npm run qa:readiness
npm run qa:readiness:watch
npm run qa:readiness:record
```

UI-only checks — **no live AI provider calls**. Verifies:

| Test | What it checks |
|------|----------------|
| **A — Onboarding** | First-run modal appears, steps through 3 screens, Get started dismisses permanently, reload stays dismissed, Reset onboarding in Settings works |
| **B — Empty state** | IIVO hero, prompt chips, “What is IIVO?” populates composer without submit |
| **C — Trust & Settings** | Provider Disclosure, no forbidden compliance claims, Usage & Credits table and local simulation copy |
| **D — Checklist** | Public Readiness Checklist sections visible in Trust & Privacy |
