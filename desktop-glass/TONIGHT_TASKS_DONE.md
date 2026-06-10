# IIVO Glass — Tonight's Proactive Task Queue
#
# READ BY: glass-autonomous-agent.mjs when all tests are clean
# PURPOSE: P1 proactive work beyond fix-failing-tests
# STATUS: pending (agent renames to TONIGHT_TASKS_DONE.md when complete)
#
# AGENT INSTRUCTIONS: Work through these tasks IN ORDER. After each task:
#   1. Run `npm test` to confirm nothing broke
#   2. Run `npm run typecheck` to confirm no new TS errors
#   3. Log what you did to AGENT_REPORT.md
#   4. Only proceed to the next task if tests are still green
#
# GLASS ROOT: see --add-dir argument (desktop-glass/)
# WIP BRANCH: wip/glass-splash-dock-audio-panel
# CURRENT TEST COUNT: 864 passing, 0 failing
# DO NOT drop the test count. If a task would break tests, skip it and document why.

---

## TASK 1 — Cherry-pick: Fix types.ts AppState fields

The Glass build currently has 12 TypeScript errors because `AppState` in
`src/shared/types.ts` is missing fields that were added in the WIP branch.

**What to do:**
1. Check git log / diff on branch `wip/glass-splash-dock-audio-panel` to find
   the `types.ts` changes (look for `commandBarStackHeightPx`,
   `commandBarOverlayClearancePx`, `listenLiveNotes`, and any other AppState fields)
2. Apply ONLY the `types.ts` field additions to stable — do not bring in any
   other WIP files
3. Run `npm run typecheck` — error count should drop
4. Run `npm test` — must still be 864/864

**Fallback:** If cherry-picking is risky, manually add the missing fields to
`src/shared/types.ts` based on what the typecheck errors tell you.

---

## TASK 2 — Cherry-pick: Dock labels

The WIP branch contains `dockLabels.ts` which adds labels beneath each dock icon.

**What to do:**
1. Find `dockLabels.ts` (or equivalent) in `wip/glass-splash-dock-audio-panel`
2. Cherry-pick only that file and any direct imports it needs
3. Verify it compiles: `npm run typecheck`
4. Verify tests still pass: `npm test`
5. If it requires changes to more than 3 files, skip and document why

---

## TASK 3 — Wire web app typecheck into agent loop

The agent currently only typechecks `desktop-glass/`. The web app
(`ai-council-runner/`) has 6 JSX namespace TypeScript errors that should also
be caught and fixed automatically.

**What to do:**
1. Open `scripts/glass-autonomous-agent.mjs`
2. Add a second `runTypecheck()` call that runs from `ai-council-runner/` root
   (same pattern as the existing one — `spawnSync("npm", ["run", "typecheck"], { cwd: WEB_ROOT })`)
3. Define `WEB_ROOT` as `path.resolve(GLASS_ROOT, "..")` near the top
4. Add the web app TS errors to the Claude fix prompt when present
5. Run `npm test` in desktop-glass to confirm agent script still parses OK

---

## TASK 4 — Fix web app TypeScript errors (JSX namespace)

Now that the agent can see web app TS errors, fix them.

**What to do:**
1. `cd ~/Desktop/ai-council-runner && npm run typecheck` — note all 6 errors
2. They are likely JSX namespace errors in landing page components
   (missing `React` import or incorrect JSX config)
3. Fix each file — common fixes:
   - Add `import React from 'react'` if missing
   - Or add `/// <reference types="react/jsx-runtime" />` at top of file
   - Or check `tsconfig.json` for `"jsx": "react-jsx"` — if set, imports are not needed
4. Verify: `npm run typecheck` shows 0 errors in web app
5. Run desktop-glass tests: `npm test` — still 864/864

---

## TASK 5 — Extract popup.js logic into testable functions

`browser-extension/popup.js` is 826 lines of plain JS with no tests.
Mix of UI event handlers and pure logic that can be tested.

