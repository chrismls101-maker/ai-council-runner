# IIVO Glass — Official Behavioral Contract (A–Z)

This document is the **source of truth** for what IIVO Glass promises users. Every feature Glass claims must be verifiable here.

**Contract entry format (each feature):**
- **Trigger** — what starts the behavior
- **User sees** — observable UI/state
- **Success** — promised outcome
- **Failure** — honest degraded behavior
- **Tests** — automated coverage (or `UNCOVERED`)

**Rule:** New features get a contract entry **before** implementation. New tests must map to a contract item.

**Numbering warning:** Contract feature numbers (**§1–§18**) are **not** the same as E2E test titles in `glass-critical.spec.ts` (e.g. contract **§5 = Pin**, but `glass-critical` **test 5 = Stop Everything / Listen**; contract **§6 = Auto-dismiss**, but `glass-critical` **test 6 = Council handoff**). Do not conflate them. Pin, auto-dismiss, and Remember this live in **`glass-contract.spec.ts`**, not panel setup.

**Related docs:** `GLASS_QA.md` (manual QA), `LISTEN_MODE_ARCHITECTURE.md`, `GLASS_LIMITATIONS.md`

---

## Coverage summary

| # | Feature | Automated | Gap |
|---|---------|-----------|-----|
| 1 | Cold launch | ✅ Unit + E2E | — |
| 2 | First-run onboarding | ✅ Electron overlay | Web spec retired |
| 3 | Command bar | ✅ Unit + E2E | — |
| 4 | Direct response | ✅ Unit + E2E | — |
| 5 | Pin | ✅ Unit + E2E | — |
| 6 | Auto-dismiss | ✅ Unit + E2E | — |
| 7 | Remember this | ✅ Unit + E2E | — |
| 8 | Council handoff | ✅ Unit + E2E | — |
| 9 | Listen Mode | ✅ Unit + E2E + scripts | — |
| 10 | Live Notes | ⚠️ Unit + scripts | No E2E |
| 11 | Live Translate | ✅ Unit + E2E | — |
| 12 | Visual Ask | ✅ Unit + E2E | — |
| 13 | Screen context | ✅ Unit + E2E (partial) | — |
| 14 | Connect panel | ✅ Unit + E2E | — |
| 15 | Settings | ⚠️ Partial | No in-app API URL / profile |
| 16 | Update check | ⚠️ Unit only | Skipped in E2E |
| 17 | Quit cleanly | ✅ E2E | — |
| 18 | Passive Context Engine | ✅ Unit | No E2E |

---

## 1. Cold launch

**Trigger**
- User opens IIVO Glass (dev, packaged `.app`, or DMG install).
- Electron `app.whenReady()` → load settings/sessions → `createWindows()` → optional boot splash (`beginGlassBootSequence`) unless `IIVO_GLASS_E2E=1`.

**User sees**
- Boot splash (when enabled): IIVO eye emblem, “LOADING…”, energy progress bar.
- Then: first-run onboarding overlay if not completed (see §2), else dock + overlay + command bar.
- No listening, no capture, no mic permission prompt on launch.
- **Does not require** panel Connect (§14) — cold launch is independent of setup-row green states.

**Success**
- App does not crash.
- Core windows exist: overlay, command bar, dock, panel (panel may be hidden).
- `privacy.listening === false`, `micPermission === "not_requested"`.

**Failure**
- Splash load failure → abort boot, show primary windows immediately.
- Missing build / Electron error → process exits with error (no silent hang).

**Tests**
- `src/test/bootSplash.test.ts`
- `tests/e2e/glass-critical.spec.ts` — **“1 — app launches and core windows exist”**
- `tests/e2e/glass-modes.spec.ts` — **“no audio/capture starts on initial launch”**
- Manual: `GLASS_QA.md` checklist items 1–2

---

## 2. First-run onboarding (three questions, profile saved)

**Scope note:** This calibration flow runs **inside the IIVO Glass Electron app** on first launch after the boot splash. Dock and command bar stay hidden until onboarding completes or is skipped. The web dashboard no longer hosts this modal. This is **not** a panel Setup action — it is a fullscreen overlay modal, separate from **CONNECT IIVO GLASS** (§14).

