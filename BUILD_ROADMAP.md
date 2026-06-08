# IIVO Build Roadmap

Single source of truth for what exists and what’s next. Open this at the start of every session, pick the top **TODO** item, ship it, move it to **COMPLETE**.

Last updated: 2026-06-08

---

## COMPLETE

### IIVO Glass (Electron desktop) — core product

- **Overlay shell** — full-screen click-through overlay, dock, command bar, side panel, notes pad; multi-display layout (`glassLayoutManager`, follow-mouse / primary / per-display).
- **Boot splash** — cinematic load sequence before chrome appears.
- **First-run onboarding** — three-question calibration in Electron (`GlassOnboardingOverlay`, `glass-onboarding.json`); blocks dock/command bar until done or skipped.
- **Command bar** — text ask, voice mode, listen controls, live translate toggle, chrome lock/drag, screen-context line.
- **Direct ask pipeline** — `POST /api/glass/ask` with overlay response cards (thinking → answer), 17s auto-dismiss, pin, copy, Open in IIVO, Save Moment.
- **Visual ask** — screen capture preflight, optimized payload, 413 retry, retention status.
- **Listen Mode + Session Copilot** — long-running listen, copilot loop, debrief, session events/insights, listen countdown.
- **Live Translate** — captions overlay + panel setup; server translate route.
- **Live Notes** — notes pad UI + listen-driven notes (unit/script coverage; no dedicated E2E).
- **Remember this** — saves to IIVO memory vault via main-process IPC (`/api/memory`).
- **Council / Context Bridge handoff** — opens web dashboard with run/context IDs.
- **Connect panel** — server health, STT, capture, permissions grid, setup check, virtual audio guidance.
- **Passive Context Engine** — `glassContextEngine.ts` + `glassContextStore.ts`; rolling 50-interaction log, derived `userContext` on every ask, onboarding seed for first 10 asks (§18).
- **Passive context wiring** — attached on ask payload; server prepends to prompt (`buildGlassDirectUserPrompt` / visual ask).
- **Glass notifications** — bottom-center feed cards, hover-to-interact pointer policy, command-bar clearance math.
- **App update check** — manifest fetch, setup panel + update overlay (unit tests; E2E disabled).
- **Settings persistence** — hotkey, display target, copilot config, chrome layout → `userData`.
- **macOS packaging** — `electron-builder` unsigned dev builds + signed release config (`electron-builder.signed.yml`, Developer ID signing works).
- **Notarized + stapled Glass DMG** — Done 2026-06-08 — arm64 DMG signed, notarized, stapled, uploaded to GitHub v0.1.8 release.
- **Behavioral contract** — `desktop-glass/GLASS_CONTRACT.md` §1–§18 with test map.
- **Automated tests (Glass)** — ~110 unit test files; E2E suites: `glass-critical`, `glass-contract`, `glass-live`, `glass-modes`, `glass-copilot`, `glass-translate`, `glass-multidisplay`.

### IIVO server + web (Council dashboard)

- **Express API** — council runs, router, presets, follow-up, execution modes, benchmarks.
- **Glass API routes** — `/api/glass/ask`, `/api/glass/translate`, `/api/transcribe-audio`, `/api/glass/update`; `GLASS_API_SECRET` bearer auth middleware.
- **Memory vault** — save/search/export/delete; memory toggle in Settings.
- **Context Lens** — screenshot analysis, lens handoff, context library.
- **User profile types** — server-side format for Glass calibration block (legacy `userProfile` body).
- **Usage credits UI** — estimates, insufficient-credit guard, local simulation (not real billing).
- **Public readiness checklist** — manual beta-readiness tracker in dashboard.
- **Landing page** — `/` Glass marketing page with Mac download CTA (`GlassLandingPage`).
- **Landing password gate** — optional `LANDING_PASSWORD` private preview.
- **App router** — `/` landing vs `/dashboard` council workspace.
- **Docker + deploy** — `Dockerfile`, `scripts/deploy-server.mjs`, Railway-oriented config.
- **Visual QA suite** — broad Playwright coverage (daily driver, lens, context bridge, public readiness, etc.).
- **Browser extension** — IIVO Lens (Chrome); Context Bridge to local IIVO (dev-oriented README).

### Docs & ops

