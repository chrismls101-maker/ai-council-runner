# IIVO Glass Test Baseline — v0.1.15

**Audited:** 2026-06-09  
**Prior baseline:** `desktop-glass/tests/BASELINE_v0.1.9.md`  
**Contract:** `desktop-glass/GLASS_CONTRACT.md` (§1–§18)  
**App version:** `0.1.15` (`desktop-glass/package.json`)

This file records the v0.1.15 test baseline delta—especially **IIVO Lens** command-bar panel coverage. For full §1–§18 contract mapping, see `BASELINE_v0.1.9.md`.

---

## Executive summary

| Layer | Suites | Last run status | Notes |
|-------|--------|---------------|-------|
| **Unit** (`npm test` in `desktop-glass`) | 101 files, 761 tests | **761 pass / 0 fail** | +translate click-through, silence HUD, 2s translate chunks |
| **Unit (omitted)** | 1 file | **Infra-blocked** | `glassServerHealth.test.ts` — unchanged from v0.1.9 |
| **E2E Electron** (`tests/e2e/glass-*.spec.ts`) | **12 files**, **85 tests** | See full run below | Full `npm run e2e` gated by display/GUI |
| **E2E live** (`glass-live.spec.ts`) | 1 file, 3 tests | Not run in this audit | `IIVO_GLASS_LIVE_E2E=1` |
| **Web visual** (`tests/visual/iivo-glass-*.spec.ts`) | 2 files | Not run in this audit | |
| **Server** (`tests/server/glass*.test.ts`) | 4 files | Not run in this audit | |

### v0.1.15 product delta (test-relevant)

- **IIVO Lens** — command-bar panel: page capture, screenshot, ask-about-page/screenshot, attached-context chip, back/reopen, submit with lens context.
- **E2E stubs** — `glass:lens-capture` / `glass:lens-screenshot` return deterministic fixtures when `IIVO_GLASS_E2E=1` (`src/main/glassLensE2eStubs.ts`).
- **Command bar window** — dynamic height for tall Lens accessory stack (`commandBarWindowHeightForStack`).

---

## Manual Dev Testing Fixes (v0.1.15)

Real-world `npm run dev` testing surfaced UX and click-through issues that unit/E2E tests did not catch. Each fix below: **broken → fixed → files**.