**Trigger**
- User opens Glass for the first time with `glass-onboarding.json` absent or `completed: false` in Electron `userData`.
- After boot splash (`finishSplash`), overlay shows onboarding before other chrome.

**User sees**
- Full-screen overlay modal with three steps:
  1. “What's your name?”
  2. “What kind of work do you usually do?”
  3. “What are you focused on right now?”
- Finish: “Glass is calibrated.” → dock and command bar appear. Skip bypasses profile.

**Success**
- `glass-onboarding.json` has `completed: true`.
- Profile JSON stored locally in `glass-onboarding.json` (unless skipped).
- Modal does not reappear on relaunch.
- `state.onboardingOpen === false` after completion.

**Failure**
- Skip → onboarding marked complete, profile remains null.
- Server offline on optional profile sync → local copy still available in Glass.

**Tests**
- `src/renderer/overlay/GlassOnboardingOverlay.tsx` (UI; same testids as web flow)
- `tests/visual/iivo-glass-onboarding.spec.ts` — **skipped** (documents Electron ownership; run Glass E2E manually)
- E2E auto-skips onboarding when `IIVO_GLASS_E2E=1` so other specs are unblocked

---

## 3. Command bar

**Trigger**
- Command bar window loads (`command.html` → `CommandBar.tsx`).
- User clicks/hovers bar (disables click-through), types in input, presses Enter or Send.
- Global hotkey (default **⌘⇧Space**) → `glass:command-bar-focus` IPC.
- Escape blurs input and restores click-through when not hovered.

**User sees**
- Bottom-centered glass pill: mic · text field · translate · send/stop · layout lock.
- Accessory strip above pill when listening, translating, or showing screen context.
- Placeholder cycles: “Ask IIVO while you work…”, “Listening…”, “IIVO is thinking…”, etc.

**Success**
- Input accepts typing and submit.
- Hotkey focuses and selects input (when registered).
- Right-click in input shows native edit menu (cut/copy/paste) — click-through bypassed on right-click.

**Failure**
- Hotkey registration fails → bar remains clickable; status message in panel.
- Mic permission denied → `glass-command-mic-denied` + “Open Microphone Settings”.
- Ask pending → input disabled, cancel/stop button shown.

**Tests**
- `src/test/commandBarMic.test.ts`
- `src/test/glassTextInteraction.test.ts`
- `src/test/glassHotkeySettings.test.ts`
- `tests/e2e/glass-critical.spec.ts` — tests 1–3, 13–14
- Manual: `GLASS_QA.md` §Command bar

---

## 4. Direct response

**Trigger**
- User submits non-empty text from command bar → `submit-command` → main `submitCommand()` → `POST {iivoApiUrl}/api/glass/ask` with `responseStyle: "overlay"`, route `glass_direct` (not Council).
- Cancel while pending → `cancel-glass-ask`.

**User sees**
- Overlay thinking card (`glass-overlay-thinking-card`) while pending.
- Response card (`glass-overlay-response-card`) with inline answer above command bar.
- No browser opens automatically on success.

**Success**
- Answer appears inline within overlay feed.
- No Council-format markers (no multi-agent sections) in direct overlay style.
- Session timeline records command + response when a session is active.
- Answer is readable, on-brand, and does not leak raw API errors to UI.

**Failure**
- Server unreachable / API error → error feed card + optional “Open in IIVO”.
- User cancel → pending cleared; card may auto-dismiss (see §6).
- Timeout → honest error state, never infinite “thinking”.

**Tests**
- `src/test/glassAskClient.test.ts`
- `src/test/glassAskTypes.test.ts`
- `src/test/commandFeed.test.ts`
- `tests/e2e/glass-critical.spec.ts` — **“2 — command bar direct answer renders inline”**, **“3 — cancel pending ask”**
- `tests/e2e/glass-live.spec.ts` (live server)
- Scripts: `scripts/glass-qa-live.mjs`, `scripts/glass-qa-auto.mjs`
- Manual: `GLASS_QA.md` §Direct Response

---

## 5. Pin

**Scope note:** Pin is an **overlay response-card** action (`OverlayFeedCard`). It is not a panel Setup row or Connect option.

**Trigger**
- User clicks **Pin** on an overlay response card → `pin-command-feed-item` `{ id, pinned: true }`.
- **Unpin** toggles `pinned: false`.

