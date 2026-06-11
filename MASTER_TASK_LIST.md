# IIVO Master Task List
**All three builds — smallest to biggest. Tick off as shipped.**
Last updated: 2026-06-10 (Tasks #59–#65 + #66–#72 + #73 + #74 + #76 + #77 + Docker health check + streaming answers + Intel/x64 builds + one-click BlackHole installer completed)

Legend: `[ ]` todo · `[x]` done · `[-]` deferred (P3)

---

## 🟢 TINY — Under 30 min each

### Website
- [x] Add dedicated 404 page for unknown routes (`Glass404Page.tsx`, `"not-found"` route)
- [x] Verify iivo.ai domain links on `/install` page are live and match current Glass version (fixed stale `0.1.9` → uses `GLASS_LATEST_VERSION`)
- [x] Fix favicon 404 on all public pages (`index.html`)
- [x] Centralize download URL to `glassRelease.ts` — single version bump point
- [x] Fix duplicate `glass-landing-download` test ID (strict mode Playwright fix)
- [x] Exempt `/api/health` + `/api/landing-gate/*` from rate limiter

### Browser Extension
- [x] Audit `manifest.json` — host_permissions correct for production; removed unused `downloads` permission
- [x] Add `background.js` unit tests — `lib/backgroundLogic.js` + `tests/background.test.js` (9 tests)
- [x] Add `contentScript.js` unit tests — `lib/contentScriptLogic.js` + `tests/contentScript.test.js` (25 tests)
- [x] Review extension version (`1.1.8`) — bumped to `1.1.16` to match Glass patch cadence

### Glass
- [x] Centralize dock button label strings into `dockLabels.ts`
- [x] Add `audioRoutingConfigured` + `savedMacOutputDeviceName` to `glassSettings.ts`
- [x] Add `resolveDefaultPanelTab()` helper to `glassSettings.ts`

---

## 🟡 SMALL — 1–2 hours each

### Website
- [x] Council web app 27/27 Playwright E2E audit (all public routes)
- [x] Legal acceptance step in `OnboardingModal` (terms + privacy checkbox, localStorage)
- [x] Settings API URL editor (`apiClient.ts` + `SettingsPanel` UI)
- [x] In-app profile editor — `SettingsPanel` "Your Profile" section, load/save/sync with `data-testid` attrs
- [x] E2E test: council run flow — `council-run-flow.spec.ts` (happy path, error state, 404 page, profile editor check)
- [x] E2E test: memory vault — `memory-vault.spec.ts` (empty state, create, delete); added testids to `MemoryVault.tsx` + `SaveMemoryModal.tsx`

### Browser Extension
- [x] E2E test: popup opens on a page, captures context, send button active (`extension-popup.spec.ts`)
- [x] E2E test: "Send to IIVO" opens iivo.ai with context payload attached (`extension-popup.spec.ts`)
- [x] Test: popup shows correct state when Glass is not running (graceful degradation) (`extension-popup.spec.ts`)

### Glass
- [x] `macAudioOutput.ts` — SwitchAudioSource wrapper (read + set output device)
- [x] `startupAudioRestore.ts` — restore Mac output on every boot
- [x] Audio restore UI in `AudioTab.tsx` (save / clear / show saved device)
- [x] Update check E2E — stub newer semver → update overlay appears (§16)
- [x] Passive context E2E — N asks accumulate, `userContext` payload changes (§18)
- [x] Glass onboarding E2E — three-question flow blocks chrome, saves profile, chrome unblocks after complete
- [x] Overlay interaction regression E2E — pin / copy / remember / scroll / command-bar right-click
- [x] In-app profile editor in Glass panel — edit name / work / focus post-onboarding

---

## 🟠 MEDIUM — 2–4 hours each

### Website
- [x] Context lens E2E — screenshot upload → analysis → context attached to run
- [x] Usage credits flow E2E — estimate shown, insufficient-credit guard blocks run
- [x] Production server hardening — tighten rate limits for open beta, document `GLASS_API_SECRET` rotation story, confirm Railway deploy is stable
- [x] Docker health check — `GET /health` returns 200 in production container

### Browser Extension
- [x] Audit content script injection scope — runs on all http/https; confirm it doesn't leak data on sensitive pages (banking, passwords)
- [x] Context capture size guard — `MAX_VISIBLE_TEXT_CHARS = 12_000` tested at limit + over limit
- [x] Extension packaging + Chrome Web Store submission checklist

### Glass — Copilot modes (biggest untouched area)
- [x] Copilot **passive** mode E2E — enable passive → session runs → insights collected silently, no overlay cards shown
- [x] Copilot **coaching** mode E2E — enable coaching → trigger insight threshold → overlay card appears with action buttons → accept / dismiss / later work
- [x] Copilot **diagnostic** mode E2E — enable diagnostic → simulate stuck/error pattern → diagnostic card appears → "Summarize blocker" / "Create fix plan" work
- [x] Copilot **debrief** flow E2E — session ends → debrief auto-generates → panel shows debrief sections → "Debrief Ready" badge
- [x] Copilot session type detection E2E — `auto` detects type from context → semantic refine prompt appears → user pins type → cards change tone
- [x] `CopilotConfigure.tsx` full audit — all settings fields wired (interval, attention level, silence timeout, mute suggestions, report style)
- [x] Silence timeout warning card E2E — audio silent past threshold → warning card appears → dismiss / extend work
- [x] Listening limit reached card E2E — max minutes hit → overlay card fires → session pause/end flow

---

## 🔴 LARGE — 4+ hours each

### Website
- [x] Streaming answers — Glass currently uses single-shot ask + latency bridge; wire real token streaming end to end
- [ ] Account auth scaffold — even a simple magic-link or passkey gate before widening beyond friends-and-family beta

### Glass
- [x] `glass-visual-inspector.mjs` rewrite for Electron 42 (CDP-based launch)
- [ ] **Wingman mode — full vision build** — Wingman is Glass's ambient expert overwatch: it watches your screen in real time and proactively surfaces help without you asking. Unlike Claude Computer Use or Perplexity's computer mode (which require you to switch into them and hand over control), Wingman sits invisibly on top of everything — your code, your terminal, your browser, other AI tools — and taps you on the shoulder the moment it spots something useful. You stay in control, your screen stays full, nothing interrupts your flow.
  - **Phase 1 — Proactive screen capture tick**: currently `captureMediaContext()` only fires when you ask a question. Wingman needs a background capture cadence (configurable, e.g. every 30s or on-change detection) that runs while the mode is active. Files: `src/main/index.ts` (wingman capture loop), `src/main/screenCapture.ts`.
  - **Phase 2 — Visual error & pattern detection**: run each captured frame through a vision/OCR pass to detect errors, warnings, stack traces, failed builds, and stuck states. This is the "sees the red squiggly before you do" moment. Output feeds the diagnostic engine as visual signals alongside transcript. Files: `src/main/wingmanVisualAnalysis.ts` (new), `src/shared/copilotDiagnostic.ts` (add visual signal inputs).
  - **Phase 3 — Smart trigger rules**: not every frame needs a card. Define trigger conditions — error text appeared on screen, same state for N minutes, a known tool (Cursor, Claude, terminal) shows a known failure pattern — before surfacing an intervention. Prevents card spam. Files: `src/shared/wingmanTriggers.ts` (new).
  - **Phase 4 — Domain breadth**: Wingman should recognize context beyond coding — designer stuck on Figma export issue, founder in a spreadsheet with broken formulas, someone using Claude Computer Use and it's going off track. `copilotSessionType.ts` already classifies session type; Wingman uses that to tune what counts as a "problem worth surfacing."
  - **Phase 5 — "Watching over your AI" angle**: when Wingman detects you're inside Claude Computer Use, Cursor, or ChatGPT, it shifts to a supervisor posture — watching what the AI does on screen and flagging if it looks wrong, unexpected, or misaligned with what you were working on. This is the category-defining differentiator. No other tool does this.
  - **Privacy constraint**: all screen analysis stays local or goes through the same IIVO server path the user already trusts. Capture cadence is user-visible. User can pause Wingman instantly.
- [x] Crash telemetry — integrate Sentry into packaged Glass builds; structured crash logs from production DMG
- [x] Intel / universal builds — produce x64 + arm64 DMGs; update landing page download to universal or offer both
- [x] One-click BlackHole installer — "Set up System Audio" button in AudioTab downloads BlackHole 2ch, installs via osascript (one password prompt), creates IIVO Glass Audio Multi-Output Device
- [ ] Re-enable `electron-builder` notarize — root-cause the hang; currently using manual `notarytool` workaround
- [x] Glass onboarding multi-monitor regression — primary display / click-through / quit cleanup on HDMI multi-monitor setup (reported in wild)

---

## ⚫ DEFERRED — P3, not blocking beta

- [-] Authentication + billing (no accounts, no Stripe — credits are local simulation)
- [-] Production multi-tenant storage (run history / memory / profiles not cloud-backed)
- [-] Account-level data deletion
- [-] Live Vision toggle (documented as not implemented)
- [-] Periodic background screen capture (explicitly not built)
- [-] CI for Glass E2E (requires macOS display / xvfb)
- [-] Windows Glass (Mac-only beta is fine if communicated)
- [-] Answer streaming for council dashboard (single-shot + typewriter is current UX)

---

## Summary counts

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Tiny | 13 | 13 | 0 |
| Small | 17 | 17 | 0 |
| Medium | 16 | 14 | 2 |
| Large | 6 | 5 | 1 |
| Deferred | 8 | — | 8 |
| **Total** | **60** | **41** | **11** |