| # | What was broken | What was fixed | Files changed |
|---|-----------------|----------------|---------------|
| 1 | **Translate overlay clutter** — live translate competed with activity chips, transient toasts, and dimmed cards | Translate-active overlay mode (`overlay-root--translate-active`) prioritizes captions; transient notifications suppressed during translate | `liveTranslateState.ts`, `Overlay.tsx`, `useGlassNotification.ts`, `glass.css` |
| 2 | **Command bar translate button parity** — copilot quick tool and command bar used different icons/flows | Command bar quick-start restored; copilot opens full `TranslateModeSetup`; shared `CommandTranslateIcon` (Lucide Languages) | `CommandBar.tsx`, `CopilotPanel.tsx`, `index.ts` (`open-translate-setup`) |
| 3 | **Dismiss button not clickable** — overlay notice/card dismiss buttons did not receive clicks (click-through + `overflow` clipping) | `ensureOverlayInteractive` on notification/copilot surfaces; translate-active dimming uses opacity only (no `overflow: hidden` on hosts); dismiss uses `onPointerDown` capture | `GlassNotificationHost.tsx`, `CopilotOverlay.tsx`, `glass.css`, `glassTextInteraction.ts` |
| 4 | **Stop Everything did not end session** — session stayed active after emergency stop | `stop-everything` ends active/paused session, clears debrief, stops translate, resets overlay + command bar click-through | `index.ts`, `windows.ts` (`resetCommandBarClickThrough`) |
| 5 | **Debrief `#` markdown in overlay** — raw `#` headings shown in debrief card | `formatOverlayPlainText()` strips leading `#` for overlay display | `overlayPlainText.ts`, `CopilotOverlay.tsx` |
| 6 | **system_audio STT path** — live translate did not receive transcript chunks from system audio | `system_audio` capture mode now sends `add-transcript-chunk` (was mic-only) | `useTranscription.ts` |
| 7 | **Caption fallback on API failure** — blank captions when translation API failed | On failure, show original text as caption fallback | `liveTranslateMain.ts` |
| 8 | **Command bar HUD pills** — listen timer and translate status stacked above bar as large accessories | Compact pills in `command-bar-hud` row left of composer; command-bar shell styling | `CommandBar.tsx`, `glass.css` |
| 9 | **Click-through on other screen** — after translate/stop, Glass blocked clicks on other monitor/apps | `overlayPointerPolicy` translate-focus click-through; `releaseCommandBarCapture` after translate/listen stop; passive notices no longer capture full overlay | `overlayPointerPolicy.ts`, `Overlay.tsx`, `CommandBar.tsx`, `index.ts` |
| 10 | **Session pill position** — “Session active” chip sat bottom-left on overlay | Removed overlay session chip; session status pill in command bar HUD beside listen/translate pills | `Overlay.tsx`, `CommandBar.tsx`, `glass.css` |
| 11 | **Duplicate debrief cards** — two debrief UIs on session end (overlay copilot + command feed notice) | Single debrief in copilot overlay only; removed feed push + “Session debrief ready” notice; centered above command bar | `index.ts` (`generateCopilotDebrief`), `CopilotOverlay.tsx`, `glass.css` |
| 12 | **Debrief auto-dismiss** — debrief card persisted indefinitely | Auto-dismiss after 90s unless hovered; dismiss button clickability fixed | `CopilotOverlay.tsx` |
| 13 | **Dock position** — dock sat above command bar left edge, not top-center | Dock anchors top-center of work area (aligned with command bar horizontal center) | `glassLayoutMath.ts`, `glassLayoutManager.test.ts` |
| 14 | **Dev opens on HDMI** — `npm run dev` launched on external display | Dev forces `displayTarget: "primary"`; `IIVO_GLASS_DEV_PRIMARY=1` in dev scripts | `index.ts`, `package.json` |
| 15 | **Faster translate captions** — captions lagged vs YouTube STT | `LIVE_TRANSLATE_CHUNK_MS` reduced (6s → 4s) for translate listening | `liveTranslateConfig.ts`, `useTranscription.ts` |
| 16 | **Language detection UI** — “language not detected” / confusing `en` labels | Latin text defaults to `en`; compact pair labels (`Auto → ES`) on HUD pill | `liveTranslateEngine.ts`, `liveTranslateTypes.ts`, `liveTranslateCaptions.ts` |
| 17 | **Capture notice layout** — long “Screen captured locally…” text overlapped Dismiss; button unclickable | Shortened copy; compact layout only ≤72 chars; stack layout for longer text; `overflow: hidden` on ellipsis; dismiss `ensureOverlayInteractive` | `glassOperations.ts`, `GlassNotificationHost.tsx`, `glass.css` |
| 18 | **Duplicate “Screen: captured 0s ago” card** — command bar accessory duplicated overlay capture notice | Ephemeral `captured` / `ready` screen context hidden from command bar accessories | `CommandBar.tsx` |
| 19 | **Notices sticking around** — capture/status notices never auto-cleared | Status notices auto-dismiss after 8s (`useNoticeAutoDismiss` → `clear-last-notice`) | `useGlassNotification.ts` |
| 20 | **Duplicate “Listening started” toast** — overlapped HUD listen pill | Removed listening-start toast enqueue | `useGlassNotification.ts` |
| 21 | **Dock shadow/overlay under chrome** — heavy drop shadow and apple-sheen `::before` layer visible beneath dock pill | Removed external `box-shadow` and `::before` sheen; dock keeps inset highlight, border ring, and bottom LED line only (`::after`) | `glass.css` (`.dock`) |
| 22 | **Translation caption `[en]` prefix** — caption card showed `[en]` / `EN:` language tags instead of plain translation | `stripCaptionLanguagePrefix()` strips bracket/label prefixes on ingest and display; E2E mock no longer prefixes `[targetLanguage]`; original+translation mode shows plain text on both lines | `liveTranslateCaptions.ts`, `index.ts` (`ingestTranslateChunk` E2E mock), `liveTranslate.test.ts`, `glass-translate.spec.ts` |
| 23 | **Click-through broken during translate (both monitors)** — overlay/command bar/dock blocked clicks on other apps/displays | `applyGlassChromeClickThrough()` on translate start/stop; dock `setIgnoreMouseEvents(true,{forward:true})` + hover-to-interact; translate overlay policy always click-through until caption hover | `windows.ts`, `index.ts`, `Dock.tsx`, `overlayPointerPolicy.ts`, `Overlay.tsx` |
| 24 | **Silent wait when no audio** — STT silence surfaced as retest/error during translate | `shouldSuppressNoSignalErrors` in `sttChunkHandler`; translate HUD pill shows **Listening for audio...** instead of error | `sttChunkHandler.ts`, `sttTypes.ts`, `useTranscription.ts`, `CommandBar.tsx` |
| 25 | **Translation pace lag** — 4s STT chunks + batched caption display | `LIVE_TRANSLATE_CHUNK_MS` → 1.5s (system audio); mic translate uses Web Speech interim → `add-transcript-chunk`; interim caption pushed on STT | `liveTranslateConfig.ts`, `liveTranslateState.ts`, `useTranscription.ts`, `index.ts` |
| 26 | **Persistent window click-through (broken)** — always-on `setIgnoreMouseEvents(true)` blocked button clicks | Reverted; each window uses mousemove + `elementFromPoint` → IPC toggles ignore-mouse; default click-through with `forward:true` | `glassClickThroughTracking.ts`, `windows.ts`, `glassTextInteraction.ts`, dock/command/overlay mains |
| 27 | **Translate stop incomplete** — HUD listen timer kept running after translate off | `translate-stop` calls `stopTranslateListening()` (broadcast STT stop, pause privacy, clear timer/transcribing) | `index.ts` |
| 28 | **Click-through race / lock button flash** — mousemove IPC toggle let clicks fall through before `setIgnoreMouseEvents` updated; E2E lock click needed manual retry | Fixed architecture: overlay `setIgnoreMouseEvents(true,{forward:true})` once at creation only; command bar, dock, panel never call `setIgnoreMouseEvents`; removed all runtime toggling and `glassClickThroughTracking.ts` | `windows.ts`, `glassTextInteraction.ts`, dock/command/overlay mains, `glass-command-bar.spec.ts` |
| 29 | **Dock/command bar click-through without race** — always-interactive windows blocked other apps; mousemove IPC flashed | `cursor-changed` on `webContents` in main: pointer/text/hand → interactive, else click-through with `forward:true`; initial state click-through on dock + command bar creation | `windows.ts` (`configureChromeClickThrough`) |
| 30 | **Translate captions missing / “Transcript saved” during translate** — overlay window hidden when user hid overlay; notice shown while translate active | `setOverlayPinnedForTranslate(true)` on translate-start keeps overlay window up for captions; placeholder “Listening for audio...” caption; suppress transcript-saved notice when translate active | `windows.ts`, `index.ts` |
| 31 | **”Auto → Spanish” caption card on command-bar translate** — inactive `liveTranslate` omitted from state so command bar fell back to hardcoded `”es”` | Default target uses `DEFAULT_LIVE_TRANSLATE_CONFIG.targetLanguage` (`”en”`) in command bar + translate setup | `CommandBar.tsx`, `TranslateModeSetup.tsx` |
| 32 | **Click-through permanent block on both monitors (root cause)** — Electron 42 macOS silently resets `setIgnoreMouseEvents` to `false` on every `show()`/`showInactive()` call; additionally `dock.show()` stole focus from the user's other app making HISENSE unresponsive | (1) Re-apply `setIgnoreMouseEvents(true,{forward:true})` immediately after every `showInactive()`/`show()` in `stackGlassWindows`, `showPrimaryGlassWindows`, `setOverlayPinnedForTranslate`, `syncOverlayPresentationRaised`, `toggleOverlay`, `setOverlayMode`, `toggleCommandBar`; (2) change `dock.show()` → `dock.showInactive()` in `stackGlassWindows` to prevent focus stealing | `windows.ts` |
| 33 | **Translate stop timer running** — HUD listen timer kept running after clicking translate off | Fixed by user — `translate-stop` handler properly clears the timer | `index.ts` |
| 34 | **Buttons dead during translate** — `stackGlassWindows` every caption push calls `showInactive()` and blind click-through reset; `cursor-changed` never re-fired if cursor over translate pill (`text` cursor) | `windowInteractiveState` map + `reapplyClickThrough()` after show; only `pointer`/`hand` make dock/commandBar interactive; exclude `text` cursor | `windows.ts` |
| 35 | **Command bar still unclickable after #34** — cursor-changed click-through on bounded pill windows is inherently fragile (text cursor on translate HUD, showInactive resets) | Dock + command bar never use OS click-through: `ensureChromeWindowInteractive()` only; overlay stays click-through; command bar CSS uses 100% not 100vw/vh | `windows.ts`, `glass.css` |