**User sees**
- Pinned cards get `overlay-feed-card--pinned` styling.
- Button label toggles Pin ↔ Unpin.

**Success**
- Pinned item remains visible when feed prunes or auto-dismiss runs.
- `commandFeed[].pinned === true` for that item.

**Failure**
- N/A (local state only; cannot fail network-wise).

**Tests**
- `src/test/commandFeed.test.ts` (pinned flag logic)
- `tests/e2e/glass-contract.spec.ts` — **“pin survives 17s auto-dismiss”** (§5)
- Manual: `GLASS_QA.md` (pin step)

---

## 6. Auto-dismiss

**Scope note:** Auto-dismiss is **overlay feed timing** (`useGlassNotification`). It is not a panel setting.

**Trigger**
- Unpinned overlay chat feed items (response, thinking, error cards) start dismiss timer on display.
- Hover pauses timer; unpin exempts from removal.
- IPC `dismiss-overlay-chat` removes aged unpinned chat kinds.

**User sees**
- Card fades (~380ms) and disappears after timeout when not pinned and not hovered.
- Toasts (capture, listen, moments) use shorter TTLs.

**Success**
- Unpinned response cards clear from overlay after **17s** (`CHAT_AUTO_DISMISS_MS`).
- Pinned cards stay until user unpins or dismisses manually.
- Cancelled ask card also clears after timeout.

**Failure**
- User pins or hovers → card remains (intentional).
- Multiple cards → oldest unpinned pruned first (`MAX_VISIBLE_FEED = 5`).

**Tests**
- `src/test/glassNotifications.test.ts`
- `src/test/overlayPointerPolicy.test.ts`
- `tests/e2e/glass-critical.spec.ts` — **“3 — cancel pending ask”** (partial: 3.5s wait, not full 17s)
- `tests/e2e/glass-contract.spec.ts` — **“unpinned response auto-dismisses after 17 seconds”** (§6)
- `tests/e2e/glass-contract.spec.ts` — **“pin survives 17s auto-dismiss”** (§5 + §6)
- Manual: `GLASS_QA.md`

---

## 7. Remember this

**Scope note:** Remember this is an **overlay response-card** button (`glass-remember-this`). It is not a panel Setup action.

**Trigger**
- User clicks **Remember this** on overlay response card (`data-testid="glass-remember-this"`) → `saveResponseToMemoryVault()` → `POST {iivoApiUrl}/api/memory` with `type: "evidence"`, `sourceType: "glass"`.

**User sees**
- Button states: “Remember this” → “Saving…” → “Saved” (disabled) or “Failed — tap to retry”.

**Success**
- HTTP 2xx → button shows **Saved** and does not re-post on repeat click.
- Memory entry contains question + answer content.

**Failure**
- Network / 4xx / 5xx → **Failed — tap to retry**.
- Empty content → error before fetch (no silent no-op).

**Tests**
- `src/test/iivoMemoryClient.test.ts`
- `tests/e2e/glass-contract.spec.ts` — **“remember this saves to memory vault”** (§7)
- Manual: `GLASS_QA.md` (if documented)

---

## 8. Council handoff (View full council / Open in IIVO)

**Trigger**
- User clicks **Open in IIVO** on overlay card (`data-testid="glass-overlay-open-iivo"`) → `open-feed-in-iivo` → create Context Bridge item → `buildLensAskUrl` → `openGlassHandoffUrl()`.
- Visual ask handoff uploads screenshot **only on click**, not before.
- Session flows may use `session-open-in-iivo` or Analyze Now → Council with browser fallback.

**User sees**
- Default browser opens `https://iivo.ai/dashboard?lensAsk=<contextId>` (or configured `IIVO_WEB_URL`).
- Notice: “Opened in IIVO with this answer attached.”
- Clipboard fallback URL if browser blocked.

**Success**
- Handoff URL opens with correct `lensAsk` / context id.
- Context body includes Question + Answer text.
- No browser open until explicit user click (E2E enforced).

**Failure**
- Browser blocked → clipboard copy + user-visible notice.
- Upload/handoff error → `lastError` on card + Open in IIVO still offered where possible.

