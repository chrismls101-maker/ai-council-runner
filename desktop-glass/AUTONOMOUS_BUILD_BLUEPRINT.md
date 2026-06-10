# IIVO Autonomous Build System Blueprint

**Created:** June 10, 2026 | **Last updated:** June 10, 2026  
**Purpose:** Master reference for what exists, what's broken, what needs to be built, and exactly what the autonomous agent can and cannot do. Read this before running any overnight session.

> **The authoritative product roadmap lives at:** `ai-council-runner/BUILD_ROADMAP.md`  
> This blueprint covers the automation layer on top of it.

---

## TABLE OF CONTENTS

1. [Where We Are Today — All Three Builds](#1-where-we-are-today)
2. [Glass Build: Full State Audit](#2-glass-build-full-state-audit)
3. [Web App + Server: Full State Audit](#3-web-app--server-full-state-audit)
4. [Browser Extension: Full State Audit](#4-browser-extension-full-state-audit)
5. [Known Issues Right Now (Fix First)](#5-known-issues-right-now)
6. [Master Work Queue — All Three Builds](#6-master-work-queue)
7. [What the Autonomous Agent CAN Do](#7-what-the-agent-can-do)
8. [What the Agent CANNOT Do (Human Required)](#8-what-the-agent-cannot-do)
9. [Visual Testing — Can It Open and See Glass?](#9-visual-testing)
10. [Overnight Session Playbook](#10-overnight-session-playbook)
11. [Morning Review Checklist](#11-morning-review-checklist)

---

## 1. Where We Are Today

### The Three Builds — All Now Connected

| Build | Location | TypeScript | Tests | Agent Access |
|-------|----------|-----------|-------|--------------|
| **Glass (Desktop App)** | `ai-council-runner/desktop-glass/` | ❌ 12 errors | ✅ 843/843 passing | ✅ Full |
| **Web App + Server** | `ai-council-runner/` (root) | ❌ 6 errors | ✅ Server tests passing | ✅ Full |
| **Browser Extension** | `ai-council-runner/browser-extension/` | N/A (plain JS) | ❌ No tests | ✅ Full |

### What "Glass" Is

IIVO Glass is a macOS Electron desktop overlay — a floating transparent layer that sits on top of every app on your screen. It has four windows:
1. **Overlay** — full-screen transparent layer, click-through by default
2. **Command Bar** — bottom-centered floating input (the main way you talk to IIVO)
3. **Dock** — compact draggable controls
4. **Panel** — optional status and detail view (where Listen / Live Notes lives)

It connects to an IIVO server (`localhost:3001`) for AI, and uses Deepgram for speech-to-text, DeepL for translation, and GPT-5.5 for Live Notes quality.

---

## 2. Glass Build: Full State Audit

### Test Coverage
| Metric | Value |
|--------|-------|
| Total tests | 843 |
| Passing | 843 (100%) |
| Failing | 0 |
| Test files | 97 |
| Last clean run | June 10, 2026 |

### TypeScript State
| Metric | Value |
|--------|-------|
| TypeScript errors | **12 errors** (see §3 below) |
| Typecheck command | `npm run typecheck` |

### Feature Coverage (Contract §1–§18)
| # | Feature | Status |
|---|---------|--------|
| §1 | Cold launch | ✅ Unit + E2E |
| §2 | First-run onboarding | ✅ Electron overlay |
| §3 | Command bar | ✅ Unit + E2E |
| §4 | Direct response | ✅ Unit + E2E |
| §5 | Pin | ✅ Unit + E2E |
| §6 | Auto-dismiss | ✅ Unit + E2E |
| §7 | Remember this | ✅ Unit + E2E |
| §8 | Council handoff | ✅ Unit + E2E |
| §9 | Listen Mode | ✅ Unit + E2E + scripts |
| §10 | Live Notes | ⚠️ Unit + scripts — **no Playwright E2E** |
| §11 | Live Translate | ✅ Unit + E2E |
| §12 | Visual Ask | ✅ Unit + E2E |
| §13 | Screen context | ✅ Unit + E2E (partial) |
| §14 | Connect panel | ✅ Unit + E2E |
| §15 | Settings | ⚠️ Partial — **no in-app API URL / profile editor** |
| §16 | Update check | ⚠️ Unit only — **no E2E** |
| §17 | Quit cleanly | ✅ E2E |
| §18 | Passive Context Engine | ✅ Unit — **no E2E** |

### Source Size
| Area | Files |
|------|-------|
| Main process (`src/main/`) | 47 TypeScript files |
| Renderer (`src/renderer/`) | 39 TypeScript/TSX files |
| Shared (`src/shared/`) | 117 TypeScript files |
| Test files (`src/test/`) | 97 test files |
| QA scripts (`scripts/`) | 40 scripts |
| E2E specs (`tests/e2e/`) | 12 Playwright spec files |

### Playwright E2E Specs
| Spec | Coverage |
|------|----------|
| `glass-critical.spec.ts` | Cold launch, windows, handoff |
| `glass-command-bar.spec.ts` | Input, voice, submit |
| `glass-contract.spec.ts` | Pin, auto-dismiss, remember |
| `glass-copilot.spec.ts` | Copilot panel modes |
| `glass-dock.spec.ts` | Dock drag and layout |
| `glass-lens.spec.ts` | Lens capture flow |
| `glass-live.spec.ts` | Live ask + retry |
| `glass-modes.spec.ts` | Mode switching |
| `glass-multidisplay.spec.ts` | Multi-monitor layout |
| `glass-overlay-cards.spec.ts` | Response card rendering |
| `glass-panel-tabs.spec.ts` | Panel tab UX |
| `glass-translate.spec.ts` | Live Translate captions |
| **MISSING** | `glass-live-notes.spec.ts` — **§10 Live Notes has NO Playwright E2E** |

### Key QA Scripts
| Script | What it does |
|--------|-------------|
| `npm test` | 843 unit + integration tests |
| `npm run e2e` | Full Playwright E2E (needs build) |
| `npm run typecheck` | TypeScript compiler check |
| `npm run validate:clean` | Git cleanliness guard |
| `npm run qa:auto` | Automated multi-category QA |
| `npm run qa:overnight` | Long-running QA loop (quick/standard/deep/overnight modes) |
| `npm run qa:listen:preflight` | Pre-flight check for listen mode (needs server) |
| `npm run qa:founder:video:quick` | 5-minute Live Notes quality test (needs server + audio) |
| `npm run agent` | Autonomous overnight dev loop |

---

## 3. Web App + Server: Full State Audit

**Location:** `ai-council-runner/` (monorepo root)  
**Dev command:** `npm run dev` → starts server on `localhost:3001` + client on `localhost:5173`

### Test Coverage
| Metric | Value |
|--------|-------|
| Server test files | 20 (`src/server/**/*.test.ts`) |
| Playwright visual specs | 5 (`tests/visual/`) |
| Client unit tests | 3 (`src/**/*.test.ts`) |
| Last run status | ✅ Server tests passing |

### TypeScript State
| Metric | Value |
|--------|-------|
| TypeScript errors | **6 errors** — all in landing page components |
| Error type | `TS2503: Cannot find namespace 'JSX'` |
| Affected files | `AppRouter.tsx`, `GlassDocLayout.tsx`, `GlassLandingFooter.tsx`, `GlassInstallPage.tsx`, `GlassPrivacyPage.tsx`, `GlassTermsPage.tsx` |
| Root cause | Missing JSX type import configuration in these files |
| Typecheck command | `npm run typecheck` (from `ai-council-runner/` root) |

### Source Structure
| Area | Notes |
|------|-------|
| `src/` | Web app (React/TypeScript), also contains server |
| `src/server/` | Node/Express IIVO server — 20 test files |
| `src/components/` | Shared React components |
| `src/pages/` | Route pages including glass landing pages |

### Playwright Visual Specs (Web)
| Spec | Coverage |
|------|----------|
| `tests/visual/glass-landing.spec.ts` | Glass landing page renders |
| `tests/visual/glass-docs.spec.ts` | Docs layout renders |
| `tests/visual/glass-install.spec.ts` | Install page renders |
| `tests/visual/glass-privacy.spec.ts` | Privacy page |
| `tests/visual/glass-terms.spec.ts` | Terms page |

### Key QA Scripts (Web App)
| Command | What it does |
|---------|-------------|
| `npm run dev` | Start server (3001) + client (5173) |
| `npm test` | Run server tests |
| `npm run typecheck` | TypeScript check — currently 6 errors |
| `npm run e2e` | Playwright visual specs |

### What the Agent Can Do Here
- ✅ Run `npm run typecheck` → detect and fix the 6 JSX namespace errors
- ✅ Run `npm test` → run server unit tests, fix failures
- ✅ Read and edit any source file
- ✅ Write new server tests

### What the Agent Cannot Do Here
- ❌ Start the dev server for live testing (can run tests in isolation)
- ❌ Test browser rendering without the Chrome extension
- ❌ Test real authentication / billing flows (external services)

---

## 4. Browser Extension: Full State Audit

**Name:** IIVO Lens  
**Location:** `ai-council-runner/browser-extension/`  
**Version:** v1.1.8  
**Manifest:** V3  
**Language:** Plain JavaScript — NO TypeScript, NO build system, NO bundler

### File Inventory
| File | Lines | What It Does |
|------|-------|-------------|
| `popup.js` | 826 | Main extension UI logic |
| `contentScript.js` | 89 | Injected into all web pages |
| `background.js` | 12 | Service worker — handles messaging |
| `manifest.json` | ~25 | Extension manifest |
| `popup.html` | — | Extension popup shell |
| `styles/` | — | Popup CSS |
| `icons/` | — | Extension icons |

### Permissions
```
"permissions": ["activeTab", "scripting", "storage", "downloads"]
"host_permissions": ["https://iivo.ai/*"]
```

### Test Coverage
| Metric | Value |
|--------|-------|
| Unit tests | ❌ **None** |
| E2E tests | ❌ **None** |
| Build system | ❌ **None** (no compile step) |
| TypeScript | ❌ **N/A** — plain JS |

### What "Deploy" Means for This Extension
The extension is **load-unpacked** from the `browser-extension/` folder directly into Chrome. There is no build step — editing a `.js` file and reloading the extension in Chrome is the full deploy cycle.

### What the Agent Can Do Here
- ✅ Read and edit `popup.js`, `contentScript.js`, `background.js`
- ✅ Spot bugs, dead code, and inconsistencies by code review
- ✅ Add `console.log`-style debug instrumentation
- ✅ Write manual test scripts (jest, node) for pure-logic functions
- ✅ Refactor code (rename, extract functions, add comments)
- ✅ Bump version in `manifest.json`

### What the Agent Cannot Do Here
- ❌ Install or reload the extension in Chrome (requires human)
- ❌ Click the extension popup (requires human interaction)
- ❌ Test content script injection (requires a real browser tab)
- ❌ Test `storage` or `downloads` API behavior (browser-only)
- ❌ Run an automated test suite (none exists — agent can create one)

### Recommended Next Steps for Extension
1. Extract pure logic from `popup.js` into standalone functions that can be tested with Node
2. Create `browser-extension/tests/popup.test.js` using Jest or Vitest
3. Add `package.json` + `npm test` script so the agent can run tests autonomously
4. Add to the agent loop once tests exist

---

## 5. Known Issues Right Now

### TypeScript Errors (12) — Agent Can Fix These Tonight

Run `npm run typecheck` to see them live. Current errors as of June 10, 2026:

| File | Error | Type |
|------|-------|------|
| `src/main/glassLensCapture.ts:77` | `'preset' does not exist in type '{ width, height }'` | TS2353 — extra property |
| `src/main/index.ts:516` | `'commandBarStackHeightPx' does not exist on AppState` | TS2353 — missing type field |
| `src/main/index.ts:801` | `'listenLiveNotes' does not exist on AppState` | TS2339 — missing type field |
| `src/main/index.ts:1794` | `'commandBarStackHeightPx' does not exist on AppState` | TS2339 — missing type field |
| `src/main/index.ts:1806` | `'commandBarOverlayClearancePx' does not exist on AppState` | TS2339 — missing type field |
| `src/main/index.ts:1809` | `'commandBarOverlayClearancePx' does not exist on AppState` | TS2339 — same |
| `src/main/index.ts:1853` | `'commandBarStackHeightPx' does not exist on AppState` | TS2339 — same |
| `src/main/index.ts:1854` | `'commandBarOverlayClearancePx' does not exist on AppState` | TS2339 — same |
| `src/main/index.ts:3577` | `'commandBarStackHeightPx' does not exist on AppState` | TS2339 — same |
| `src/main/index.ts:3578` | `'commandBarStackHeightPx' does not exist on AppState` | TS2339 — same |
| `src/test/liveNotesUserJourney.test.ts:1074` | Comparison `"content" === "ad"` has no overlap | TS2367 — type narrowing |
| `src/test/liveNotesUserJourney.test.ts:1075` | Comparison `"content" === "sponsor"` has no overlap | TS2367 — same |

**Root cause:** `AppState` in `src/shared/types.ts` is missing several fields that `index.ts` and WIP code reference. These are likely WIP-branch fields that were cherry-picked into code but whose type declarations weren't added.

**Agent fix strategy:** Add missing fields to `AppState` in `types.ts`, or remove unused references. Check if they're needed before adding — don't just add every field blindly.

### Build State
The app has **not been rebuilt since the last set of fixes** (startup error fix, insight strip fix, Sentry fix). Before any visual QA, the app needs a fresh build:
```bash
npm run build
```

---

## 5b. Glass Contract Coverage Map

### Gaps That Need Work (in priority order)

**GAP 1: §10 Live Notes — No Playwright E2E**
- What's missing: A `tests/e2e/glass-live-notes.spec.ts` that launches Glass, opens the Listen panel, and verifies the Live Notes UI populates correctly
- What exists: 843 unit tests, journey tests, and QA scripts — but no Playwright spec
- Why it matters: The visual panel rendering can't be tested without E2E; unit tests only cover the data layer
- Agent can write the spec but needs the app built + running to validate it

**GAP 2: §16 Update Check — No E2E**
- What's missing: E2E test that stubs a newer version manifest and verifies the update overlay appears
- What exists: Unit tests in `glassAppUpdate.test.ts`
- Effort: ~0.5 days

**GAP 3: §15 Settings — No in-app API URL editor**
- What's missing: A UI inside the Glass panel to edit the IIVO server URL and user profile
- Currently: Server URL is set only via env vars; no in-app editing
- What exists: The settings persistence layer is complete; only the UI is missing
- Effort: ~1-2 days (UI work in `CopilotPanel.tsx` or new settings tab)

**GAP 4: §18 Passive Context Engine — No E2E**
- What's missing: Playwright E2E verifying that `userContext` is sent on every AI ask
- What exists: Full unit test coverage
- Effort: ~0.5 days

---

## 5c. WIP Branch

### Branch: `wip/glass-splash-dock-audio-panel`

Contains experimental features waiting to be cherry-picked into stable one at a time.

| Category | What It Contains | Merge Status |
|----------|-----------------|--------------|
| **Boot splash** | `splash.html`, splash renderer, boot WAV assets | Partially in; gated behind `IIVO_GLASS_E2E=1` |
| **Boot sound** | WAV generation scripts, `bootSound.ts` | Ready to cherry-pick |
| **Audio restore** | `macAudioOutput.ts`, `startupAudioRestore.ts`, `audioRoutingReady.ts`, live meter | Needs `glassSettings` fields added first |
| **Panel redesign** | `PermissionsPanel.tsx`, `PanelSection.tsx`, `DismissibleBanner.tsx` | Needs panel tab UX alignment |
| **Dock labels** | `dockLabels.ts`, layout icons | Ready to cherry-pick |
| **Extension loading screen** | Chrome extension HTML/CSS prototype | Not yet in stable |

### What Must Be Done Before Any WIP Category Merges
1. Fix `AppState` type fields (resolves TypeScript errors above)
2. Align `glassSettings` type with `types.ts` for audio routing fields
3. Panel tab model consistent with existing `types.ts`
4. Splash must be gated behind `IIVO_GLASS_E2E=1` env skip
5. All tests pass after cherry-pick
6. `npm run typecheck` clean after each merge

### Safe Cherry-Pick Order
```
1. Fix types.ts (AppState fields)   ← do this first — unblocks everything
2. dockLabels.ts                    ← cosmetic, low risk
3. Boot sound assets                ← additive, no regressions possible
4. Audio restore                    ← depends on #1 (settings fields)
5. Panel redesign                   ← depends on #1 + #3
6. Extension loading screen         ← separate track
```

---

## 6. Master Work Queue — All Three Builds

### 🔴 P0 — Fix Immediately (Blocking Everything)

| # | Task | Build | Agent | Effort |
|---|------|-------|-------|--------|
| P0-1 | Fix 12 TypeScript errors in Glass (`AppState` missing fields) | Glass | ✅ Auto | ~30 min |
| P0-2 | Fix 6 TypeScript errors in web app (JSX namespace) | Web App | ✅ Auto | ~15 min |
| P0-3 | Rebuild Glass after fixes (`npm run build`) | Glass | ✅ Auto | ~2 min |
| P0-4 | Run Playwright E2E to verify build health | Glass | ✅ Auto | ~5 min |
| P0-5 | Update BASELINE after clean typecheck pass | Glass | ✅ Auto | ~1 min |

### 🟠 P1 — This Week (Tonight's Agent Run)

| # | Task | Build | Agent | Effort |
|---|------|-------|-------|--------|
| P1-1 | Cherry-pick WIP: fix `types.ts` AppState fields | Glass | ✅ Auto | ~1 hr |
| P1-2 | Cherry-pick WIP: dock labels | Glass | ✅ Auto | ~30 min |
| P1-3 | Add web app `npm test` + `npm run typecheck` to agent loop | Web App | ✅ Auto | ~1 hr |
| P1-4 | Extract pure logic from `popup.js` into testable functions | Extension | ✅ Auto | ~1 hr |
| P1-5 | Create `browser-extension/tests/popup.test.js` basic suite | Extension | ✅ Auto | ~2 hrs |
| P1-6 | Add visual inspection phase to autonomous agent (`--visual` flag) | Glass | ✅ Auto | ~1 hr |
| P1-7 | Write §16 update check E2E | Glass | ✅ Auto | ~0.5 day |
| P1-8 | Write §18 passive context E2E | Glass | ✅ Auto | ~0.5 day |
| P1-9 | Council web app E2E — full browser audit (see §11 below) | Web App | ✅ Auto | ~3-4 hrs |

> **Deferred to later (logged):** `glass-live-notes.spec.ts` Playwright spec, boot sound cherry-pick — see BASELINE changelog for log dates.

### 🟡 P2 — Next Sprint

| # | Task | Build | Agent | Effort |
|---|------|-------|-------|--------|
| P2-1 | Cherry-pick WIP: audio restore + panel redesign | Glass | ⚠️ Agent + human verify | ~2 days |
| P2-2 | Cherry-pick WIP: boot sound assets | Glass | ✅ Auto | ~30 min |
| P2-3 | Write `glass-live-notes.spec.ts` (§10 Playwright gap) | Glass | ✅ Auto draft | ~1 day |
| P2-4 | Glass onboarding E2E test | Glass | ✅ Auto | ~1 day |
| P2-5 | Production server hardening + error telemetry | Web App | ⚠️ Agent + human | ~1-2 days |
| P2-6 | Add web app Playwright visual specs to agent loop | Web App | ✅ Auto | ~1 hr |
| P2-7 | Extension: `package.json` + `npm test` script | Extension | ✅ Auto | ~30 min |
| P2-8 | §15 Settings: in-app API URL editor UI | Glass | ⚠️ Agent drafts | ~1-2 days |
| P2-9 | Wire TOS + Privacy Policy into web app (`/terms`, `/privacy` routes, onboarding acceptance checkbox) | Web App | ✅ Auto | ~1 hr |

### 🟢 P3 — Future

> **P3-1 Speaker diarization** — ✅ COMPLETED June 10. Full implementation shipped: transcript-based name extraction (`speakerNameExtraction.ts`), browser title seeding, AI prompt injection, 21 tests passing.

| # | Task | Build | Agent | Effort |
|---|------|-------|-------|--------|
| P3-1 | ~~Speaker diarization~~ — ✅ Done | Glass | — | — |
| P3-2 | Voice Mode v2 — streaming tokens (words appear as spoken) | Glass | ⚠️ | ~2 days |
| P3-3 | Meetings mode — Live Notes for Zoom/Meet/Teams (see §12) | Glass | ⚠️ Large | ~3-5 days |
| P3-4 | Auth/billing integration | Web App | ❌ Human required | — |
| P3-5 | Multi-tenant storage | Web App | ⚠️ | ~2 days |
| P3-6 | Windows build | Glass | ❌ Hardware required | — |
| P3-7 | App notarization automation | Glass | ❌ Human required | — |
| P3-8 | Extension v2 — TypeScript rewrite | Extension | ⚠️ Agent + human | ~3 days |

---

## 7. What the Agent CAN Do

### ✅ Fully Autonomous (No Human Needed)

| Capability | How | Notes |
|-----------|-----|-------|
| **Run all 843 unit tests** | `npm test` | Fast, ~6s, fully offline |
| **Run TypeScript typecheck** | `npm run typecheck` | Catches type errors without building |
| **Fix TypeScript errors** | Claude Code CLI → Edit files | Agent analyzes error + context → surgical fix |
| **Fix failing unit tests** | Claude Code CLI → Edit source/test | Agent reads failure + test + source → fix |
| **Write new unit tests** | Claude Code CLI → Write new test file | Agent can draft new tests to close gaps |
| **Update BASELINE** | Edit `tests/BASELINE_v0.1.16.md` | After every clean pass |
| **Build the app** | `npm run build` | Compiles Electron app for E2E/visual testing |
| **Run Playwright E2E** | `npm run e2e` | Full UI automation of running Glass app |
| **Run QA auto** | `npm run qa:auto` | Multi-category automated QA |
| **Cherry-pick WIP** | `git cherry-pick` | Merge one WIP category, test, report |
| **Validate branch cleanliness** | `npm run validate:clean` | Guard against binary commits |
| **Write morning report** | `AGENT_REPORT.md` | Timestamped log of everything it did |
| **Detect regressions** | Compare test counts between runs | Flag if count drops |
| **Lint and format** | Per project config | Keep code consistent |

### ✅ With Computer Use (Visual Inspection)

| Capability | How | Notes |
|-----------|-----|-------|
| **Launch Glass** | `npm run glass:dev` via Bash, then screenshot | Starts the Electron app |
| **Screenshot Glass UI** | Computer use `screenshot` | See the actual floating panel |
| **Click Glass UI elements** | Computer use `left_click` | Native app = full tier (no restrictions) |
| **Verify panel renders** | Screenshot → analyze what's visible | Confirm Listen panel, Live Notes, etc. |
| **Check for visual errors** | Screenshot diff / visual inspection | Spot wrong colors, missing elements |
| **Close Glass** | `pkill -f "IIVO Glass"` or click Quit | Clean shutdown |
| **Report visual state** | Append to `AGENT_REPORT.md` | Document what was seen |

### ✅ With Server Running

| Capability | How | Notes |
|-----------|-----|-------|
| **Test AI notes pipeline** | `npm run qa:listen:preflight` | Needs `localhost:3001` |
| **Test Live Notes quality** | `npm run qa:founder:video:quick` | Needs server + audio playing |
| **Test API connectivity** | Ping `/api/health` | Check server online |

---

## 7. What the Agent CANNOT Do

### ❌ Hardware / OS Requirements (Always Human)

| Capability | Why Not | What You Do Instead |
|-----------|---------|-------------------|
| **Grant macOS Screen Recording** | Requires human click in System Settings | Do it once, stays granted |
| **Grant Microphone permission** | Same — OS-level dialog | Do it once |
| **Test real microphone input** | No physical mic in agent loop | Test manually with `npm run qa:voice:manual` |
| **Test real system audio** | No audio hardware in agent loop | Test manually after build |
| **BlackHole / Loopback setup** | Virtual audio device install requires human | One-time setup, stays in place |
| **Test actual voice transcription** | Requires live Deepgram + audio | Use `npm run stt:live` manually |

### ❌ API Keys / External Services

| Capability | Why Not | Workaround |
|-----------|---------|-----------|
| **Run server-dependent QA** | Needs `npm run dev` running separately | Start server manually, then agent can use it |
| **Test real AI notes** | Needs IIVO server + OpenAI / GPT-5.5 | Manually verify after agent builds |
| **Sign + notarize app** | Requires Apple ID keychain interaction | You run `npm run release:mac` |

### ❌ Judgment Calls (Human Decides)

| Decision | Why Human | Notes |
|---------|-----------|-------|
| **"Does this look right?"** | Subjective UI/UX quality | Agent can screenshot and describe, you judge |
| **"Is this note good?"** | AI output quality is subjective | Test manually with real content |
| **"Should we merge this WIP feature?"** | Product decision | Agent can stage it, you approve merge |
| **"Is this regression acceptable?"** | Risk/value tradeoff | Agent flags it, you decide |
| **"What should we build next?"** | Vision and strategy | That's you |

---

## 9. Visual Testing — Can It Open and See Glass?

**Yes — two methods.** The agent has full visual testing capability.

### Method 1: Playwright E2E (Best for Automated Assertions)

```bash
npm run build          # compile the Electron app first
npm run e2e            # Playwright launches Glass, controls it, asserts
npm run e2e:headed     # Same but with visible window (good for debugging)
npm run e2e:repeat     # Stress-test: run E2E N times in a row
```

**What Playwright can do with Glass:**
- Launch Glass with `launchGlassApp()` (sandboxed, no macOS permissions needed)
- Read window metadata (bounds, visibility, click-through state)
- Read app state via IPC (`readGlassState`)
- Trigger actions (open panel, switch modes, submit command bar)
- Assert the full §1–§9, §11–§14, §17 contract
- Close Glass cleanly

**What Playwright cannot do:**
- Test with real audio (needs BlackHole / virtual device)
- Test UI features that require macOS Screen Recording
- Run on headless CI without a virtual display

### Method 2: Computer Use (Best for Visual Inspection + Real Usage)

```
Agent launches Glass via Bash (npm run glass:dev)
    → Takes screenshot of desktop
    → Sees floating dock and command bar
    → Clicks "Open Panel" in dock
    → Takes screenshot of panel
    → Reads what's on screen (text, colors, layout)
    → Interacts with Listen mode card
    → Reports what it saw
    → Closes Glass (pkill)
```

**Capability tier:** Glass is a native macOS `.app` — **full tier** (no restrictions on clicking, typing, scrolling).

**Key constraint:** Computer use sees the real screen. If other apps are open, they appear too. Keep the desktop clean when the agent is doing visual inspection.

### Combined Visual QA Loop (What the Enhanced Agent Should Do)

```
1. npm run build           (compile)
2. npm run e2e             (Playwright: structural assertions)
3. npm run glass:dev &     (start Glass dev mode)
4. screenshot              (see Glass on screen)
5. click dock → Open Panel (open panel)
6. screenshot              (verify panel renders)
7. click Listen card       (enter listen mode)
8. screenshot              (verify listen mode UI)
9. pkill "Electron"        (close Glass)
10. Append visual report   (document what was seen)
```

This loop is **buildable now**. It requires upgrading `glass-autonomous-agent.mjs` with a visual inspection phase (see §6 Work Queue, P1-5).

---

## 10. Overnight Session Playbook

### Before You Sleep

**Step 1: Start the server (optional but unlocks more tests)**
```bash
# In a separate terminal at repo root:
npm run dev
# Leaves server running at localhost:3001
```

**Step 2: Open Terminal, navigate to desktop-glass, start agent**
```bash
cd /path/to/desktop-glass
caffeinate -dimsu npm run agent -- --hours 8
```

- `caffeinate -dimsu` keeps your Mac fully awake (display, disk, system, user idle)
- `--hours 8` — 8-hour budget (adjust to your sleep time)
- `--max-fixes 5` — max 5 Claude Code invocations per session (default)

**Step 3: Go to sleep. Really.**

The agent will:
1. Run `npm test` immediately
2. If failures → invoke Claude Code to fix → re-test → log result
3. If all pass → wait 5 min → repeat
4. Update BASELINE after every clean streak
5. Write `AGENT_REPORT.md` when done (or when you Ctrl+C)

### Enhanced Run (with Visual Testing — coming P2-5)

Once the visual inspection phase is built:
```bash
caffeinate -dimsu npm run agent -- --hours 8 --visual
```

This will also: build the app → launch Glass → screenshot → run E2E → close Glass → report what it saw.

### Flags Reference

| Flag | Default | Meaning |
|------|---------|---------|
| `--hours N` | 8 | Session time budget |
| `--interval N` | 5 | Minutes between idle cycles |
| `--max-fixes N` | 5 | Max Claude Code fix invocations |
| `--dry-run` | off | Skip Claude invocations (test the loop itself) |

---

## 11. Morning Review Checklist

When you wake up, read `AGENT_REPORT.md` first, then:

**Green (✅ all good):**
- 864+ tests passing
- TypeScript errors = 0
- E2E passing
- BASELINE updated

**Yellow (⚠️ needs your attention):**
- Agent hit `max-fixes` limit → some failures remain — review what it couldn't fix
- TypeScript errors reduced but not zero → look at what's left
- E2E flaky (some pass, some fail) → may be timing/environment, re-run once
- Server was offline → server-dependent tests skipped, not failed

**Red (❌ investigate):**
- Test count dropped (e.g. 840 instead of 843) → something removed a test, check diff
- Build failed → compile error introduced, need to fix before next overnight
- Agent crashed → check error in `AGENT_REPORT.md`, may need env fix

---

## 11. Council Web App E2E — Full Browser Audit (P1-6)

The agent will start the server, open a real browser via Playwright, and walk through the entire web app as a user would. This is not just "does it load" — it's a full product audit.

### What the Agent Does

**Phase 1 — Landing page**
- Navigate to `http://localhost:5173`
- Assert page loads with no console errors
- Screenshot every section (hero, features, pricing, CTA)
- Click every button and link — verify they navigate/respond correctly
- Check mobile breakpoint (resize to 390px)
- Flag anything broken, visually wrong, or confusing

**Phase 2 — Council modes**
The agent will map and test every mode in the Council UI:
- Load each mode, verify it renders correctly
- Interact with all controls (buttons, inputs, toggles, dropdowns)
- Submit test prompts and verify responses appear
- Check loading states, error states, empty states
- Screenshot each mode for visual record

**Phase 3 — Fix & improve**
- Any broken functionality → fix immediately and re-test
- Anything visually wrong (layout, spacing, alignment) → fix
- Anything confusing UX → document suggestion in `AGENT_REPORT.md`
- If agent is confident an improvement makes Council better and produces better content → implement and document
- What should stay, what should go → written recommendation in report

**Phase 4 — Document**
- Write `docs/COUNCIL_E2E_AUDIT.md` — full audit result with screenshots, pass/fail per feature, improvement log

### What Agent Needs to Know First
Before running, the agent reads `ai-council-runner/` to map:
- All routes and pages
- All API endpoints
- All UI modes and their expected behavior
- The content pipeline (how Council generates/displays content)

### Success Criteria
- All pages load without console errors
- All buttons/links do something (no dead links, no broken handlers)
- All modes functional and displaying correct content
- `COUNCIL_E2E_AUDIT.md` written with clear pass/fail + recommendations

---

## 12. Meetings Mode — What It Is (P3-3)

Meetings mode extends Live Notes from content you *watch* to calls you're *in*.

### How it differs from current Live Notes

| | Live Notes (now) | Meetings Mode (P3-3) |
|--|--|--|
| **Source** | System audio (YouTube, podcasts) | Live call (Zoom, Meet, Teams) |
| **Speakers** | Host + guest (2 people) | Multiple call participants |
| **Note types** | Key ideas, frameworks, warnings | Action items, decisions, follow-ups, owners |
| **Overlay position** | Right side panel | Small corner card — doesn't block faces |
| **Context** | None (user picks video) | Calendar integration — knows who's in the call |
| **Post-meeting** | N/A | Auto-summary emailed / saved to notes |

### What makes it bigger scope
- Need to detect "I'm in a Zoom call" vs. "I'm watching a video" — different audio sources
- Action items need owner assignment ("Chris will follow up by Friday")
- Calendar read to pre-load attendee names before the call starts
- Post-meeting summary export (Notion, email, clipboard)
- Overlay needs to be dismissable without exiting the whole app

### Earliest buildable slice
Start with just: detect Zoom/Meet window → switch Live Notes to "meeting" category set (action items, decisions) → use diarization for multi-speaker. Calendar + export comes later.

---

## Appendix A: Key Files Quick Reference

| File | What It Is |
|------|------------|
| `GLASS_CONTRACT.md` | Source of truth for all 18 Glass features |
| `GLASS_QA.md` | Manual QA checklist (requires real hardware) |
| `GLASS_LIMITATIONS.md` | What is automated vs. environment/manual only |
| `LISTEN_MODE_ARCHITECTURE.md` | Full Listen + Live Notes data flow |
| `WIP_INTEGRATION_PLAN.md` | WIP branch cherry-pick guide |
| `tests/BASELINE_v0.1.16.md` | Current test baseline + changelog |
| `scripts/glass-autonomous-agent.mjs` | Overnight agent script |
| `AGENT_REPORT.md` | Written by agent each morning |

## Appendix B: Environment Variables

| Variable | Where Set | What It Does |
|----------|-----------|--------------|
| `IIVO_GLASS_API_SECRET` | Root `.env` | Shared secret for Glass↔server auth |
| `DEEPGRAM_API_KEY` | `desktop-glass/.env` | Speech-to-text |
| `DEEPL_API_KEY` | `desktop-glass/.env` | Translation |
| `SENTRY_DSN` | Root `.env` | Error reporting (production only) |
| `IIVO_GLASS_E2E=1` | Set automatically by E2E scripts | Disables boot splash, skips onboarding |
| `IIVO_GLASS_DEV_PRIMARY=1` | Set by `npm run glass:dev` | Dev mode flag |

## Appendix C: All Three Builds — Quick Command Reference

### Glass (desktop-glass/)
```bash
npm test                     # 864 unit tests (as of June 10)
npm run typecheck            # TypeScript check (18 errors to fix: 12 Glass + 6 web app)
npm run build                # Compile Electron app
npm run e2e                  # Playwright E2E suite
npm run agent                # Overnight autonomous loop
npm run agent:visual         # Same + visual inspection
```

### Web App + Server (ai-council-runner/ root)
```bash
npm run dev                  # Start server (3001) + client (5173)
npm test                     # Server unit tests
npm run typecheck            # TypeScript check (6 errors to fix)
npm run e2e                  # Playwright visual specs
```

### Extension (browser-extension/)
```bash
# No build step — plain JS, load-unpacked into Chrome
# No tests yet — see P1-9 / P1-10 in work queue to add them
```

---

*Last updated: June 10, 2026 | Maintained by glass-autonomous-agent.mjs*