**What to do:**
1. Read `browser-extension/popup.js` fully
2. Identify pure logic functions (data transformations, state calculations,
   message formatting — anything that doesn't touch the DOM directly)
3. Extract those functions into `browser-extension/lib/popupLogic.js`
   — keep them as plain JS (no TypeScript, no build step needed)
   — export with `module.exports = { ... }` for Node test compatibility
4. In `popup.js`, import them: `const { fn } = require('./lib/popupLogic')`
   — OR if popup.js uses browser globals, just duplicate the extracted
   functions in the lib file (copy, don't break the original)
5. Verify the extension still loads in Chrome (no syntax errors in popup.js)

---

## TASK 6 — Create browser-extension/tests/popup.test.js

Write the first test suite for the extension logic.

**What to do:**
1. Create `browser-extension/tests/popup.test.js`
2. Use Node's built-in `node:test` module (same as desktop-glass tests)
3. Import from `../lib/popupLogic.js`
4. Write at minimum 10 tests covering:
   - All pure logic functions extracted in Task 5
   - Edge cases (empty input, null, malformed data)
   - Any state calculation logic
5. Create `browser-extension/package.json`:
   ```json
   {
     "name": "iivo-lens",
     "version": "1.1.8",
     "scripts": {
       "test": "node --test tests/popup.test.js"
     }
   }
   ```
6. Verify: `cd browser-extension && npm test` — all tests pass
7. Add to AGENT_REPORT: "Extension test suite created — N tests passing"

---

## TASK 7 — Add visual inspection phase to agent

The agent has `--visual` flag support but `glass-visual-inspector.mjs` doesn't
exist yet. Create it.

**What to do:**
1. Create `scripts/glass-visual-inspector.mjs`
2. It should export `runVisualInspection({ headed, noConnect })` async function
3. The function should:
   - Launch Glass with `npm run glass:dev` (background process)
   - Wait 3 seconds for startup
   - Take a screenshot using computer-use / Playwright
   - Check for: dock visible, command bar visible, no error banners
   - Click "Open Panel" if visible
   - Screenshot the panel
   - Check for: Listen card present, mode cards visible
   - Kill Glass process
   - Return `{ passed: boolean, results: { passed: [], failed: [] }, report: string }`
4. Use Playwright's Electron launcher (it's already in devDependencies)
5. Test it manually: `node scripts/glass-visual-inspector.mjs`
6. Add to AGENT_REPORT: "Visual inspector created"

---

## TASK 8 — Write §16 Update Check E2E

`GLASS_CONTRACT.md` §16 requires: app checks for updates on launch,
shows notification when update available, links to download.

**What to do:**
1. Read `GLASS_CONTRACT.md` §16 for full spec
2. Read existing E2E test files for pattern (`src/test/glassAppUpdate.test.ts`)
3. Write `src/test/glassUpdateCheck.e2e.test.ts` (or add to existing file)
4. Tests should cover:
   - Update check fires on launch
   - When server returns newer version: notification shown
   - When server returns same version: no notification
   - Notification links to correct download URL
5. Add new test file to `package.json` test script
6. Run `npm test` — new tests should pass

---

## TASK 9 — Write §18 Passive Context E2E

`GLASS_CONTRACT.md` §18 requires: Glass passively observes screen context
without user prompt, surfaces relevant suggestions.

**What to do:**
1. Read `GLASS_CONTRACT.md` §18 for full spec
2. Write `src/test/glassPassiveContext.e2e.test.ts`
3. Tests should cover:
   - Passive mode activates when no user interaction for N seconds
   - Context is built from screen state
   - Suggestions surface in the panel
   - Passive mode deactivates when user interacts
4. Add to `package.json` test script
5. Run `npm test` — new tests should pass

---

## TASK 10 — Council web app E2E audit

Start the web server and run a full browser audit of every page and mode.

**What to do:**
1. Verify `http://localhost:3001` is responding (server must be running —
   if not, skip this task and note "server not running" in report)
2. Read `ai-council-runner/` to map all routes, pages, and API endpoints
3. Write `ai-council-runner/tests/e2e/council-full-audit.spec.ts` using Playwright
4. The spec must test:
   - Landing page loads, no console errors
   - Every navigation link works
   - Every button/CTA has a handler (no dead links)
   - All Council modes load and render content
   - API health endpoint responds
   - Mobile viewport (390px) renders without broken layout
5. Run the spec: `npx playwright test tests/e2e/council-full-audit.spec.ts`
6. For any FAILURES: fix the issue if it's clearly a bug (broken import,
   wrong route, missing handler). If it's a design/product decision, document
   it in AGENT_REPORT under "Suggestions for Chris to review"
7. Write `ai-council-runner/docs/COUNCIL_E2E_AUDIT.md` with:
   - Pass/fail for each page and feature
   - Screenshot paths for each page
   - List of bugs fixed
   - List of suggestions (what should stay, what should go)
   - Any improvements made that clearly make content better

---

## DONE

When all tasks are complete (or skipped with documented reason):
1. Append a summary to AGENT_REPORT.md
2. Update BASELINE_v0.1.16.md changelog with completed tasks
3. This file will be renamed to TONIGHT_TASKS_DONE.md automatically
