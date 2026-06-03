# IIVO Master QA Runner v1

Single end-to-end qualification flow before daily-driver testing. Orchestrates environment checks, assistant parity, Context Bridge, Lens handoff, screenshot evidence, usage/credits, Decision Learning API, Benchmark Lab UI, Public Readiness, and Vision Memory Guard.

## Prerequisites

1. Install dependencies: `npm install`
2. Install Playwright Chromium: `npm run qa:install`
3. Start IIVO: `npm run dev` (client `http://localhost:5173`, API `http://localhost:3001`)
4. API keys in `.env` for **live** assistant runs (Direct Answer prompts in default master QA)

## Commands

| Command | What it runs |
|---------|----------------|
| `npm run qa:master` | Default master QA — deterministic, no live OpenAI vision, no extension automation |
| `npm run qa:master:watch` | Same as master, with `QA_VISUAL_WATCH=1` (slower, QA monitor pauses) |
| `npm run qa:master:record` | Same with trace/video on failure (`QA_VISUAL_RECORD=1`) |
| `npm run qa:master:vision-live` | Live vision screenshot analysis only (`VISION_QA_LIVE=1`) |
| `npm run qa:master:extension` | Chrome extension popup shell in persistent Chromium context |
| `npm run qa:master:full` | Master QA with `MASTER_QA_FULL=1` (notes for full Decision Learning UI) |
| `npm run qa:master:benchmark-live` | Full benchmark lab live run (`BENCHMARK_QA_LIVE=1` via benchmark spec) |

## What default `qa:master` covers

| Section | Checks |
|---------|--------|
| **A. Environment** | App `:5173`, API `:3001`, vision config, usage, context, benchmark/decisions APIs |
| **B. Basic Assistant** | 3 Direct Answer prompts (IIVO intro, rewrite, summary) — no council bleed |
| **C. Context Bridge** | Paste/attach chip, ephemeral vs library, evidence save, memory contamination guard |
| **D. Lens Handoff** | API fixture `lensContextId` / `lensAsk`, invalid ID banners, Lens badge in library |
| **E. Screenshot Evidence** | API screenshot fixture, thumbnail, `lensAsk` composer prompt |
| **F. Vision Live** | **Skipped** unless `VISION_QA_LIVE=1` |
| **G. Vision Memory Guard** | Server unit test (no live OpenAI) |
| **H. Usage Credits** | Reset, estimate=1, API 402 + `run_blocked_insufficient_credits`, no new runs, credits restored (UI banner preferred but not required in Master QA) |
| **I. Decision Learning** | API stats endpoint (full UI deferred to `qa:visual`) |
| **J. Benchmark** | Benchmark Lab loads, Simple IIVO prompt selectable (no live run) |
| **K. Public Readiness** | Hero, prompt chips, trust copy, usage/readiness panels |

## What default `qa:master` does **not** cover

- Live OpenAI vision analysis (use `qa:master:vision-live`)
- Real Chrome extension capture/handoff (use `qa:master:extension` — shell UI only)
- Full council Product Decision + Track Execution UI loop (use `qa:visual` / `MASTER_QA_FULL` notes)
- Live benchmark scoring run (use `qa:master:benchmark-live` or `qa:benchmark`)
- Live Context Bridge trace with provider (`CONTEXT_QA_LIVE=1` on `qa:context`)

## Vision live (`qa:master:vision-live`)

Sets `VISION_QA_LIVE=1`. Requires:

- `IMAGE_VISION_ENABLED=true` in `.env`
- Vision provider configured (`/api/config/vision` → `configured: true`)
- Restart `npm run dev` after `.env` changes

Asserts Direct Answer route, final answer, trace “Screenshot analyzed visually: yes”, and credits updated.

If vision is disabled, default master QA **skips** Vision Live with message:  
`Vision live test skipped — IMAGE_VISION_ENABLED is false.`

## Extension test (`qa:master:extension`)

Loads unpacked `browser-extension/` via Playwright persistent Chromium:

- `--disable-extensions-except` / `--load-extension`
- Opens `chrome-extension://<id>/popup.html`
- Verifies `iivo-lens-popup`, header, IIVO branding

Capture APIs may not run from direct popup URL — automated test is **extension shell verified**. Full capture/handoff remains manual QA from the toolbar.

## Summary report

After each run:

- **Terminal:** `IIVO Master QA Result` block with PASS/FAIL/SKIPPED per section and verdict
- **JSON:** `test-results/iivo-master-qa-summary.json` (timestamp, sections, credits, no secrets)

Verdicts:

- `READY FOR DAILY DRIVER TESTING` — no failed sections
- `NOT READY — fix listed failures` — one or more sections failed

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Playwright browser missing | `npx playwright install chromium` or `npm run qa:install` |
| `Start IIVO first with npm run dev.` | Run `npm run dev` in another terminal |
| Vision disabled / skipped | Expected for default master; enable `.env` for `qa:master:vision-live` |
| Extension ID not detected | Run headed; check `chrome://extensions`; manual popup QA |
| OpenAI fetch failed | Check API keys, rate limits, server logs |
| Stale dev server after `.env` change | Stop and restart `npm run dev` |
| Vision Memory Guard fails | Run `npm run build` or ensure server `dist/` is current |

## Related QA scripts

Existing scripts are unchanged:

- `npm run qa:lens` — Lens handoff, hardening, screenshot specs
- `npm run qa:context` — Context Bridge v1 suite
- `npm run qa:visual` — Decision Learning full proof
- `npm run test:lens` — Server lens/vision unit tests