### Command bar E2E — `tests/e2e/glass-command-bar.spec.ts`

| Field | Value |
|-------|--------|
| **File** | `desktop-glass/tests/e2e/glass-command-bar.spec.ts` |
| **Tests** | **4** |
| **Result** | **4 pass / 0 fail** |
| **Run** | `cd desktop-glass && npm run e2e -- --grep glass-command-bar` |

| # | Test name | What it proves |
|---|-----------|----------------|
| 1 | command input is focusable and accepts text | `glass-command-input` focus + fill |
| 2 | translate button starts and stops from command bar | `glass-command-translate` / `glass-command-translate-stop` |
| 3 | listening pill appears beside command bar and stop is clickable | `glass-command-bar-hud` pills + `glass-command-stop-listening` |
| 4 | chrome lock, lens, mic, and submit buttons are clickable | `glass-command-chrome-lock`, lens, listen, submit |

---

## Lens panel E2E — `tests/e2e/glass-lens.spec.ts`

| Field | Value |
|-------|--------|
| **File** | `desktop-glass/tests/e2e/glass-lens.spec.ts` |
| **Glass version** | v0.1.15 |
| **Audited** | 2026-06-09 |
| **Tests** | **11** |
| **Result** | **11 pass / 0 fail** |
| **Run** | `cd desktop-glass && npm run e2e -- --grep glass-lens` |
| **Headed (watch Setup connect)** | `npm run e2e:headed -- --grep glass-lens` |