**Tests**
- `src/test/glassBrowserHandoff.test.ts`
- `src/test/iivoAnalysisClient.test.ts`
- `src/test/config.test.ts`
- `tests/e2e/glass-critical.spec.ts` — **“6 — Open in IIVO only on user action”**, **“6b — visual Open in IIVO uploads screenshot on click only”**
- Optional live: `IIVO_GLASS_E2E_REAL_HANDOFF=1`
- Manual: `GLASS_QA.md` §Handoff

---

## 9. Listen Mode

**Trigger**
- Panel Copilot → **Listen** mode card (`glass-mode-card-listen`) → `applyModePreset(listen)` → session start, system audio capture, optional countdown (`listenCountdownSeconds`), STT via server.
- Command bar mic / “Stop Listening” / `stop-everything`.
- Quick path: command bar system audio pickers.

**User sees**
- Listen mode card active in panel.
- Command bar: “Listening …” pulse, duration, source label (microphone vs system audio).
- Optional countdown overlay before capture starts.
- Insight cards on overlay; floating Notes pad when enabled.
- Copilot overlays for limits, silence prompts, endurance.

**Success**
- `privacy.listening === true` while active.
- STT chunks append to transcript; listen moments produce overlay cards.
- Stop Listening / Stop Everything returns to idle listening state.

**Failure**
- System audio not routed → setup prompt (BlackHole / virtual device guidance).
- Mic denied → settings action row, no fake “listening”.
- Thin/empty transcript → local hint instead of hallucinated ask.

**Tests**
- `src/test/listenModeRuntime.test.ts`
- `src/test/listenCountdown.test.ts`
- `src/test/listenMomentIntelligence.test.ts`
- `src/test/listenLiveHarness.test.ts`
- `src/test/voiceModeWiring.test.ts`
- `src/test/sessionCopilot.test.ts`
- `tests/e2e/glass-modes.spec.ts` — Listen / Meetings setup paths
- `tests/e2e/glass-copilot.spec.ts` — session + stop listening
- `tests/e2e/glass-critical.spec.ts` — **“5 — Stop Everything clears listening state”**
- Scripts: `scripts/glass-qa-listen-live.mjs`, `scripts/glass-qa-listen-preflight.mjs`, `scripts/lib/glass-listen-live-glass.mjs`
- Manual: `GLASS_QA.md`, `LISTEN_MODE_ARCHITECTURE.md`

---

## 10. Live Notes

**Trigger**
- Active Listen session → `buildListenLiveNotes()` on transcript/moment updates; refresh every ~10–20s on growth.
- Shown in panel **Live Notes** tab and floating `NotesPad` window.

**User sees**
- Structured sections: topic, key ideas, actions, questions, checkpoints, timer.
- Empty states: “building…” / “developing” while transcript is thin.
- Notes pad header: “IIVO Notes · Live from system audio”.

**Success**
- Sections populate from listen moments + transcript chunks (not static placeholder).
- Notes update as meeting progresses.

**Failure**
- Empty or unclear transcript → honest empty state + `unclearTranscriptNote` hints.
- Listen stopped → notes remain in session but stop live refresh.

**Tests**
- `src/test/listenLiveNotes.test.ts`
- `src/test/listenStreamingNotes.test.ts`
- `src/test/listenMeaningNote.test.ts`
- Scripts: `scripts/glass-qa-listen-live.mjs`
- **E2E: UNCOVERED** (no dedicated live-notes spec)
- Manual: `GLASS_QA.md` Listen sections

---

## 11. Live Translate

**Trigger**
- Panel Copilot → Quick Tools → **Translate** (`glass-quick-tool-translate`) → `TranslateModeSetup` → `translate-set-config`, `translate-start`, `translate-stop`.
- Command bar translate button toggles media translate (starts system audio if needed).
- `stop-everything` stops translate runtime.

**User sees**
- Setup: Media vs Conversation mode, target language, display mode, Start/Stop.
- Caption overlay (`glass-live-translate-captions`) with language pair + original/translated lines.
- Command bar translate status strip when active.

**Success**
- Captions appear in target language after start (mock or live STT+translate).
- Stop clears captions and translate runtime state.
- Language pair label matches config.

**Failure**
- Conversation mode without mic → warning before start.
- Server/translate API down → error surfaced, no infinite captions.

