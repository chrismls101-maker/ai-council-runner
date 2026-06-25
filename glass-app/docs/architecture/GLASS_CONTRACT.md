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

**Related docs:** `GLASS_QA.md` (manual QA), `LISTEN_MODE_ARCHITECTURE.md`, `GLASS_LIMITATIONS.md`, `GLASS_COMPANION.md`, `GLASS_COMPANION_PHASE4.md`, `GLASS_COMPANION_OMNIPARSER.md`

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
| 10 | Live Notes | ✅ Unit + scripts + E2E | — |
| 11 | Live Translate | ✅ Unit + E2E | — |
| 12 | Visual Ask | ✅ Unit + E2E | — |
| 13 | Screen context | ✅ Unit + E2E (partial) | — |
| 14 | Connect panel | ✅ Unit + E2E | — |
| 15 | Settings | ⚠️ Partial | No in-app API URL / profile |
| 16 | Update check | ⚠️ Unit only | Skipped in E2E |
| 17 | Quit cleanly | ✅ E2E | — |
| 18 | Passive Context Engine | ✅ Unit | No E2E |
| 19 | Meeting Intelligence | ✅ Unit (45 tests) + QA script | — |
| 20 | Wingman Mode | ✅ Unit (353 tests across 9 suites) + E2E spec + QA script | Inspect requires live screen; GitHub PAT requires real PAT |

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
- `src/test/iivoAnalysisClient.test.ts` (session analysis helpers in `sessionPayload.ts`)
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

## 19. Meeting Intelligence

**Trigger**
- User starts a session with Copilot mode set to **Meetings**. The meeting intelligence engine starts on the first transcript chunk that arrives.

**User sees**
- **Dock strip** — a second row beneath the main controls showing meeting status: `⬡ Building context…` pre-classification; `Sales Call · 4 moments ›` post-classification. Clicking opens the Copilot panel.
- **Overlay badge** — `IIVO Glass active · meetings` while the session is live.
- **Copilot panel** — `MeetingIntelPanel` with a detected-type badge, a "Change" button, a live moment feed grouped by schema section (with owner `→` and deadline labels), a "＋ Add moment" form, and `×` delete per moment.
- **Proactive notices** — `lastNotice` fires once when the type is first classified ("Meeting detected: Sales Call"); brief notices for new high-signal moments ("Decision captured", "Blocker noted", "Risk flagged", "Action → owner").
- **Debrief** — at session end, the structured moment feed replaces generic extraction. Sections follow the archetype schema order. AI enrichment prompt uses archetype-specific guidance and derives missing fields from the structured state.
- **IIVO send** — meeting report markdown is sent to IIVO as a `pasted_text` context item on debrief (best-effort, fire-and-forget).

**Meeting archetypes**

| Subtype | Label | Lead sections |
|---------|-------|---------------|
| `sales_external` | Sales Call | Deal Signals, Customer Pain, Action Items, Risks, Decisions |
| `team_internal` | Team Meeting | Decisions, Action Items, Blockers, Open Questions |
| `product_review` | Product Review | Decisions, Product Feedback, Action Items, Risks |
| `client_account` | Client Call | Commitments, Risks, Escalations, Action Items |
| `general` | General Meeting | Decisions, Action Items, Blockers, Risks, Open Questions |

**Classification**
- Fires once the transcript reaches `MEETING_CLASSIFY_MIN_CHARS` (~300 chars).
- One reclassification attempt allowed if the initial result is low-confidence and not yet manually overridden.
- User can override type via "Change" in the panel; moments are cleared and re-extracted under the new schema.

**Extraction**
- Runs every `MEETING_EXTRACTION_INTERVAL_MS` (15 s) on the transcript *delta* since the last pass.
- Minimum delta: `MEETING_EXTRACTION_MIN_DELTA_CHARS` (120 chars) — no-ops on thin deltas.
- Moments are deduped by `type:content` key (first 80 chars, lowercased).
- Returns the same object reference when nothing changed (reference-equality push gate).

**Manual editing**
- `×` button removes any moment immediately; `meeting-delete-moment` IPC command.
- "＋ Add moment" form: type selector (schema-ordered) + text input + Enter/Escape shortcuts; `meeting-add-moment` IPC command. Manually added moments are tagged `manualOverride: true`.