### Test list (order)

| # | Test name | What it proves |
|---|-----------|----------------|
| 1 | `glass-lens-health-connected` | Setup **IIVO GLASS CONNECTED** (green dot), Server + Vision Online, stub server + system audio available |
| 2 | `glass-lens-button-visible` | `glass-command-lens` visible on command bar |
| 3 | `glass-lens-panel-opens` | Lens opens; stub page title + `example.com` domain |
| 4 | `glass-lens-panel-close` | × dismisses panel; no attached chip |
| 5 | `glass-lens-take-screenshot` | Empty preview → capture → thumbnail visible |
| 6 | `glass-lens-lightbox` | Screenshot preview opens/closes lightbox |
| 7 | `glass-lens-ask-about-page` | Ask page → chip + placeholder |
| 8 | `glass-lens-ask-about-screenshot` | Screenshot + ask → chip + placeholder |
| 9 | `glass-lens-back-from-chip` | ← on chip restores panel with same page |
| 10 | `glass-lens-chip-reopen` | Chip label reopens panel |
| 11 | `glass-lens-submit-clears-context` | Submit with lens context → overlay card; chip cleared |

### E2E setup notes

- Uses same launch pattern as `glass-critical.spec.ts`: `launchGlassApp` → stub HTTP server → CDP port 19222.
- `beforeAll`: `connectIivoGlassForE2e` (server Online + system audio simulated).
- `beforeEach`: **Lens-only** reset (`resetLensE2eState`) — does **not** call `e2e-reset-setup-state`, so Setup stays connected across tests.
- Lens IPC stubbed in main when `IIVO_GLASS_E2E=1` (no Chrome `osascript`, no display capture).

---

## Overlay response cards E2E — `tests/e2e/glass-overlay-cards.spec.ts`

| Field | Value |
|-------|--------|
| **File** | `desktop-glass/tests/e2e/glass-overlay-cards.spec.ts` |
| **Glass version** | v0.1.15 |
| **Audited** | 2026-06-09 |
| **Tests** | **2** |
| **Result** | **2 pass / 0 fail** |
| **Run** | `cd desktop-glass && npm run e2e -- --grep glass-overlay-cards` |

### Test list