**Tests**
- `src/test/liveTranslate.test.ts`
- `tests/e2e/glass-translate.spec.ts` — full suite (6 tests)
- Script: `npm run glass:qa:translate:manual`
- Manual: `GLASS_QA.md` Translate section

---

## 12. Visual Ask

**Trigger**
- Screen-intent prompts (`shouldCaptureScreenForGlassAsk` in `glassVisualIntent.ts`) or explicit visual voice route in `submitCommand()`.
- Pipeline: preflight → display capture → JPEG optimize → `POST /api/glass/ask` with image attachment.

**User sees**
- Command bar: “Looking…”
- Overlay: `glass-overlay-looking-card`, optional “Optimizing screen image…”
- Answer references on-screen content; retention line in command bar when applicable.

**Success**
- Inline answer uses screen context (not generic-only when capture succeeded).
- 413 payload too large → automatic downscale retry, then answer.
- Permission granted path completes without crash.

**Failure**
- Screen Recording denied → honest message + **Open Screen Recording Settings** action.
- Vision disabled on server → setup row shows not ready + text-only fallback message.
- Capture timeout → error card, no fake visual answer.

**Tests**
- `src/test/glassScreenContext.test.ts`
- `src/test/visualAskFlow.test.ts`
- `src/test/visualAskPreflight.test.ts`
- `src/test/visualAskDiagnostics.test.ts`
- `src/test/visualImageCrop.test.ts`
- `tests/e2e/glass-critical.spec.ts` — tests 7–9, 11–12
- Scripts: `scripts/glass-qa-live-answers.mjs`
- Manual: `GLASS_QA.md` §Visual Ask

---

## 13. Screen context

**Trigger**
- Derived from latest screenshot, visual-ask phase, and capture state via `buildGlassScreenContextStatus()`.
- Manual **Capture** in panel also updates context.
- Shown in panel status grid (`screen_context`) and command bar accessory line.

**User sees**
- Status grid **Screen** cell: none / captured (age) / looking / visual ready / permission error.
- Command bar line: e.g. “Screen used for this answer · Not saved” with auto-hide after 10s when applicable.

**Success**
- After visual ask or manual capture, label reflects captured state with age or “visual ready”.
- Diagnostics show JPEG size / crop mode when in dev/diagnostic mode.

**Failure**
- No capture → “no capture” / none state (not misleading “ready”).
- Stale capture → age shown; user can re-capture.

**Tests**
- `src/test/glassScreenContext.test.ts`
- `src/test/panelStatusGrid.test.ts`
- `src/test/glassLatestScreenshot.test.ts`
- `tests/e2e/glass-critical.spec.ts` — test 7 (state check)
- Manual: `GLASS_QA.md` Visual Ask step 12

---

## 14. Connect panel (server, vision, STT green)

**Trigger**
- Dock → Open Panel → Setup tab → **CONNECT IIVO GLASS** (`data-testid="glass-run-setup-check"`) → `connectIivoGlass()` → virtual device scan + `run-setup-check` (health + probes).
- Silent auto-check on launch (`scheduleInitialSetupCheck`).

**User sees**
- Button: CONNECTING… → **IIVO GLASS CONNECTED** (green dot) when `data-connected="true"`.
- Setup rows with severity dots: Server, STT, Vision, Screen Recording, Mic, System Audio, etc. (`glass-setup-row-*`).
- Summary text after check completes.

**Success**
- Server row: **Online** (green) when `GET /api/health` succeeds.
- STT row: **Ready** when server has OpenAI key configured.
- Vision row: **Ready** when server vision enabled.
- Connected state requires server online + system audio path resolved + no blocking error summary.

**Failure**
- Server offline → Offline row + retry via Connect.
- Vision disabled → row shows disabled with explanation (not fake green).
- Virtual audio missing → guided install/routing actions (`glass-setup-action-*`).

**Tests**
- `src/test/glassCapabilities.test.ts`
- `src/test/glassServerHealth.test.ts`
- `src/test/captureDiagnostics.test.ts`
- `src/test/systemAudioUi.test.ts`
- `tests/e2e/glass-critical.spec.ts` — tests 4, 10–11, 15; helper `connectIivoGlassForE2e` in `tests/e2e/helpers/electronApp.ts`
- Scripts: `scripts/glass-qa-listen-preflight.mjs`
- Manual: `GLASS_QA.md` §Setup & permissions