**Success**
- Classification fires within 2 ticks of threshold being crossed.
- Moments accumulate live; panel refreshes on each IPC push.
- Type change clears moments and restarts extraction cleanly.
- Debrief markdown leads with schema-ordered sections for the detected type.
- Meeting report appears in IIVO context library after session ends.

**Failure**
- Session ends before classification threshold → debrief falls back to generic `extractMeetingIntelligence` extraction. No crash.
- IIVO send fails → error swallowed; debrief unaffected.
- Engine returns same reference → no push, no UI flicker.

**Tests**
- `src/test/meetingClassifier.test.ts` — classification + reclassification paths
- `src/test/meetingIntelligenceEngine.test.ts` — 20 engine tests (delta gating, dedup, override, add/delete)
- `src/test/meetingReport.test.ts` — 25 report builder tests (section order, labels, icons, markdown, moment formatting)
- **E2E: UNCOVERED**

---

## 20. Wingman Mode

**Trigger**
- User activates Wingman from the mode card (or IPC `copilot-set-mode: diagnostic`), then starts a session via `wingman-start` with a stated task goal. Work mode has been removed — Wingman covers all general work use cases.

**User sees**
- **Inactive state** — a goal input ("What are we working on?"), auto-detected current app, and a "Start Wingman" button (disabled until a goal is entered). Privacy footer: "App titles tracked · Screenshots only when you inspect".
- **Active state** — pulsing active indicator, task goal display, duration counter, last inspection card ("What I see"), a prominent "Inspect Screen" button, "+ Add Note", and "End Session". Loop and scope drift warnings surface inline.
- **Report state** — structured session report: goal, duration, apps used, AI narrative summary, key findings, "Could not verify" section (always non-empty), warnings issued, and next steps. "New Session" button returns to inactive.

**Session lifecycle**

| IPC command | Effect |
|-------------|--------|
| `wingman-start { goal }` | Creates `WingmanSession`, starts 30s passive app snapshot interval |
| `wingman-inspect { prompt? }` | Captures screenshot, builds session-context-aware prompt, calls `askIivoGlass`, stores `WingmanInspection`, runs loop + scope drift detection |
| `wingman-add-note { content }` | Appends `WingmanNote` (source: "user") to session |
| `wingman-end` | Stops snapshot interval, sets `endedAt`, generates `WingmanReport` via AI |

**The "never verified" rule**
Glass can observe the screen; it cannot execute code or confirm claims. All Wingman AI output must use "observed"/"appears to" language. `WingmanInspection.confidence` is `"observed" | "inferred"` — never `"verified"`. The `buildWingmanReportPrompt` explicitly forbids "verified", "confirmed", "tested", or "proven" as positive assertions. The report always includes a "Could not verify" section even if no inspections ran.

**Passive app timeline**
Window title + app name polled every 30 seconds. Same app+title deduplicated within a 60-second window. No screenshots taken passively — only on user-triggered inspect. Privacy contract: app titles only.

**Loop detection**
Compares the last 2 inspections (within a 20-minute window) for 2+ shared error keywords. If triggered, `session.loopWarning` is set and a panel warning is shown. The report's `warningsIssued` includes the loop notice.

**Scope drift detection**
Four rule-pairs: UI task → payment/auth config, test task → production deploy, fix task → schema migration, deploy task → non-production environment. Fires on keyword matching between `goal` and `inspectionResponse`. Drift warning stored on the `WingmanInspection` and surfaced in the panel.

**Report structure**

| Field | Description |
|-------|-------------|
| `goal` | The user's original task goal |
| `duration` | Session duration in ms |
| `appsUsed` | Unique app names from passive snapshots |
| `summary` | AI-generated 3–5 sentence narrative (observed language) |
| `keyFindings` | Up to 4 items from inspections, observed language |
| `warningsIssued` | Loop + scope drift warnings from the session |
| `observedOnly` | Things seen on screen that cannot be confirmed without code execution |
| `notVerified` | Concrete verification actions the user must complete — never empty |
| `nextSteps` | Up to 3 concrete next steps |