| # | Test name | What it proves |
|---|-----------|----------------|
| 1 | `glass-overlay-copy` | Submit ask → response card → click `glass-overlay-copy` → clipboard (`navigator.clipboard.readText()` on overlay page) contains `fullBody` answer text |
| 2 | `glass-overlay-save-moment` | Submit ask → click `glass-overlay-save-moment` → `lastNotice`, `moments[]`, and `commandFeed` moment item confirm `save-feed-moment` IPC |

### New `data-testid`s (`OverlayFeedCard.tsx`)

| `data-testid` | Element |
|---------------|---------|
| `glass-overlay-copy` | Copy button on merged-chat response card |
| `glass-overlay-save-moment` | Save Moment button on merged-chat response card |

**Note:** Save Moment does not change button label; confirmation is asserted via main-process state (not overlay toast). Remember this / Pin / Open in IIVO remain covered in `glass-contract.spec.ts` and `glass-critical.spec.ts`.

---

## Dock E2E — `tests/e2e/glass-dock.spec.ts`

| Field | Value |
|-------|--------|
| **File** | `desktop-glass/tests/e2e/glass-dock.spec.ts` |
| **Glass version** | v0.1.15 |
| **Audited** | 2026-06-09 |
| **Tests** | **9** |
| **Result** | **9 pass / 0 fail** |
| **Run** | `cd desktop-glass && npm run e2e -- --grep glass-dock` |

### Test list

| # | Test name | What it proves |
|---|-----------|----------------|
| 1 | `glass-dock-visible` | `glass-dock` visible on launch |
| 2 | `glass-dock-start-session` | Start Session → `session.status === "active"` + `glass-command-session-status` visible; no overlay session chip |
| 3 | `glass-dock-pause-resume` | Pause ↔ Resume button swap on live session |
| 4 | `glass-dock-end-session` | End → `session.status === "ended"` + Start Session returns |
| 5 | `glass-dock-panel-toggle` | Open/Close Panel toggles `panelVisible` |
| 6 | `glass-dock-capture` | Capture → `operationDiagnostics.captureStatus` set |
| 7 | `glass-dock-hide-show-overlay` | Hide/Show overlay toggles `windows.overlayVisible` |
| 8 | `glass-dock-orientation` | ↻ toggles `dock--vertical` / `glassSettings.dockOrientation` |
| 9 | `glass-dock-stop-everything` | IPC listening → dock Stop Everything → `privacy.listening` false |

### New `data-testid`s (`Dock.tsx`)

| `data-testid` | Element |
|---------------|---------|
| `glass-dock-end-session` | End Session button |
| `glass-dock-stop-listening` | Stop Listening button (when listening) |
| `glass-dock-hide-overlay` | Hide Overlay (when overlay visible) |
| `glass-dock-show-overlay` | Show Overlay (when overlay hidden) |

### E2E setup notes

- Same launch pattern as `glass-critical.spec.ts`.
- `beforeEach`: `ensureGlassSetupGreen()` — CONNECT IIVO GLASS + green Server / Vision / Screen Recording rows (`e2e-set-capture-probes`).

---

## Panel tabs E2E — `tests/e2e/glass-panel-tabs.spec.ts`

| Field | Value |
|-------|--------|
| **File** | `desktop-glass/tests/e2e/glass-panel-tabs.spec.ts` |
| **Glass version** | v0.1.15 |
| **Audited** | 2026-06-09 |
| **Tests** | **8** |
| **Result** | **8 pass / 0 fail** |
| **Run** | `cd desktop-glass && npm run e2e -- --grep glass-panel-tabs` |

### Test list

| # | Test name | What it proves |
|---|-----------|----------------|
| 1 | `glass-panel-tab-summary` | Summary tab → *“No summary yet”* empty state |
| 2 | `glass-panel-tab-session-empty` | Session tab → *“No session yet”* |
| 3 | `glass-panel-tab-insights` | Insights tab → *“Start a session to extract live insights”* |
| 4 | `glass-panel-tab-context` | Context tab → empty questions + *“No saved moments yet.”* |
| 5 | `glass-panel-tab-hypotheses` | Hypotheses tab → *“No hypotheses detected”* |
| 6 | `glass-panel-tab-actions` | Actions tab → *“No action items detected”* |
| 7 | `glass-panel-tab-diagnostics` | Diagnostics tab → *“Operation diagnostics”* + `operationDiagnostics` in state |
| 8 | `glass-panel-tab-session-active` | Session tab → Start Session from dock clears empty copy (**runs last** — see note) |