---

## 15. Settings (API URL, profile)

**Scope note:** Glass reads **API URL from environment** (`IIVO_API_URL` / `IIVO_WEB_URL` in `.env` or packaged config). There is **no in-app URL editor**. First-run profile capture is **Electron onboarding only** (see §2); there is no in-app profile editor after calibration. Glass panel exposes layout, privacy, hotkey, and display settings.

**Trigger**
- Env vars at launch via `resolveConfig()` in `config.ts`.
- Panel Setup / Status: `GlassLayoutSettings` — hotkey preset, display target, save-visual-asks, auto-upload captures.
- IPC: `set-glass-hotkey`, `set-glass-display`, settings persistence to userData.

**User sees**
- “Glass layout” section: hotkey dropdown, display select (`glass-display-select`), privacy checkboxes.
- Diagnostics tab: listening controls, operation footer.
- Server errors reference configured URL indirectly (not editable in UI).

**Success**
- Settings persist across relaunch (`persistGlassUserSettings`).
- Hotkey/display changes apply immediately.
- Invalid display target sanitized on load.

**Failure**
- Hotkey registration failure → panel hint; app remains usable.
- Bad env URL → Connect panel shows server Offline (not silent failure).

**Tests**
- `src/test/glassSettings.test.ts`
- `src/test/config.test.ts`
- `src/test/multiDisplay.test.ts`
- `tests/e2e/glass-critical.spec.ts` — test 14 (window metadata)
- `tests/e2e/glass-multidisplay.spec.ts`
- **In-app API URL editor: UNCOVERED** (not implemented)
- **Post-onboarding profile editor in Glass: UNCOVERED** (first-run capture only — see §2)

---

## 16. Update check on launch

**Trigger**
- `scheduleGlassUpdateChecks()` on app ready: check immediately, +5s, then every 30 minutes.
- Manual: Setup **System update** panel → Check for updates / Update now.
- Fetches `GET {iivoApiUrl}/api/glass/update` or local `glass-update-manifest.json`.
- Skipped when `IIVO_GLASS_E2E=1`.

**User sees**
- Setup panel: version status, “Check for updates”, “Update now” (`glass-setup-system-update`).
- When newer version available: overlay prompt (`glass-update-overlay`) with Update / Later.
- Apply opens DMG/installer and quits app.

**Success**
- Remote or local manifest with higher semver → `appUpdate.phase === "available"`, overlay shown.
- Apply → installer opens, app quits cleanly for install.

**Failure**
- Fetch fails → stays idle / “up to date” (no false “update available”).
- Apply error → `glass-update-error` message, phase returns to available.
- Dev unpackaged build → dev hint (no DMG required).

**Tests**
- `src/test/glassAppUpdate.test.ts`
- `scripts/write-glass-update-manifest.mjs` (packaging hook)
- **E2E: UNCOVERED** (update checks disabled in E2E)
- Manual: `GLASS_QA.md` packaging sections

---

## 17. Quit cleanly

**Trigger**
- User quits (⌘Q, Dock quit, or Update apply quit).
- `app.on("will-quit")` → unregister global hotkeys, clear update timer.
- E2E teardown: `closeGlassApp()` → browser.close → SIGTERM Electron → kill CDP port → close stub server.
- QA flows: `stop-everything` before quit stops listen/capture/translate/copilot.

**User sees**
- App exits; no lingering Glass menu bar icon or orphan windows.
- (E2E) Process exit code recorded; CDP port freed.

**Success**
- All Glass `BrowserWindow`s destroyed.
- No orphaned Electron/CDP/stub-server processes after E2E `afterAll`.
- Listen/capture/translate stopped before exit when user used Stop Everything.

**Failure**
- Stale CDP port → `killStaleProcessesOnCdpPort()` on next E2E launch.
- SIGTERM hang → SIGKILL after 2s in E2E helper.

**Tests**
- `src/test/glassOperations.test.ts` (stop-all state)
- E2E: implicit in all specs via `tests/e2e/helpers/launchGlassElectronForE2E.ts` `closeGlassApp`
- `tests/e2e/helpers/e2eSetupReset.ts` (`stop-everything` before scenarios)
- `tests/e2e/glass-contract.spec.ts` — **“quit leaves no orphaned Electron or CDP processes”** (§17)
- Manual: `GLASS_QA.md` “Quit and reopen Glass” persistence checks

