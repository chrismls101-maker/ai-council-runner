# IIVO Glass Test Baseline — v0.1.9

**Audited:** 2026-06-08 (756/756 baseline refresh)  
**Contract:** `desktop-glass/GLASS_CONTRACT.md` (§1–§18)  
**App version:** `0.1.9` (`desktop-glass/package.json`)

This file is the starting point for knowing what is tested, what is legacy, and what is uncovered before running anything against production.

---

## Executive summary

| Layer | Suites | Last run status | Notes |
|-------|--------|---------------|-------|
| **Unit** (`npm test` in `desktop-glass`) | 101 files, 756 tests | **756 pass / 0 fail** | 1 file omitted from script (see below) |
| **Unit (omitted)** | 1 file | **Infra-blocked** | `glassServerHealth.test.ts` cannot load in plain `node:test` |
| **E2E Electron** (`tests/e2e/glass-*.spec.ts`) | 8 files, ~48 tests | **Not run in this audit** | Gated by display/GUI; skip when `getElectronE2eSkipReason()` |
| **E2E live** (`glass-live.spec.ts`) | 1 file, 3 tests | **Not run** | Requires `IIVO_GLASS_LIVE_E2E=1` + live server |
| **Web visual** (`tests/visual/iivo-glass-*.spec.ts`) | 2 files | **Not run** | Landing = valid; onboarding = `@legacy` (skipped) |
| **Server** (`tests/server/glass*.test.ts`) | 4 files | **Not run in this audit** | Glass API server-side contracts |

### Omitted from `npm test` (add before CI hardening)

| File | Status | Contract |
|------|--------|----------|
| `glassServerHealth.test.ts` | ⛔ **Infra-blocked** — import pulls `electron`, suite won't load in plain `node:test` | §14 |

**Recently added to `npm test` (2026-06-08):** `glassAppUpdate.test.ts` (§16), `glassContextEngine.test.ts` + `glassContextStore.test.ts` (§18), `glassNotifications.test.ts` (§6), `iivoMemoryClient.test.ts` (§7).

**Removed (pre-v0.1.9 legacy, deleted):** `listenMomentMaturity.test.ts`, `listenSegmentClassifier.test.ts`.

---

## Legacy / outdated tests (marked, not deleted)

| Location | Why `@legacy` |
|----------|----------------|
| `tests/visual/iivo-glass-onboarding.spec.ts` | Web dashboard onboarding removed; flow lives in Electron (`GlassOnboardingOverlay`, §2). Entire suite `test.skip`. |
| `glassAppUpdate.test.ts` → `"resolves darwin download targets"` | Still valid for dev/DMG fallback helpers; packaged Mac uses Squirrel zip via `glassAutoUpdater.ts` (§16 behavior changed). |

---

## Contract coverage (§1–§18)

### §1 Cold launch

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/bootSplash.test.ts` | ✅ | ✅ | Splash bundle detection |
| `src/test/glassAppIdentity.test.ts` | ✅ | ✅ | Dev vs packaged identity |
| `src/test/glassE2eSmoke.test.ts` | ✅ | ✅ | Layout + direct-ask guard smoke |
| `src/test/privacyState.test.ts` | ✅ | ✅ | Not listening on launch |
| `tests/e2e/glass-critical.spec.ts` — test 1 | ✅ | E2E | Core windows exist |
| `tests/e2e/glass-modes.spec.ts` — launch test | ✅ | E2E | No audio/capture on launch |

### §2 First-run onboarding

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `GlassOnboardingOverlay.tsx` (UI) | ✅ | — | No dedicated unit file; manual + future E2E |
| `tests/visual/iivo-glass-onboarding.spec.ts` | **Legacy** | Skipped | Web flow retired |
| E2E with `IIVO_GLASS_E2E=1` | ✅ | Auto-skip | Onboarding bypassed so other specs run |

**Gap:** Full three-question Electron onboarding E2E still **UNCOVERED** (contract priority #3).

### §3 Command bar

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/commandBarMic.test.ts` | ✅ | ✅ | |
| `src/test/glassTextInteraction.test.ts` | ✅ | ✅ | |
| `src/test/glassHotkeySettings.test.ts` | ✅ | ✅ | |
| `src/test/voiceModeState.test.ts` | ✅ | ✅ | Voice mode bridge |
| `src/test/voiceModeWiring.test.ts` | ✅ | ✅ | Includes legacy-path comment (still valid) |
| `tests/e2e/glass-critical.spec.ts` — 1–3, 13 | ✅ | E2E | |