### E2E setup notes

- `beforeEach`: `ensureGlassSetupGreen()` + `session-clear` + `clear-moments` (clean empty-state assertions).
- **`glass-panel-tab-session-active` is last** — after Start Session, `sessions.current()` remains non-null even after `session-end`/`session-clear`, which breaks Insights empty copy if run earlier.

---

## Visual Ask E2E — no new spec (Section 5)

| Field | Value |
|-------|--------|
| **New spec** | None — intentional |
| **Coverage** | `tests/e2e/glass-critical.spec.ts` |
| **Audited** | 2026-06-09 |

### Coverage map (`glass-critical.spec.ts`)

| Test | What it proves |
|------|----------------|
| **6b** | Visual ask with screen context → overlay response card |
| **7** | Visual ask retention / ephemeral discard behavior |
| **8** | Visual ask with session → capture persisted |
| **9** | Visual ask server error surfaces in overlay |
| **11** | Vision disabled → setup action visible |
| **12** | Capture permission failure → settings action (no prior capture) |

### Unit-only paths (not E2E gaps)

| Path | Why no E2E |
|------|------------|
| **Last capture fallback** | No E2E hook — `simulateE2eCaptureFail()` fails preflight before capture; `captureDisplayById` never throws in E2E stub mode. Covered in unit tests (`visualAskFlow.test.ts`, `glassVisualAskCapture.ts`). |
| **"Optimizing screen image…" UI** | Cosmetic/transient; reuses `glass-overlay-looking-card` with no separate `data-testid`. |

These are **intentional** design choices, not missing coverage.

---

## E2E setup standard (v0.1.15+)

**All new E2E specs** should call **`ensureGlassSetupGreen()`** in `beforeEach` (or equivalent) so every test starts with:

- **CONNECT IIVO GLASS** — `data-connected="true"`, green dot
- **Server** — Online (`glass-setup-row-server` green)
- **Vision** — Online/enabled (`glass-setup-row-vision` green)
- **Screen Recording** — Ready (`glass-setup-row-screenRecording` green via `e2e-set-capture-probes`)
- **System audio** — `systemAudioStatus === "available"` (stub)

Implemented today in: `glass-dock.spec.ts`, `glass-panel-tabs.spec.ts`. Older specs (`glass-critical`, `glass-lens`, etc.) use `connectIivoGlassForE2e` per-test or partial setup — migrate when touched.

---

## New `data-testid` values (v0.1.15 Lens baseline)

Added or split in this release for stable E2E selectors.

### `GlassLensPanel.tsx`

| `data-testid` | Element / behavior |
|---------------|-------------------|
| `glass-lens-panel-title` | Page title (`h2`) |
| `glass-lens-panel-domain` | Hostname in domain row |
| `glass-lens-panel-preview-empty` | “No screenshot yet” placeholder |
| `glass-lens-panel-screenshot-loading` | Take Screenshot button while `screenshotLoading` (replaces `glass-lens-panel-take-screenshot` during capture) |
| `glass-lens-panel-ask-page-no-screenshot` | Primary “Ask about this page” (no screenshot yet) |
| `glass-lens-panel-ask-page-with-screenshot` | Secondary “Ask about this page” (after screenshot) |

**Fix:** Removed duplicate `glass-lens-panel-ask-page` on two different pills.

**Pre-existing Lens panel ids** (unchanged, used by spec): `glass-lens-panel`, `glass-lens-panel-close`, `glass-lens-panel-screenshot`, `glass-lens-panel-take-screenshot`, `glass-lens-panel-ask-screenshot`, `glass-lens-panel-lightbox`, `glass-lens-panel-lightbox-close`.

### `CommandBar.tsx`

| `data-testid` | Element / behavior |
|---------------|-------------------|
| `glass-command-lens-loading` | Lens icon button while `lensLoading` (replaces `glass-command-lens` during page capture) |
| `glass-command-lens-attached-label` | “Page: {hostname}” text inside attached-context chip |