**Success**
- Session activates immediately — no audio, no capture.
- App timeline accumulates passively at 30s intervals.
- Inspect returns a task-contextualised response referencing the goal and prior inspections.
- Loop detection fires and surfaces a warning on second occurrence of the same error.
- Session ends with a structured report that always includes a non-empty `notVerified` section.
- Work mode is absent from the user-facing mode grid.

**Failure**
- `wingman-end` with no active session → no-op.
- AI inspect fails → `inspecting` reset to false, `lastError` set. Session continues.
- AI report generation fails → fallback report generated with generic summary; `notVerified` still populated from checklist.

**v0.5.0 feature additions**
- **Cross-session memory** — `wingmanMemory.ts`: JSONL session store at `~/.iivo-glass/wingman-sessions.jsonl`; auto-saved on `wingman-end`; `wingman-search-sessions` IPC; past sessions surfaced in report view
- **Terminal awareness** — `terminalEvents.ts`: Accessibility API polls frontmost terminal (500ms); error/command events auto-appended as `WingmanNote`; hybrid panel with terminal events feed
- **Git diff** — `gitDiff.ts`: `git diff HEAD` at session end; file list, patch summary, scope indicator surfaced in report
- **Agent proxy** — `agentProxy.ts` + `agentProxyServer.ts`: local HTTP proxy intercepts agent API calls; consent modal on first enable; `wingman-agent-proxy-enable/disable` IPC; `agentCalls` in report
- **Claim verification** — `verificationEngine.ts` + `verificationRunner.ts`: extracts testable claims from AI narrative; runs shell/URL/file probes; verification badges in report
- **GitHub integration** — `githubTypes.ts` + `githubClient.ts` + `githubService.ts`: PAT encrypted via `safeStorage`; PR + CI check rollup fetched at session end; PR context section in report
- **GitHub PAT settings UI** — `GitHubPATSection` component in `WingmanPanel.tsx`: 5 states (nudge → editing → saving → connected → token-invalid); `dismissedInvalid` bug fix; CSS-drawn padlock; inline "Update token" link

**Tests**
- `src/test/wingmanSession.test.ts` — 41 unit tests: session factory, snapshot dedup, deriveAppsUsed, detectLoop, detectScopeDrift, buildVerificationChecklist, buildWingmanReport structure, buildWingmanReportPrompt language contract, confidence type contract
- `src/test/wingmanMemory.test.ts` — 24 unit tests: JSONL round-trip, append, list, search, prune
- `src/test/terminalEvents.test.ts` — 37 unit tests: terminal output parser, event builders, dedup, severity classification
- `src/test/gitDiff.test.ts` — 45 unit tests: patch parser, scope analysis, file type classification, prompt formatter
- `src/test/agentProxy.test.ts` — 51 unit tests: request/response minimization, scope analysis, call builder, prompt formatter
- `src/test/verificationEngine.test.ts` — 63 unit tests: claim extractors, verdict types, result aggregation, confidence model
- `src/test/githubTypes.test.ts` — 46 unit tests: parseGitHubRemote (HTTPS/SSH/GHE), reviewDecision helpers, checkRollup helpers, parseReviewDecision, deriveCheckRollupStatus, truncatePRBody
- `src/test/githubClient.test.ts` — 6 unit tests: HTTP client contract
- `tests/e2e/glass-wingman.spec.ts` — 14 E2E tests: mode card visibility, default state, wingman-start/end, active/inactive/report panel states, add note via UI and IPC, no audio during session, report generation
- `scripts/glass-qa-wingman.mjs` — QA script (§1–§14): server reachability, pre/post conditions, start/note/end lifecycle, v0.5.0 session fields, report structure, "never verified" language contract, cross-session memory, post-condition cleanup, GitHub PAT management, verification results shape

---

## 21. Glass Companion (Aletheia)

**Trigger**
- User taps **Aletheia** on the builder strip (toggle on / toggle off). Not hold-to-talk; not the command bar mic (Voice Mode).

**User sees**
- Strip status: `Aletheia · Listening`, `Aletheia · Listening · + audio` (when machine audio active), `Looking`, `Thinking`, `Speaking`, or `Step N of M` during multi-step scripts.
- **Identity:** Aletheia (intelligence of Glass). **Voice:** Matilda via ElevenLabs (`glass-tts` / `glass-tts-timed`).
- Ephemeral overlay highlights (glow, spotlight, callout, trace, cursor, magnifier, sketch, arrow, path) synced to speech or script beats.
- **Glass Response Panel** opens for depth asks (generate, draft, plan) and substantial markdown answers.
- ✕ dismiss on presence layer.