### §4 Direct response

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassAskClient.test.ts` | ✅ | ✅ | |
| `src/test/glassAskClientPayload.test.ts` | ✅ | ✅ | |
| `src/test/glassAskTiming.test.ts` | ✅ | ✅ | |
| `src/test/glassAskTypes.test.ts` | ✅ | ✅ | |
| `src/test/commandFeed.test.ts` | ✅ | ✅ | |
| `src/test/liveAskRetry.test.ts` | ✅ | ✅ | |
| `src/test/overlayCards.test.ts` | ✅ | ✅ | |
| `src/test/voiceAskStatus.test.ts` | ✅ | ✅ | |
| `tests/e2e/glass-critical.spec.ts` — 2–3 | ✅ | E2E | |
| `tests/e2e/glass-live.spec.ts` | ✅ | E2E live | Needs live server |

### §5 Pin

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/commandFeed.test.ts` | ✅ | ✅ | Pinned flag logic |
| `tests/e2e/glass-contract.spec.ts` — pin test | ✅ | E2E | **Not** `glass-critical` test 5 |

### §6 Auto-dismiss

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassNotifications.test.ts` | ✅ | ✅ | |
| `src/test/overlayPointerPolicy.test.ts` | ✅ | ✅ | |
| `tests/e2e/glass-contract.spec.ts` — auto-dismiss | ✅ | E2E | 17s timer |
| `tests/e2e/glass-critical.spec.ts` — test 3 | ✅ | E2E | Partial (3.5s cancel, not full 17s) |

### §7 Remember this

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/iivoMemoryClient.test.ts` | ✅ | ✅ | |
| `src/test/savedMoments.test.ts` | ✅ | ✅ | |
| `tests/e2e/glass-contract.spec.ts` — remember | ✅ | E2E | |

### §8 Council handoff

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassBrowserHandoff.test.ts` | ✅ | ✅ | |
| `src/test/iivoAnalysisClient.test.ts` | ✅ | ✅ | |
| `src/test/config.test.ts` | ✅ | ✅ | Lens/dashboard URLs |
| `tests/e2e/glass-critical.spec.ts` — 6, 6b | ✅ | E2E | |

### §9 Listen Mode

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/listenModeRuntime.test.ts` | ✅ | ✅ | |
| `src/test/listenCountdown.test.ts` | ✅ | ✅ | |
| `src/test/listenMomentIntelligence.test.ts` | ✅ | ✅ | |
| `src/test/listenLiveHarness.test.ts` | ✅ | ✅ | |
| `src/test/voiceModeWiring.test.ts` | ✅ | ✅ | |
| `src/test/sessionCopilot.test.ts` | ✅ | ✅ | |
| `src/test/activeListening.test.ts` | ✅ | ✅ | |
| `src/test/listeningLimit.test.ts` | ✅ | ✅ | |
| `src/test/listenCardState.test.ts` | ✅ | ✅ | |
| `src/test/listenInsightQuality.test.ts` | ✅ | ✅ | |
| `src/test/listenThoughtCards.test.ts` | ✅ | ✅ | |
| `src/test/listenReport.test.ts` | ✅ | ✅ | |
| `src/test/listenEndurance.test.ts` | ✅ | ✅ | |
| `src/test/listenSilencePrompt.test.ts` | ✅ | ✅ | |
| `src/test/listenModePersona.test.ts` | ✅ | ✅ | |
| `src/test/currentMomentContext.test.ts` | ✅ | ✅ | |
| `src/test/transcriptDedupe.test.ts` | ✅ | ✅ | |
| `src/test/meetingIntelligence.test.ts` | ✅ | ✅ | |
| `src/test/nonMeetingIntelligence.test.ts` | ✅ | ✅ | |
| `src/test/copilotSessionSemantic.test.ts` | ✅ | ✅ | |
| `src/test/copilotDiagnosticAnalysis.test.ts` | ✅ | ✅ | |
| `src/test/copilotPanelModel.test.ts` | ✅ | ✅ | |
| `src/test/mediaContextExtract.test.ts` | ✅ | ✅ | |
| `tests/e2e/glass-modes.spec.ts` | ✅ | E2E | Listen/Meetings setup |
| `tests/e2e/glass-copilot.spec.ts` | ✅ | E2E | Session + stop |
| `tests/e2e/glass-critical.spec.ts` — test 5 | ✅ | E2E | Stop Everything |

### §10 Live Notes

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/listenLiveNotes.test.ts` | ✅ | ✅ | |
| `src/test/listenStreamingNotes.test.ts` | ✅ | ✅ | |
| `src/test/listenMeaningNote.test.ts` | ✅ | ✅ | |
| `src/test/noteExtraction.test.ts` | ✅ | ✅ | |
| E2E dedicated spec | — | **UNCOVERED** | Contract gap |

### §11 Live Translate

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/liveTranslate.test.ts` | ✅ | ✅ | Includes legacy `save_transcript` alias test (still valid) |
| `tests/e2e/glass-translate.spec.ts` | ✅ | E2E | 6 tests |