---

## 18. Passive Context Engine

**Trigger**
- User asks a question from the command bar (`submit-command` → `submitCommand()` → `POST /api/glass/ask`).
- After each **successful** Glass response, main process records the prompt in the passive context log.

**User sees**
- Nothing explicit — answers gradually feel more tailored to how they use Glass.
- No forms or profile prompts after first-run onboarding (§2).

**Success**
- Context lives locally in Electron `userData/glass-context.json` via `glassContextStore.ts` (load/save) and `glassContextEngine.ts` (derive summary).
- Rolling log keeps the last **50** interactions (question, topic category, keywords).
- Derived summary rebuilds every **5** interactions (frequent topics, recent focus, inferred role).
- First **10** interactions may use onboarding seed from `glass-onboarding.json`; after that, derived context replaces seed.
- Each ask attaches `userContext` (derived summary string) on the Glass ask payload when non-empty; server prepends it to the model prompt.
- No server-side account storage — local only.

**Failure**
- Missing or corrupt `glass-context.json` → fresh empty profile; asks proceed without `userContext`.
- New user with no onboarding and no history → `userContext` omitted (nothing invented).

**Tests**
- `src/test/glassContextEngine.test.ts`
- `src/main/glassContextStore.ts` (persistence; wired from main `index.ts`)
- **E2E: UNCOVERED**

---

## Test map (quick reference)

| Layer | Location |
|-------|----------|
| Unit | `desktop-glass/src/test/*.test.ts` (~110 files; see `package.json` `"test"` script) |
| E2E | `desktop-glass/tests/e2e/glass-*.spec.ts` |
| E2E helpers | `desktop-glass/tests/e2e/helpers/` |
| QA scripts | `desktop-glass/scripts/` |
| Manual | `desktop-glass/GLASS_QA.md` |
| Web onboarding (retired) | `tests/visual/iivo-glass-onboarding.spec.ts` (skipped — see §2) |
| Web landing gate | `tests/visual/iivo-glass-landing.spec.ts` |

### E2E suite index

| File | Contract items primarily covered |
|------|----------------------------------|
| `glass-critical.spec.ts` | 1 (test 1), 3–4 (tests 2–3), 8 (tests 6, 6b), 9 (test 5), 12 (tests 7–9, 12), 13 (test 7), 14 (tests 4, 10–11, 15), 15 (test 14) |
| `glass-live.spec.ts` | 4 (live server) |
| `glass-modes.spec.ts` | 1, 9 (setup paths) |
| `glass-copilot.spec.ts` | 9 (session copilot) |
| `glass-translate.spec.ts` | 11 |
| `glass-multidisplay.spec.ts` | 15 (display) |
| `glass-contract.spec.ts` | 5, 6, 7, 17 (overlay behaviors — **not** `glass-critical` tests 5–6) |

**Common mistake:** `glass-critical` test **4** opens the panel Setup grid (§14). Tests **5** and **6** are Listen + Handoff (§9, §8) — **not** contract §5 Pin or §6 Auto-dismiss.

---

## Priority gaps (honest backlog)

These are the highest-value **UNCOVERED** items to close next:

1. **Live Notes E2E** — listen fixture → notes sections populate (§10)
2. **Update check E2E** — stub manifest newer semver → overlay appears (§16)
3. **Glass onboarding E2E** — full three-question flow in Electron (§2; skipped in `IIVO_GLASS_E2E=1` today)
4. **In-app settings** — API URL / profile editor inside Glass panel (§15)
5. **Glass → server context sync** — ✅ `userContext` on `/api/glass/ask` via passive context engine (§18); raw `userProfile` body still optional fallback on server

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-08 | Initial A–Z contract (17 features, test map, gap backlog) |
| 2026-06-07 | Onboarding moved to Electron (§2); closed Pin/Remember/Auto-dismiss/Quit E2E gaps (`glass-contract.spec.ts`) |
| 2026-06-07 | Disambiguated contract § numbers vs `glass-critical` test numbers; §5–§7 explicitly overlay-only (not panel) |