- `GLASS_QA.md`, `GLASS_LIMITATIONS.md`, `GLASS_CONTRACT.md`, `LISTEN_MODE_ARCHITECTURE.md`.
- Signed-build + manual `notarytool` documented in `GLASS_QA.md` §7.
- GitHub release DMG URL wired on landing page (v0.1.8 arm64).
- **Beta install runbook** — `BETA_INSTALL.md` + `/install` page linked from landing footer.
- **Privacy + Terms pages** — `/privacy` and `/terms` on glass landing; footer links on `/`, `/install`, `/privacy`, `/terms`.

---

## IN PROGRESS / TODO

Priority order for a **solo founder → first beta users**. Honest gaps only.

### P0 — Beta blockers (do these first)

1. **Verify onboarding fixes on real hardware** — Recent fixes (primary display, click-through, quit cleanup) need a full dev-cycle pass on multi-monitor HDMI setup; wrong-monitor / frozen-overlay bug was reported in the wild.
2. **Terms of Service + Privacy Policy** — `/terms` and `/privacy` pages live; confirm copy + footer links on deployed iivo.ai before widening beta.
3. **Production server hardening for beta** — Rate limits, stable `iivo.ai` deploy, `GLASS_API_SECRET` rotation story; today is workable for friends-and-family, not hardened for open beta.

### P1 — Trust & regression (before widening beta)

4. **Glass onboarding E2E** — Three-question flow in Electron is implemented but **skipped** when `IIVO_GLASS_E2E=1`; no automated proof that onboarding blocks chrome and saves profile.
5. **Overlay interaction regression suite** — Pin / Copy / Remember / scroll / command-bar right-click broke in production; unit/policy tests exist but no E2E locking the fix.
6. **Live Notes E2E** — Contract §10: listen → notes pad sections populate (**UNCOVERED**).
7. **Update-check E2E** — Contract §16: stub newer semver → update overlay appears (**UNCOVERED**).
8. **Crash / error telemetry for Glass** — No Sentry or structured crash logs from packaged builds; debugging beta reports will be blind.

### P2 — Beta UX gaps (acceptable to ship late beta without, but users will ask)

9. **In-app API URL editor** — Glass panel still depends on env vars for server URL (§15 **UNCOVERED**).
10. **In-app profile editor** — Onboarding captures once; no way to edit name/work/focus inside Glass after skip/complete.
11. **Passive context E2E** — Engine wired + unit tested; no test that N asks change `userContext` payload shape over time.
12. **Intel Mac + universal builds** — Landing and packaging default to **arm64 only**; no x64/universal DMG for beta.
13. **Windows Glass** — Not started; Mac-only beta is fine if communicated clearly.

### P3 — Post-first-beta (explicitly not blocking)

14. **Authentication + billing** — No accounts, no Stripe; credits are local simulation (`UsageCreditsPanel` copy says so). Readiness checklist: **later**.
15. **Production multi-tenant storage** — Run history, memory, profiles use local JSON / browser storage patterns; not cloud-backed accounts.
16. **Account-level data deletion** — Export/delete history exists; no auth-scoped account wipe.
17. **Answer token streaming** — Glass uses single-shot ask + latency UX bridge (`GLASS_LIMITATIONS.md` Option B); streaming deferred.
18. **Live Vision toggle** — Documented as not implemented (`GLASS_QA.md`).
19. **Periodic background screen capture** — Explicitly not built (`SCREENSHOT_RETENTION.md`).
20. **CI for Glass E2E** — Requires macOS display / xvfb; not running on default GitHub Actions path.
21. **Re-enable `electron-builder` notarize** — Blocked on hang; manual notarization is the workaround until root-caused.

---

### How to use this file

| Action | Rule |
|--------|------|
| Starting work | Pick the **lowest-numbered open TODO** unless something is actively on fire. |
| Finishing work | Move the item (or sub-bullet) to **COMPLETE** with a one-line note if helpful. |
| Adding scope | New work goes at the appropriate priority band with a honest gap statement — no wish-list fluff. |
| Deep detail | Glass behavior → `desktop-glass/GLASS_CONTRACT.md`. Manual QA → `desktop-glass/GLASS_QA.md`. Web beta checklist → `src/constants/publicReadinessChecklist.ts`. |
