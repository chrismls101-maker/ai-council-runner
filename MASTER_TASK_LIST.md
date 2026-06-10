# IIVO Master Task List
**All three builds — smallest to biggest. Tick off as shipped.**
Last updated: 2026-06-10

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
- [ ] Review extension version (`1.1.8`) — bump to match Glass release cadence

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
- [ ] E2E test: popup opens on a page, captures context, send button active
- [ ] E2E test: "Send to IIVO" opens iivo.ai with context payload attached
- [ ] Test: popup shows correct state when Glass is not running (graceful degradation)

### Glass
- [x] `macAudioOutput.ts` — SwitchAudioSource wrapper (read + set output device)
- [x] `startupAudioRestore.ts` — restore Mac output on every boot
- [x] Audio restore UI in `AudioTab.tsx` (save / clear / show saved device)
- [x] Update check E2E — stub newer semver → update overlay appears (§16)
- [x] Passive context E2E — N asks accumulate, `userContext` payload changes (§18)
- [ ] Glass onboarding E2E — three-question flow blocks chrome, saves profile, chrome unblocks after complete
- [ ] Overlay interaction regression E2E — pin / copy / remember / scroll / command-bar right-click
- [ ] In-app profile editor in Glass panel — edit name / work / focus post-onboarding

---

## 🟠 MEDIUM — 2–4 hours each

### Website
- [ ] Context lens E2E — screenshot upload → analysis → context attached to run
- [ ] Usage credits flow E2E — estimate shown, insufficient-credit guard blocks run
- [ ] Production server hardening — tighten rate limits for open beta, document `GLASS_API_SECRET` rotation story, confirm Railway deploy is stable
- [ ] Docker health check — `GET /health` returns 200 in production container

### Browser Extension
- [ ] Audit content script injection scope — runs on all http/https; confirm it doesn't leak data on sensitive pages (banking, passwords)
- [ ] Context capture size guard — `MAX_VISIBLE_TEXT_CHARS = 12_000` tested at limit + over limit
- [ ] Extension packaging + Chrome Web Store submission checklist

### Glass — Copilot modes (biggest untouched area)
- [ ] Copilot **passive** mode E2E — enable passive → session runs → insights collected silently, no overlay cards shown
- [ ] Copilot **coaching** mode E2E — enable coaching → trigger insight threshold → overlay card appears with action buttons → accept / dismiss / later work
- [ ] Copilot **diagnostic** mode E2E — enable diagnostic → simulate stuck/error pattern → diagnostic card appears → "Summarize blocker" / "Create fix plan" work
- [ ] Copilot **debrief** flow E2E — session ends → debrief auto-generates → panel shows debrief sections → "Debrief Ready" badge
- [ ] Copilot session type detection E2E — `auto` detects type from context → semantic refine prompt appears → user pins type → cards change tone
- [ ] `CopilotConfigure.tsx` full audit — all settings fields wired (interval, attention level, silence timeout, mute suggestions, report style)
- [ ] Silence timeout warning card E2E — audio silent past threshold → warning card appears → dismiss / extend work
- [ ] Listening limit reached card E2E — max minutes hit → overlay card fires → session pause/end flow

---

## 🔴 LARGE — 4+ hours each

### Website
- [ ] Streaming answers — Glass currently uses single-shot ask + latency bridge; wire real token streaming end to end
- [ ] Account auth scaffold — even a simple magic-link or passkey gate before widening beyond friends-and-family beta

### Glass
- [x] `glass-visual-inspector.mjs` rewrite for Electron 42 (CDP-based launch)
- [ ] Crash telemetry — integrate Sentry into packaged Glass builds; structured crash logs from production DMG
- [ ] Intel / universal builds — produce x64 + arm64 DMGs; update landing page download to universal or offer both
- [ ] Re-enable `electron-builder` notarize — root-cause the hang; currently using manual `notarytool` workaround
- [ ] Glass onboarding multi-monitor regression — primary display / click-through / quit cleanup on HDMI multi-monitor setup (reported in wild)

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
| Tiny | 13 | 9 | 4 |
| Small | 17 | 9 | 8 |
| Medium | 16 | 0 | 16 |
| Large | 6 | 1 | 5 |
| Deferred | 8 | — | 8 |
| **Total** | **60** | **19** | **33** |