### §12 Visual Ask

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassScreenContext.test.ts` | ✅ | ✅ | |
| `src/test/visualAskFlow.test.ts` | ✅ | ✅ | |
| `src/test/visualAskPreflight.test.ts` | ✅ | ✅ | |
| `src/test/visualAskDiagnostics.test.ts` | ✅ | ✅ | |
| `src/test/visualAskQuality.test.ts` | ✅ | ✅ | |
| `src/test/visualImageCrop.test.ts` | ✅ | ✅ | |
| `src/test/visualImageOptimizerConfig.test.ts` | ✅ | ✅ | |
| `src/test/glassVisualIntent.test.ts` | ✅ | ✅ | |
| `src/test/glassScreenshotRetention.test.ts` | ✅ | ✅ | |
| `src/test/cgWindowCoordinates.test.ts` | ✅ | ✅ | |
| `tests/e2e/glass-critical.spec.ts` — 7–9, 11–12 | ✅ | E2E | |

### §13 Screen context

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassLatestScreenshot.test.ts` | ✅ | ✅ | |
| `src/test/panelStatusGrid.test.ts` | ✅ | ✅ | |
| `src/test/windowContext.test.ts` | ✅ | ✅ | |

### §14 Connect panel

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassCapabilities.test.ts` | ✅ | ✅ | |
| `src/test/captureDiagnostics.test.ts` | ✅ | ✅ | |
| `src/test/captureSourceEnumeration.test.ts` | ✅ | ✅ | |
| `src/test/screenCaptureProbe.test.ts` | ✅ | ✅ | |
| `src/test/systemAudioUi.test.ts` | ✅ | ✅ | |
| `src/test/systemAudioProbe.test.ts` | ✅ | ✅ | |
| `src/test/systemAudioCapture.test.ts` | ✅ | ✅ | |
| `src/test/systemAudioFixHints.test.ts` | ✅ | ✅ | |
| `src/test/virtualAudioDevices.test.ts` | ✅ | ✅ | |
| `src/test/virtualAudioCapture.test.ts` | ✅ | ✅ | |
| `src/test/sttServer.test.ts` | ✅ | ✅ | |
| `src/test/sttOpenAI.test.ts` | ✅ | ✅ | |
| `src/test/sttTypes.test.ts` | ✅ | ✅ | |
| `src/test/sttChunkHandler.test.ts` | ✅ | ✅ | |
| `src/test/sttReliability.test.ts` | ✅ | ✅ | |
| `src/test/transcriptionTypes.test.ts` | ✅ | ✅ | Web Speech path still valid in Electron |
| `src/test/audioChunks.test.ts` | ✅ | ✅ | |
| `src/test/audioPersistence.test.ts` | ✅ | ✅ | |
| `src/test/glassServerHealth.test.ts` | ⛔ Infra-blocked | Cannot load | Needs electron mock or runner |
| `tests/e2e/glass-critical.spec.ts` — 4, 10–11, 15 | ✅ | E2E | |

### §15 Settings / display

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassSettings.test.ts` | ✅ | ✅ | |
| `src/test/config.test.ts` | ✅ | ✅ | |
| `src/test/multiDisplay.test.ts` | ✅ | ✅ | |
| `src/test/followMouseDisplay.test.ts` | ✅ | ✅ | |
| `src/test/glassLayoutManager.test.ts` | ✅ | ✅ | |
| `src/test/glassWindowLayout.test.ts` | ✅ | ✅ | |
| `tests/e2e/glass-multidisplay.spec.ts` | ✅ | E2E | Needs 2+ displays for full run |
| `tests/e2e/glass-critical.spec.ts` — test 14 | ✅ | E2E | Window metadata |
| In-app API URL editor | — | **UNCOVERED** | Not implemented |
| Post-onboarding profile editor | — | **UNCOVERED** | Not implemented |

### §16 Update check

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassAppUpdate.test.ts` | ✅ (1 legacy case) | ✅ 6/6 | Semver + GitHub feed; DMG case is dev fallback |
| `glassAutoUpdater.ts` | ✅ | **No unit tests** | Squirrel path added v0.1.9 — add tests |
| `scripts/write-glass-update-manifest.mjs` | ✅ | Manual | Packaging hook |
| E2E update overlay | — | **UNCOVERED** | Disabled when `IIVO_GLASS_E2E=1` |

**v0.1.9 note:** Contract §16 text still says "Apply opens DMG" — packaged Mac now uses Squirrel `quitAndInstall`. Update contract copy separately.

### §17 Quit cleanly

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassOperations.test.ts` | ✅ | ✅ | Stop-all state |
| `tests/e2e/glass-contract.spec.ts` — quit | ✅ | E2E | Orphan process check |
| E2E helpers (`closeGlassApp`) | ✅ | E2E | All specs |