**Session behavior**

| Turn type | Behavior |
|-----------|----------|
| Direct ask | Aletheia answers via `GLASS_COMPANION_SESSION_APPEND` + direct ask; short spoken default |
| Depth ask | `responseStyle: full` + Response Panel + short spoken summary |
| Visual ask | Capture → AX/DOM/OmniParser UiMap → vision ` ```companion` JSON → overlay + timed TTS |
| Retarget ("that one") | Reuse recent capture if same app + < 15s; partial replan; crossfade highlight |
| Multi-step script | Model returns `steps[]`; Matilda plays each beat; "next"/"okay" advances ack gates |
| Follow-up | Text-only replan with session memory; no fresh capture |
| Listen-in / setup | User says "listen in on this video" → **one-sentence ack**, then silent until mic question |
| Machine audio | Transcribed silently into `recentTranscript`; **never** auto-speaks or auto-asks |

**Warm-up (OmniParser cold start)**
- Warming: *"One moment — I'm opening my sight."*
- Ready (once): *"I'm Aletheia. I'm with you — what do you need?"*
- Skip if OmniParser off or already warm.

**IPC**

| Command | Effect |
|---------|--------|
| `toggle-companion-mode` | Flip session; warm OmniParser; clear presence + memory when off |
| `clear-companion-presence` | Remove highlights; stop anchor watch |
| `glass-tts-timed` | Segment-synced Matilda for guidance plans |
| `submit-command` + `companionRoute` | Retarget / follow-up routing hint |
| `stop-everything` | Aletheia off + presence + memory cleared |

**Success**
- Toggle on → mic listens continuously; optional parallel machine-audio transcription when loopback configured.
- User speaks on mic → Aletheia responds (never unprompted from machine audio alone).
- Visual questions produce spoken answer + spatial highlights anchored to screen regions.
- Retarget corrections move highlight without full "let me look…" when memory is valid.
- "Walk me through…" can produce multi-step scripts with crossfade between beats.
- Highlights clear after speech/script end, dismiss, anchor drift, or Aletheia off.

**Failure**
- Mic permission denied → error status; no silent capture.
- Screen capture denied → visual ask error card; no fake answer.
- ElevenLabs unavailable → falls back to untimed TTS; presence may be segment-unsynced.
- Window moves during guidance → highlights invalidated; user re-asks to re-ground.
- OmniParser sidecar not installed → AX/DOM + vision only (expected).
- Machine audio not configured → mic-only; Aletheia still works.

**Distinction**
- **Voice Mode** — command bar mic entry; same routing primitives, separate session.
- **Wingman** — long work session, timeline, structured report; not live overlay teacher.
- **Listen** — passive capture mode; Aletheia uses machine-audio transcript as context but different entry point.

**Tests**
- `src/test/glassCompanion.test.ts` — speech, status labels, depth/panel helpers, system-audio auto-start
- `src/test/companionGuidance.test.ts` — parse + resolve
- `src/test/companionPhase25And3.test.ts` — merge, timed presence
- `src/test/companionPhase4a.test.ts` — memory + retarget routing
- `src/test/companionPhase4bcd.test.ts` — scripts, rich types, anchor drift
- `src/test/companionOmniParser.test.ts` — sidecar adapter + parse response
- **E2E: UNCOVERED** — manual QA in `GLASS_COMPANION.md` + `GLASS_COMPANION_E2E_REVIEW_PROMPT.md`

**Related**
- [`GLASS_COMPANION.md`](GLASS_COMPANION.md) — full spec Phases 1–4
- [`GLASS_COMPANION_OMNIPARSER.md`](GLASS_COMPANION_OMNIPARSER.md) — OmniParser sidecar (Spike 2/3, Installations tab)

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
| `glass-wingman.spec.ts` | 20 |

**Common mistake:** `glass-critical` test **4** opens the panel Setup grid (§14). Tests **5** and **6** are Listen + Handoff (§9, §8) — **not** contract §5 Pin or §6 Auto-dismiss.

---

## Priority gaps (honest backlog)

These are the highest-value **UNCOVERED** items to close next:

1. **Meeting Intelligence E2E** — simulate transcript chunks → assert dock strip, panel badge, moment feed, debrief sections (§19)
2. **Live Notes E2E** — listen fixture → notes sections populate (§10)
3. **Update check E2E** — stub manifest newer semver → overlay appears (§16)
4. **Glass onboarding E2E** — full three-question flow in Electron (§2; skipped in `IIVO_GLASS_E2E=1` today)
5. ~~**In-app settings** — API URL / profile editor inside Glass panel (§15)~~ ✅ Done (v0.3.0)
6. **Glass → server context sync** — ✅ `userContext` on `/api/glass/ask` via passive context engine (§18); raw `userProfile` body still optional fallback on server
7. ~~**Wingman Mode** — full Wingman session lifecycle, panel 3 states, language contract~~ ✅ Done (v0.4.0)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-12 | **v0.5.0** — §20 Wingman v0.5.0 (Tasks #61–#116): Cross-session memory (`wingmanMemory.ts`, JSONL store, `wingman-search-sessions` IPC, past sessions in report); terminal awareness (`terminalEvents.ts`, Accessibility API 500ms poll, error auto-note, hybrid panel design); git diff (`gitDiff.ts`, `git diff HEAD` at session end, file list + scope indicator in report); agent proxy (`agentProxy.ts` + `agentProxyServer.ts`, local HTTP proxy, consent modal, `wingman-agent-proxy-enable/disable`, `agentCalls` in report); claim verification (`verificationEngine.ts` + `verificationRunner.ts`, shell/URL/file probes, verification badges in report); GitHub integration (`githubTypes.ts` + `githubClient.ts` + `githubService.ts`, PAT via `safeStorage`, PR + CI check rollup at session end, PR context section in report); GitHub PAT settings UI (`GitHubPATSection`, 5 states, `dismissedInvalid` bug fix, CSS-drawn padlock, inline "Update token" link); QA script updated §1–§14; 353 unit tests across 9 new suites. Total: 1,394 tests / 0 failures. |
| 2026-06-11 | **v0.4.0** — §20 Wingman Mode (Tasks #43–#60): Full Wingman build — `WingmanSession` type system + business logic (`wingmanSession.ts`); 4 IPC commands (`wingman-start`, `wingman-inspect`, `wingman-add-note`, `wingman-end`); passive app snapshot accumulator (30s interval, 60s dedup); task-aware visual ask with session context; loop detection (2+ shared error keywords within 20 min); scope drift detection (4 rule-pairs); verification checklist generator; AI session report with `notVerified` section; `WingmanPanel.tsx` (3 states: inactive/active/report); wired into `CopilotPanel`; Work mode removed from `GlassModeId`, `GLASS_MODE_PRESETS`, `GLASS_MODE_ORDER`, `GLASS_MODE_ICONS`, `deriveActiveMode()`, and all tests; Dock color map updated; CSS for all 3 panel states; 41 unit tests; 14 E2E tests (`glass-wingman.spec.ts`); QA script (`glass-qa-wingman.mjs`); §20 contract section. Total: 1,089 tests / 0 failures. |
| 2026-06-11 | **v0.3.0** — §15 Settings UI (Task #42): `GlassUserSettings` extended with `iivoApiUrl?`/`iivoWebUrl?`; `parseGlassServerUrl()` validates and normalises http(s) URLs; `set-glass-server-urls` IPC command mutates `config` at runtime and persists to `glass-settings.json`; URL fields added to `GlassState` and state push snapshot; saved overrides applied at boot after `loadGlassUserSettings()`; `ServerUrlEditor` React component added to panel `StatusGrid` with `data-testid` attributes for E2E; `fallbackState` in `useGlassState.ts` filled from `DEFAULT_CONFIG`. §15 coverage now ✅. |
| 2026-06-11 | **v0.2.9** — §10 Live Notes Playwright E2E suite (Task #40): `tests/e2e/glass-live-notes.spec.ts` — 10 tests covering listen mode setup, listenLiveNotes state appearance, listeningStatus transitions, transcriptChunkCount increments, rollingPreview accumulation, idle-after-stop, persistence after stop-listening, NotesPad window visibility, tab controls, and debrief trigger with listen context. §10 coverage now ✅. |
| 2026-06-11 | **v0.2.8** — Meeting Intelligence real-audio QA script (Task #41): `scripts/glass-qa-meeting-live.mjs` — exercises full pipeline via inject→tick→classify→extract→debrief with 3 canned scenarios (sync, sales, product); asserts classification subType, required moment types (decision + action_item), debrief section presence; 4 npm scripts added (qa:meeting:live, :attach, :sales, :product). §19 coverage upgraded from unit-only to unit + QA script. |
| 2026-06-11 | **v0.2.7** — Notes+translate simultaneous coexistence stress test (Task #39): `notesTranslateConcurrent.test.ts` — 14 tests across 6 suites verifying state isolation, concurrent chunk delivery, translate-stop invariance, active-flag independence, interim fragment handling, and 100-round high-volume stress run. `liveTranslateGrace.test.ts` also added to test runner. Total test count: 1048 |
| 2026-06-11 | **v0.2.6** — §16 Update check E2E coverage (Task #38): 14 new tests in `glassUpdateCheck.e2e.test.ts` covering checking→available phase transition, manifest parsing, dismiss flow (available→dismissed), install-on-quit phase (available→installing→available on error), DMG fallback notice, downloading phase, and in-flight check guard |
| 2026-06-11 | **v0.2.5** — Proactive media context re-capture (Task #37): `proactivelyCaptureMediaContext()` lightweight helper (title/URL only, no vision AI); auto-triggered 2s after `bootstrapListenNotesPipeline` / `ensureListenNotesLoopRunning`; retries every 30s from the listen notes loop until a title is found; never clobbers existing context on failure |
| 2026-06-11 | **v0.2.4** — Deepgram WS keepalive/reconnect (Task #36): `DeepgramStreamingSession` now sends KeepAlive pings every 8s when audio goes idle (prevents ~10s Deepgram idle timeout); listens to `close` event and fires new `onClose` callback on unexpected disconnect; both translate and listen sessions wire `onClose` to restart the session automatically; translate-start refactored to use `makeTranslateCallbacks` factory so all retry/reconnect paths share identical callbacks |
| 2026-06-11 | **v0.2.3** — Live session bug fixes: (1) translate-stop no longer kills listen mode audio when Live Notes pipeline is active; session-resume restarts audio if listen mode is active; (2) `startListenDeepgramSession` now retries on connect failure (2 attempts, 1.5s delay) matching translate retry pattern; (3) translation lag fixed — non-final Deepgram chunks always show as interim caption preview regardless of source/target language; (4) debrief loading notice shown immediately before AI call; debrief scrollbar styled dark to match command bar; platform shown as human-readable label (YouTube/Podcast/etc.) |
| 2026-06-11 | **v0.2.2** — §19 corrections logging (`meeting-corrections.jsonl`), type-override notice (`Re-scanning as …`), `meetingIntelligenceFlow.test.ts` E2E suite (25 tests: all 5 archetypes, AI override, regex fallback, parseExtractionResponse robustness, shouldRunExtractionPass, dedup, manual add/delete, type override) |
| 2026-06-11 | **v0.2.1** — §19 AI extraction upgrade: `meetingExtractionPrompts.ts` prompt builder + response parser; `runMeetingIntelTick` async with `askIivoGlass` call (9s timeout, in-flight guard, regex fallback on failure); engine `extractionOverride` param; `shouldRunExtractionPass` export; `owner`/`deadline` threaded into `MeetingMoment` |
| 2026-06-11 | **v0.2.0** — §19 Meeting Intelligence added: classifier, engine, panel, debrief wiring, IIVO send, manual moment editing, archetype-aware AI prompt, proactive notices |
| 2026-06-08 | Initial A–Z contract (17 features, test map, gap backlog) |
| 2026-06-07 | Onboarding moved to Electron (§2); closed Pin/Remember/Auto-dismiss/Quit E2E gaps (`glass-contract.spec.ts`) |
| 2026-06-07 | Disambiguated contract § numbers vs `glass-critical` test numbers; §5–§7 explicitly overlay-only (not panel) |