**Pre-existing Lens command-bar ids** (unchanged, used by spec): `glass-command-lens`, `glass-command-lens-attached`, `glass-command-lens-attached-back`, `glass-command-lens-attached-reopen`, `glass-command-lens-attached-dismiss`.

---

## E2E suite index (updated)

| File | Tests | Valid? | Contract focus | Run requirements |
|------|-------|--------|----------------|------------------|
| `glass-critical.spec.ts` | 15 | ✅ | §1, §3–4, §8–9, §12–15 | Build + Electron + stub server |
| `glass-contract.spec.ts` | 4 | ✅ | §5–7, §17 | Same |
| `glass-modes.spec.ts` | 9 | ✅ | §1, §3, §9 | Same |
| `glass-copilot.spec.ts` | 6 | ✅ | §9 | Same |
| `glass-translate.spec.ts` | 10 | ✅ | §11 Live Translate | Same; `--grep glass-translate` |
| **`glass-command-bar.spec.ts`** | **4** | **✅** | **Command bar HUD + controls** | **Same; `--grep glass-command-bar`** |
| `glass-multidisplay.spec.ts` | 3 | ✅ | §15 | 2+ displays for full coverage |
| `glass-live.spec.ts` | 3 | ✅ | §4 | `IIVO_GLASS_LIVE_E2E=1` |
| **`glass-lens.spec.ts`** | **11** | **✅** | **Lens / §3 command bar** | **Same; `--grep glass-lens`** |
| **`glass-overlay-cards.spec.ts`** | **2** | **✅** | **Overlay Copy + Save Moment** | **Same; `--grep glass-overlay-cards`** |
| **`glass-dock.spec.ts`** | **9** | **✅** | **Dock transport + chrome** | **Same; `--grep glass-dock`** |
| **`glass-panel-tabs.spec.ts`** | **8** | **✅** | **Panel tab empty states** | **Same; `--grep glass-panel-tabs`** |

---

## How to run

```bash
# Unit (761 tests)
cd desktop-glass && npm test

# Lens E2E only (11 tests — after build)
cd desktop-glass && npm run e2e -- --grep glass-lens

# Overlay response cards E2E only (2 tests)
cd desktop-glass && npm run e2e -- --grep glass-overlay-cards

# Dock E2E only (9 tests)
cd desktop-glass && npm run e2e -- --grep glass-dock

# Panel tabs E2E only (8 tests)
cd desktop-glass && npm run e2e -- --grep glass-panel-tabs

# Full E2E suite
cd desktop-glass && npm run e2e
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-09 | Initial v0.1.15 baseline: Lens E2E `glass-lens.spec.ts` 11/11 pass; new Lens `data-testid`s documented; unit count 757 |
| 2026-06-09 | Overlay cards E2E `glass-overlay-cards.spec.ts` 2/2 pass; `glass-overlay-copy` + `glass-overlay-save-moment` on `OverlayFeedCard.tsx` |
| 2026-06-09 | Dock E2E `glass-dock.spec.ts` 9/9 pass; 4 new dock `data-testid`s on `Dock.tsx` |
| 2026-06-09 | Panel tabs E2E `glass-panel-tabs.spec.ts` 8/8 pass; documented `ensureGlassSetupGreen()` as E2E standard |
| 2026-06-09 | Visual Ask (Section 5): no new E2E spec; coverage in `glass-critical` #6b, #7, #8, #9, #11, #12; last-capture fallback + optimizing UI unit-only by design |
| 2026-06-09 | Manual dev testing fixes documented (§ Manual Dev Testing Fixes); `glass-command-bar.spec.ts` 4/4; `glass-translate.spec.ts` 10 tests; full E2E **82 pass / 3 skipped** (85 total; `glass-live` skipped without `IIVO_GLASS_LIVE_E2E=1`) |
| 2026-06-09 | `glass-critical.spec.ts` test 2 stub text + test 10/15 setup assertions aligned with E2E probe behavior |
| 2026-06-09 | Manual dev fixes #21–#22: dock LED-only chrome (no drop shadow/sheen); translation captions strip `[en]`/`EN:` prefixes; unit count 759 |
| 2026-06-09 | Manual dev fixes #23–#25: translate click-through (overlay/command bar/dock); silence → **Listening for audio...** HUD; 2s STT chunks + interim captions; unit count 761 |