### §18 Passive Context Engine

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassContextEngine.test.ts` | ✅ | ✅ | |
| `src/test/glassContextStore.test.ts` | ✅ | ✅ | |
| `src/test/contextPayload.test.ts` | ✅ | ✅ | Ask payload wiring |
| E2E | — | **UNCOVERED** | |

---

## Infrastructure / hygiene (no direct contract §)

| Suite | Valid? | Passing? | Notes |
|-------|--------|----------|-------|
| `src/test/glassBranchHygiene.test.ts` | ✅ | ✅ | Branch docs |
| `src/test/glassGitGuard.test.ts` | ✅ | ✅ | Release guard |
| `src/test/glassOvernightE2e.test.ts` | ✅ | ✅ | E2E log parser |
| `src/test/glassPackagingVariant.test.ts` | ✅ | ✅ | Duplicate .app warning |
| `src/test/glassScenarioBank.test.ts` | ✅ | ✅ | QA scenario bank |
| `src/test/glassModePresets.test.ts` | ✅ | ✅ | Mode presets |
| `src/test/sessionStore.test.ts` | ✅ | ✅ | Session persistence |
| `src/test/sessionIntelligence.test.ts` | ✅ | ✅ | |
| `src/test/sessionSummary.test.ts` | ✅ | ✅ | |
| `src/test/sessionPayload.test.ts` | ✅ | ✅ | |
| `src/test/sessionScreenshotPaths.test.ts` | ✅ | ✅ | |

---

## E2E suite index (all `tests/e2e/glass-*.spec.ts`)

| File | Tests | Valid? | Contract focus | Run requirements |
|------|-------|--------|----------------|------------------|
| `glass-critical.spec.ts` | 15 | ✅ | §1, §3–4, §8–9, §12–15 | Build + Electron + stub server |
| `glass-contract.spec.ts` | 4 | ✅ | §5–7, §17 | Same; 17s timer tests |
| `glass-modes.spec.ts` | 9 | ✅ | §1, §3, §9 | Same |
| `glass-copilot.spec.ts` | 6 | ✅ | §9 | Same |
| `glass-translate.spec.ts` | 6 | ✅ | §11 | Same |
| `glass-multidisplay.spec.ts` | 3 | ✅ | §15 | 2+ displays for full coverage |
| `glass-live.spec.ts` | 3 | ✅ | §4 | `IIVO_GLASS_LIVE_E2E=1` + production-like server |

**Common mistake (from contract):** `glass-critical` test **5** = Listen stop (§9), **not** Pin (§5). Pin/auto-dismiss/remember are in `glass-contract.spec.ts`.

---

## Web + server tests (Glass-adjacent)

| File | Valid? | Contract | Notes |
|------|--------|----------|-------|
| `tests/visual/iivo-glass-landing.spec.ts` | ✅ | Web install funnel | `/` landing, download CTA |
| `tests/visual/iivo-glass-onboarding.spec.ts` | **Legacy** | §2 (retired web) | Skipped |
| `tests/server/glassAsk.test.ts` | ✅ | §4 server | `/api/glass/ask` |
| `tests/server/glassApiAuth.test.ts` | ✅ | §14 server | Bearer auth |
| `tests/server/glassTranslate.test.ts` | ✅ | §11 server | Translate API |
| `tests/server/glassModels.test.ts` | ✅ | Server | Model routing |
| `tests/server/listenModePersonaSync.test.ts` | ✅ | §9 server | Persona sync |

---

## How to run tomorrow

```bash
# Unit (canonical — 756 tests)
cd desktop-glass && npm test

# Unit file omitted from npm test (infra-blocked)
cd desktop-glass && node --experimental-strip-types --test src/test/glassServerHealth.test.ts
# glassServerHealth.test.ts — fix import chain before adding to npm test script

# E2E (after npm run glass:build)
cd desktop-glass && npm run e2e

# E2E live (production server — use with care)
IIVO_GLASS_LIVE_E2E=1 npm run e2e:live --prefix desktop-glass
```

---

## Priority gaps before production soak (from contract)

1. **Live Notes E2E** (§10)
2. **Update check E2E** — stub newer semver → overlay; Squirrel apply path (§16)
3. **Electron onboarding E2E** — full three-question flow (§2)
4. **glassAutoUpdater.ts unit tests** — new in v0.1.9
5. Fix `glassServerHealth.test.ts` import chain and add to `package.json` `"test"` script

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-08 | Initial v0.1.9 baseline audit; 4 legacy markers added; 729/729 `npm test` pass |
| 2026-06-08 | 756/756 baseline: deleted legacy `listenSegmentClassifier` + `listenMomentMaturity`; added 5 unit files to `npm test` |
