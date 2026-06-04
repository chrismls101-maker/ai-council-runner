# IIVO Glass — Manual QA Checklist (v1)

IIVO Glass is a transparent desktop overlay companion for IIVO. It **observes
first** — it never captures or sends anything without an explicit click.

## Prerequisites

1. Start the IIVO core (from repo root): `npm run dev`
   - Runs the API on `http://localhost:3001` and the web app on
     `http://localhost:5173` concurrently.
2. Install Glass deps once (from repo root): `npm run glass:install`
3. Start Glass (from repo root): `npm run glass:dev`
   - Optional config: `IIVO_WEB_URL` and `IIVO_API_URL` env vars.
3. macOS only: grant **Screen Recording** permission to the Glass app
   (System Settings → Privacy & Security → Screen Recording) for screen capture.

## Checklist

1. **Open Glass app** — `npm run glass:dev` launches the floating dock.
2. **Overlay/dock appears always on top** — dock floats above other windows,
   including full-screen apps.
3. **Underlying screen remains clickable** — clicking anywhere outside the dock
   and panel interacts with the app underneath (no full-screen blocking layer).

## Full-screen overlay architecture

IIVO Glass uses **four separate windows**:

1. **Overlay** — full-screen transparent layer (`display.workArea`), click-through by default
2. **Command bar** — bottom-centered floating input (`display.workArea`), clickable/typeable
3. **Dock** — compact draggable controls (`display.workArea`)
4. **Panel** — optional status/detail view, hidden until opened

## Bottom command bar (primary interaction surface)

The command bar is a separate `BrowserWindow` floating over the click-through
overlay. It is the main way to talk to IIVO while you work — like Spotlight/Jarvis
for IIVO. The side panel is now **secondary** (status + diagnostics).

Expected UX:

- Full-screen click-through overlay (you can click apps behind it).
- A bottom-centered command bar near the bottom of the screen.
- You can click/type into the command bar (voice button · input · **Ask ↑**).
- Clicking the overlay **outside** the command bar/dock/panel reaches the app behind.
- The voice/listening button lives **outside** the panel.
- **Stop Listening** is always visible on the command bar while listening.
- The side panel is status/diagnostics focused, not the main input.

### Command bar manual QA

1. Launch IIVO server (`npm run dev`).
2. Launch Glass (`npm run glass:dev`).
3. Confirm the transparent overlay is **click-through**.
4. Confirm the **bottom command bar** appears near bottom center.
5. Click behind the overlay **outside** the command bar — should interact with the app behind.
6. Click the command bar input — should accept typing (window focuses).
7. Type: **“What am I working on?”** and press **Enter** / **Ask**.
8. Confirm an **inline overlay response card** appears **without** opening the browser automatically.
9. Press the **voice button** → choose **Microphone** or **System Audio** → **Start**.
10. Confirm **Stop Listening** + a listening timer appear on the command bar.
11. Click **Stop Listening** — listening stops.
12. Press **Escape** in the input — the bar blurs (clicks pass through again).
13. Press **Cmd+Shift+Space** (or **Option+Space**) — the command bar focuses for typing.
14. Open the panel and confirm it is **status/control focused** (System status grid,
    Open in IIVO, Analyze Now, Capture, Stop Everything, diagnostics) — not a crowded
    primary command surface.

## Direct Response v1 (inline IIVO answers — direct-only)

### Automated QA (no GUI / permissions required)

Run from repo root:

```bash
npm run glass:qa:auto
npm run test:glass-ask
npm run glass:test
npm run glass:qa:smoke
npm run glass:e2e
npm run glass:e2e:headed
npm run glass:e2e:debug
```

`glass:qa:auto` prints a JSON report covering layout/config/direct-ask guards.

**Electron E2E** (`glass:e2e`) launches the real Glass desktop app with a stub IIVO server and verifies:

- App launch and overlay / command bar / dock windows
- Command bar ask → thinking card → inline response card
- No browser auto-open on normal direct ask
- Cancel pending ask
- Panel open + status grid
- Stop Everything clears listening state
- Open in IIVO only on user click (URL captured, not launched)
- Window layout bounds (overlay = workArea, command bar bottom-centered)

Skipped automatically in CI unless `GLASS_E2E_FORCE=1`. Requires `npm run glass:build` first (the e2e script builds automatically).

### Human-only QA (permissions + real desktop)

These cannot be automated — they require user action on macOS:

- **Screen Recording** permission (System Settings)
- **Microphone** permission
- **System audio** loopback / virtual device setup
- Real **click-through** feel on your desktop/apps
- Live **OpenAI STT** with server key
- Full visual polish and multi-monitor manual verification

Expected UX:

- Command bar asks IIVO via `POST /api/glass/ask` using **one direct OpenAI call** (`routeUsed: glass_direct`).
- **No Council**, no workflow router, no Sales Attack / Product Decision formatting.
- **Inline answer** appears on the overlay without opening the browser first.
- Response card supports **Copy**, **Pin**, **Save Moment**, **Expand** (long answers), **Open in IIVO**.
- Pending ask shows **Cancel** on the command bar; cancelled requests show **Request cancelled.**
- On server failure, error card shows with **Open in IIVO** fallback (no silent fail).
- Session stores `iivo_command` + `iivo_response` events when a session is active.
- **Analyze Now** remains separate (Council/deep analysis) — not used by command bar asks.

### Direct Response manual QA

1. Start IIVO server (`npm run dev`) with `OPENAI_API_KEY` configured.
2. Start Glass (`npm run glass:dev`).
3. Confirm overlay click-through still works.
4. Type in command bar: **“What am I working on?”** and submit.
5. Confirm **“IIVO is thinking…”** card appears.
6. Confirm **inline answer card** appears **without** opening the browser automatically.
7. Confirm answer has **no Council formatting** (no Final Action Plan, Decision Quality, Risk Flags, Score).
8. Click **Copy** on the answer card.
9. Click **Pin** — card stays visible.
10. Click **Save Moment**.
11. Click **Open in IIVO** — browser opens with Context Bridge handoff; notice **Opened in IIVO with this answer attached.**
12. Ask a long question — confirm **Expand** shows full answer when shortened.
13. Submit a question, click **Cancel** while pending — confirm **Request cancelled.** and bar returns idle.
14. **Start Session**, ask another question, confirm command/response saved to session timeline.
15. Stop IIVO server, ask again — confirm **error card** + **Open in IIVO** fallback.
16. Panel → change **Command bar hotkey** preset — confirm diagnostics update.
17. Panel → change **Display** (Primary / Display N / Follow Mouse) — confirm layout moves or status updates.
18. Click **Refresh display layout** after display change.

19. Open IIVO with `/?runId=<valid-run-id>` — confirm saved run loads in console view.
20. Select **Follow Mouse** display — move cursor to another monitor — confirm Glass follows within ~1s.

### Pass/Fail log template (Direct Response v1)

```text
Date:
Tester:
Branch:
Glass version:
IIVO server: running / not running
OPENAI_API_KEY: configured / missing

Direct Response:
[ ] Inline answer without browser auto-open
[ ] No Council formatting in command bar answers
[ ] Cancel pending ask
[ ] Open in IIVO fallback with notice
[ ] Hotkey preset change
[ ] Display selection / refresh
[ ] Session iivo_command + iivo_response events

Results: ___ / 18 passed

Blockers:
-

Follow-ups:
-
```

### Overlay manual QA

1. Launch IIVO server (`npm run dev` from repo root).
2. Launch Glass (`npm run glass:dev`).
3. Confirm a **full-screen transparent overlay** appears (subtle grid/glow + “IIVO Glass active” badge in the top-left corner).
4. Confirm you can **click the desktop/browser behind the overlay** (Finder, browser tabs, etc.).
5. Confirm the **dock is clickable** (Start Session, Capture, Listen, etc.).
6. Confirm the **side panel opens** when you click **Open Panel** and is clickable inside its bounds.
7. Confirm clicking **outside** dock and panel goes to the app behind (overlay does not block).
8. Confirm overlay status chips / insight cards (insights mode) do **not** block clicks except when hovering interactive cards.
9. Confirm **Capture** still works from the dock.
10. Confirm **Start Session** still works from the dock.
11. Confirm **Stop Everything** stops listening/capture from the dock.
12. Confirm overlay **resizes correctly** after display change or app restart (check terminal log: `Glass windows: overlay=... clickThrough=true`).

Dock menu extras:

- **Hide/Show Overlay** — toggles overlay visibility without quitting Glass
- **Overlay mode** — cycles passive (grid only) → insights (cards/toasts) → hidden

### Capture & listening control verification

1. Launch `npm run dev` (IIVO server).
2. Launch `npm run glass:dev`.
3. Confirm overlay click-through still works.
4. Click **Capture** in the dock (no session). Confirm **“Screen captured”** toast/notice or a clear Screen Recording permission error.
5. Click **Start Session**.
6. Click **Capture** again. Confirm a **screen_capture** event appears in the Session tab timeline.
7. Open the panel **Context** tab (or use dock **Listen**). Choose Microphone or System Audio, then **Start Listening**.
8. Confirm **Stop Listening** appears immediately in the dock and panel footer.
9. Speak for 20–30 seconds if using Microphone/Web Speech. Confirm transcript, status hint, or STT error appears.
10. Click **Stop Listening**. Confirm listening state stops and mic indicator clears.
11. Click **Listen** again, then **Stop Everything**. Confirm all listening/capture states stop.
12. Confirm the app **stays open** and controls remain usable. Check **Operation diagnostics** in the panel footer for last command/status.

4. **Capture captures current display** — click **Capture** in the dock; the
   status pill shows "Capturing screen", then a screenshot is created.
5. **Send to IIVO creates a context item** — Capture / Send to IIVO calls
   `POST /api/context` then `POST /api/context/:id/screenshot` on the existing
   server; status pill shows "Sending to IIVO" → "Sent to IIVO".
6. **IIVO opens with lensAsk/context chip** — the browser opens
   `http://localhost:5173/?lensAsk=<contextId>` and the context attaches.
7. **Status indicators update** — pill cycles through Idle → Capturing/Listening
   → Sending → Sent.
8. **Saved moment appears** — click **Save Moment** (or the panel's Save Moment);
   the moment shows in the Saved Moments list with timestamp + kind.
9. **Pause/Stop works** — Start Listening flips the pill to "IIVO listening" and
   the panel "Listening" flag turns on; Pause / Stop everything turns it off.
10. **No capture happens on launch** — on first open the pill is "IIVO idle",
    both privacy flags are off, and nothing is captured or sent until you click.

## Transcript (v1)

- Listening engine is **not connected yet**. The transcript area accepts manual
  paste/typing: "Listening engine not connected yet. Paste transcript or use
  screen capture."
- As transcript text accumulates, the Summary / Insights / Hypotheses / Actions
  tabs fill from **local, deterministic** note extraction (no LLM calls).
- "Send to IIVO" on the transcript creates a `pasted_text` context item and opens
  IIVO with the context attached.

## Session Intelligence (v1)

A "session" is an explicit, user-started window of work. Glass observes it
locally — building a timeline, extracting deterministic insights, and (only on
request) sending the summarized session to IIVO Council.

### Session QA checklist

- [ ] Open Glass. **Confirm no session is active on launch** (dock pill reads
      "Session idle", panel footer reads "○ No session").
- [ ] Click **Start Session** in the dock. Pill changes to "Session active" and
      the footer shows the warning "IIVO Glass is collecting session events
      locally."
- [ ] Open the **Session** tab in the panel. Confirm the session title/status
      header and a `session started` timeline event.
- [ ] In the Session tab **Manual note** box, type a note → **Add to Session**.
      Confirm a `manual note` event appears in the timeline.
- [ ] Click **Capture Screen** in the dock (with a session active). Confirm a
      `screen capture` event with a thumbnail appears in the timeline (local
      only — it is NOT auto-sent).
- [ ] Click **Save Moment**. Confirm a `saved moment` event appears, and the
      moment is also in the saved-moments list (Context tab).
- [ ] Click **Extract Insights** (Session or Insights tab). Confirm insight
      cards appear grouped by type (Key Ideas / Hypotheses / Risks / Actions /
      Questions / Memory Candidates). Re-running does NOT duplicate insights.
- [ ] On an insight card: **Keep** (marks ★), **Dismiss** (removes), **Save**
      (adds a moment), **Send** (opens IIVO), **Copy** (clipboard).
- [ ] Use the timeline **filters** (All / Captures / Notes / Insights / Actions /
      Risks) and confirm filtering works.
- [ ] **Delete** an individual event from a timeline card.
- [ ] Click **Pause** in the dock. Pill → "Session paused". Confirm automatic
      events stop (capture prompts you / manual saves still work).
- [ ] Click **Resume**. Pill → "Session active".
- [ ] Open the **Summary** tab. Confirm a deterministic summary (What happened /
      Key ideas / Hypotheses / Risks / Action items / Memory candidates /
      Suggested next IIVO prompt). Try **Copy Summary** and **Send Summary to
      IIVO**.
- [ ] Click **Send Session** in the dock (or **Send Session to IIVO** in the
      Session tab). Confirm IIVO opens in the browser with a context chip whose
      content is the session summary + timeline. If the session is large, confirm
      the "truncated" note appears.
- [ ] Click **End Session**. Pill → "Session ended". Timeline is frozen but
      **Send Session to IIVO** still works.
- [ ] **Clear session** empties events/insights for the current session.
- [ ] Restart Glass: recent sessions persist (max 20). An *ended* session does
      not auto-resume as the active session on relaunch.

### Notes on detection

- **Optional active app/window detection** on macOS requires Accessibility permission.
  Without it, capture source name + manual source title are used. The UI never claims
  active-app detection works when permission is missing.
- Insight extraction is fully **deterministic and local** (rule-based cue words +
  recurring-term detection). There are no hidden/continuous LLM calls. The only
  network calls are the explicit "Send … to IIVO" actions you trigger.

## Glass v1.1 hardening

### Durable screenshot thumbnails

- [ ] Start Session → Capture Screen → confirm timeline thumbnail appears.
- [ ] Quit and reopen Glass → confirm the same session event still shows a
      thumbnail (loaded from `userData/session-screenshots/` via `glass-screenshot://`).
- [ ] Delete the screenshot file manually → confirm UI shows **Screenshot
      unavailable.** (no crash).
- [ ] Delete event / Clear session removes associated screenshot files.

### Analyze with IIVO Council

- [ ] Summary tab → **Analyze with IIVO Council** opens IIVO with `?lensAsk=<id>`.
- [ ] Context content includes explicit analysis instructions (what happened,
      what matters, risks, next actions, memory).
- [ ] Status notice shows preparing → sending → opened (or failed).

### Transcription foundation

- [ ] Context tab shows Mode: Manual / Microphone / Unavailable.
- [ ] If Web Speech API unavailable: message says paste manually.
- [ ] If available: Start Listening only on click; chunks add `transcript_note`
      events when session active; Stop Listening works.
- [ ] No listening on launch.

## Glass v1.2 — analysis, transcription, and source context

### v1.2 checklist

1. Launch IIVO server: `npm run dev` (repo root).
2. Launch Glass: `npm run glass:dev` (repo root).
3. **Start Session** — dock pill → Session active.
4. **Capture Screen** — confirm timeline `screen capture` event.
5. Confirm **source title** captured (display/source name) or **Manual source title** /
   permission message shown in Session tab **Source context**.
6. Add **manual transcript** via Context tab (paste + Add to Session).
7. Try **Microphone** mode if available — Start Listening only on click; chunks become
   `transcript_note` events when session active.
8. Select **System Audio — Not available yet** — confirm message says not implemented
   (no fake transcript).
9. **Extract Insights** — insight cards appear.
10. Summary tab → **Open in IIVO** — context item created, browser opens
    `?lensAsk=<id>` with context chip.
11. Confirm `?lensAsk=<id>` opens with session context attached.
12. Summary tab → **Analyze Now** — direct `/api/run-council` call; answer appears under
    **IIVO Analysis** (not auto-run on launch).
13. Confirm analysis appears in Session timeline as `iivo_analysis` with **Copy Analysis**.
14. Quit and reopen Glass — session persists.
15. Confirm screenshot thumbnail still loads from durable storage.
16. Delete screenshot file manually under `userData/session-screenshots/`.
17. Confirm UI shows **Screenshot unavailable.** — no crash.
18. Optional: grant macOS Accessibility → **Refresh** source context shows active app/window.

### Source context (v1.2)

- **Optional** active app/window detection on macOS via AppleScript (Accessibility-gated).
- Without permission: UI shows **Active app detection requires permission** — does not
  claim detection works.
- Screen capture stores `desktopCapturer` source name when available.
- Manual **Source title optional** field on notes always works.

### Direct Analyze Now vs Open in IIVO

- **Open in IIVO** — Context Bridge + `?lensAsk=<id>` (existing handoff).
- **Analyze Now** — POST `/api/run-council` from Glass; result stored locally as
  `iivo_analysis` event and shown in Summary **IIVO Analysis** panel.
- Credit estimate shown when `/api/usage/estimate` responds.
- On failure: error + **Open in IIVO** fallback.

### Transcription (v1.2)

- Source selector: Manual Paste | Microphone | System Audio — Not available yet.
- System audio explicitly unavailable — no fake generation.
- Microphone uses Web Speech when available; MediaRecorder record-only fallback possible.
- No listening on launch.

## Glass v1.3 — system audio capture foundation

### Research summary

- **Electron 31.7.7** with Chromium loopback via `setDisplayMediaRequestHandler({ audio: 'loopback' })`.
- Renderer calls `getDisplayMedia({ video: true, audio: true })` only on **Start Listening**.
- **macOS 13+** (Darwin 22+): native loopback possible with Screen Recording / audio capture permission.
- **No local STT for system audio** — Web Speech uses microphone only. Capture can succeed while
  transcript remains manual paste.
- If loopback returns no audio track on macOS → **requires virtual device** (e.g. BlackHole).

### v1.3 checklist

1. Launch Glass — confirm **no listening/capture on launch**.
2. **Start Session**.
3. **Capture Screen** — confirm source context behavior.
4. Add **manual transcript**.
5. Test **Microphone** mode (Web Speech if available).
6. Select **System Audio** — confirm status message matches reality (permission / available / virtual device).
7. Click **Start Listening** for system audio — grant permission if prompted.
8. Confirm UI shows capture active or honest failure (no fake transcript).
9. **Stop Listening** — all tracks stop, privacy pill returns to idle.
10. **Extract Insights**.
11. **Analyze Now** — analysis appears in Glass.
12. **Open in IIVO** — confirm `?lensAsk=<id>` context chip.
13. Quit/reopen Glass — screenshot thumbnail reloads.
14. Delete screenshot file manually — **Screenshot unavailable.**, no crash.

### System audio status messages

| Status | UI message |
|--------|------------|
| `available` | System audio capture available. |
| `requires_permission` | Grant Screen Recording / audio capture permission. |
| `requires_virtual_device` | System audio capture requires a virtual audio device. |
| `unsupported` | System audio capture is not supported in this build. |
| `error` | Safe error text from capture attempt |

STT-specific statuses (shown when listening):

| STT status | Meaning |
|------------|---------|
| `configured` | Server or direct OpenAI STT ready |
| `server_unavailable` | IIVO server not reachable — run `npm run dev` or use direct fallback |
| `missing_key` | No `OPENAI_API_KEY` on server (or direct env when endpoint=direct) |
| `disabled` | STT disabled via env |

Each status includes a **How to fix** hint in the panel.

### Privacy (v1.3)

- System audio capture only starts when you press **Start Listening**.
- System audio may require macOS Screen Recording permission or a virtual audio device.
- IIVO Glass does not capture audio on launch.
- Audio/transcript stays local until you send/analyze.

## Glass v1.4 — OpenAI speech-to-text (server-first)

### Enable server STT (preferred)

Glass defaults to **server** endpoint mode. The IIVO server uses your existing
`OPENAI_API_KEY` — Glass does **not** need a separate key.

1. Add to repo root `.env`:

```env
OPENAI_API_KEY=sk-...
IIVO_GLASS_STT_ENABLED=true
IIVO_GLASS_STT_ENDPOINT=server
IIVO_GLASS_STT_MODEL=gpt-4o-mini-transcribe
```

2. Start IIVO server: `npm run dev`
3. Start Glass: `npm run glass:dev`
4. Panel **STT Provider** should show **OpenAI (IIVO server)** when configured.

Health check: `GET /api/health` includes `stt.configured` and `stt.endpoint`.

### Enable direct Glass STT fallback

Use only when the IIVO server is unavailable or you want Glass to call OpenAI
directly from the **main process** (key never exposed to renderer):

```env
IIVO_GLASS_STT_ENDPOINT=direct
OPENAI_API_KEY=sk-...
```

If server fails and direct is not configured, UI shows **IIVO transcription server unavailable**
and manual paste remains available.

### Disable STT

```env
IIVO_GLASS_STT_ENABLED=false
# or
IIVO_GLASS_STT_ENDPOINT=none
```

Manual transcript paste always works.

### Optional live verification (may incur OpenAI cost)

Not part of the normal test suite. Requires `OPENAI_API_KEY` and optional fixture:

```bash
npm run glass:stt:live
```

Uses server STT when `IIVO_GLASS_STT_ENDPOINT=server` (default), or direct OpenAI
when `endpoint=direct`. Exits safely if no key or missing fixture.

See `desktop-glass/.env.example` for all STT variables.

### Cost warning

- Chunks default to **20 seconds**.
- Warning at **10 minutes** of listening.
- Optional auto-stop at 30 minutes when `IIVO_GLASS_STT_AUTO_STOP=true` (default OFF).

### Microphone paths

1. **Web Speech** — live microphone transcription when Electron/Chromium supports it
   (browser-local; label: *Microphone live transcription via Web Speech*).
2. **MediaRecorder + OpenAI STT** — chunk-based fallback when Web Speech unavailable
   (label: *Microphone chunk transcription via OpenAI*).

No duplicate transcript events when both paths could apply — Web Speech takes precedence.

### System audio path

- Electron loopback capture → 20s chunks → OpenAI STT via server (or direct fallback).
- No YouTube-specific behavior. General **system audio** only.
- Virtual audio device may still be required on macOS if loopback returns no audio track.
- No fake transcripts when audio track is missing.

### v1.4 checklist

1. Launch Glass — no listening on launch.
2. With server stopped — STT shows server unavailable or not configured; manual paste works.
3. Start `npm run dev` with `OPENAI_API_KEY` — STT Provider shows **OpenAI (IIVO server)**.
4. Start Session → Microphone → Start Listening → confirm chunks transcribe (~20s) or Web Speech interim.
5. System Audio → Start Listening → confirm honest status + transcription when stream available.
6. Stop Listening stops all tracks.
7. Transcripts appear as `transcript_note` events with `microphone` or `system_audio` tags.
8. No mock provider option anywhere in UI.

### Privacy (v1.4)

- Audio only starts when you press **Start Listening**.
- Audio chunks may be sent to **OpenAI** for transcription when STT is enabled (via IIVO server or direct main process).
- Transcripts stay local until you send/analyze.
- Stop Listening stops microphone/system audio tracks.
- `OPENAI_API_KEY` never reaches the renderer.

## Privacy controls

- Session recording starts **only** when you click **Start Session** — never on
  launch.
- Screen capture happens **only** when you click **Capture**.
- Microphone and system audio capture start **only** when you click **Start Listening**
  — never on launch.
- You can **Pause**, **End**, **Delete events**, and **Clear session** at any
  time. A session stays **local** until you click **Send to IIVO**.
- While a session is active the panel shows a pulsing warning: "IIVO Glass is
  collecting session events locally."
- Persisted sessions store screenshot **file paths** (not base64) under
  `userData/session-screenshots/`; thumbnails reload via custom protocol.
- Visible Listening and Screen-capture indicators.
- Pause and Stop everything buttons.
- Delete individual saved moments and Clear all moments.
- No recording by default, no background capture on launch, no auto-send.
- Copy shown in panel: Glass captures screen/audio only when you start it. Session data
  stays local until you send or analyze.

## Packaging

All commands below are run from the repo root. Glass packaging is fully isolated
to `desktop-glass/` and never affects the core IIVO web app, Lens, Context Bridge,
or AI Council.

### 1. Development launch
```bash
npm run glass:dev
```
Needs the real Electron binary. If Glass was installed with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1`, run once:
```bash
npm run glass:install        # full install incl. Electron binary
# or, if already installed without the binary:
node desktop-glass/node_modules/electron/install.js
```

### 2. Local unsigned package
```bash
npm run glass:package        # = electron-vite build + electron-builder --mac (host arch)
```
Produces an **unsigned** macOS app (DMG + ZIP) for local testing. No Apple
Developer credentials required.

### 3. Architecture-specific builds
```bash
npm run glass:package:mac:arm64       # Apple Silicon
npm run glass:package:mac:x64         # Intel
npm run glass:package:mac:universal   # universal (arm64 + x64)
```
Glass has no native Node modules, so the universal build is just two JS bundles
merged into one app — no extra native rebuild config needed.

### 4. Where files appear
Artifact names include the architecture (`${arch}`) so arm64, x64, and universal
builds never overwrite each other:
```text
desktop-glass/release/
├── IIVO Glass-0.1.0-arm64.dmg
├── IIVO Glass-0.1.0-arm64-mac.zip
├── IIVO Glass-0.1.0-x64.dmg
├── IIVO Glass-0.1.0-x64-mac.zip
├── IIVO Glass-0.1.0-universal.dmg
├── IIVO Glass-0.1.0-universal-mac.zip
├── mac-arm64/IIVO Glass.app        # arm64 app bundle (mac/ on Intel)
└── mac-universal/IIVO Glass.app    # universal app bundle
```
(Only the artifacts for the arch you build are produced.)

### 5. Gatekeeper warning (unsigned builds)
Because local builds are unsigned, macOS Gatekeeper may block first launch
("can't be opened because it is from an unidentified developer"):
1. Right-click the app → **Open**
2. Confirm **Open** in the dialog.
This is expected for unsigned dev builds and only needs to be done once.

### 6. Distribution signing / notarization
Public distribution (no Gatekeeper prompt) requires a paid Apple Developer
account and:
- a **Developer ID Application** certificate,
- **hardened runtime** + entitlements,
- **notarization** with Apple, and
- **stapling** the notarization ticket.

A ready-to-use config is provided: `desktop-glass/electron-builder.signed.yml`
(hardened runtime on, entitlements at `build/entitlements.mac.plist`,
`notarize: true`). It is **not** used by the local build. Run it only when you
have credentials:
```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="XXXXXXXXXX"
# signing identity: a Developer ID cert in your keychain, or CSC_LINK + CSC_KEY_PASSWORD
npm run glass:package:mac:signed
```
Without those credentials this command will fail at the signing/notarization
step — that is intentional.

### 7. Git warning — do NOT commit build artifacts
Never commit (all ignored by `desktop-glass/.gitignore`):
- `desktop-glass/release/`
- `desktop-glass/out/`
- `*.app`, `*.dmg`, `*.zip`, `*.blockmap`, `builder-debug.yml`

**Do** commit: `package.json`, `electron-builder.yml`,
`electron-builder.signed.yml`, `build/icon.icns`, `build/icon.png`,
`build/entitlements.mac.plist`, `GLASS_QA.md`, and `scripts/make-icns.mjs`.

### App icon
The app icon is the IIVO eye/orb on a dark glass rounded-square background.
`build/icon.icns` (all sizes up to 1024×1024) + `build/icon.png` are generated by:
```bash
npm run icon --prefix desktop-glass
```
The generator crops the orb to its alpha bounding box, downscales it with `sips`,
composites it onto a gradient glass rounded-square (cyan glow + edge highlight),
and assembles the `.icns` with `iconutil` — no extra dependencies.

## Notes / known limitations (v1)

- Screen capture uses Electron `desktopCapturer` on the primary display.
- System audio uses Electron desktop loopback when supported; transcription via OpenAI STT
  (server-first) when configured. Virtual device or Screen Recording permission may still be required.
- Microphone: Web Speech when available; OpenAI chunk STT as fallback.
- No Deepgram provider in v1 (future optional).
- No autonomous control: Glass observes and hands off; it does not click or type
  into other apps.

See `desktop-glass/GLASS_LIMITATIONS.md` for the full limitation audit.

## Final manual QA checklist

Run from repo root. This cannot be fully automated — record pass/fail below.

```bash
npm run glass:qa:manual   # prints this checklist path
```

### Required manual verification

| # | Step | Pass | Fail | Notes |
|---|------|------|------|-------|
| 1 | `npm run dev` — IIVO server running with `OPENAI_API_KEY` | | | |
| 2 | `npm run glass:dev` — Glass launches, no crash | | | |
| 3 | **Start Session** | | | |
| 4 | **Capture Screen** — thumbnail appears | | | |
| 5 | Quit and reopen Glass | | | |
| 6 | Confirm screenshot thumbnail persists | | | |
| 7 | **Start Microphone** transcription — Web Speech or OpenAI chunk label correct | | | |
| 8 | **Start System Audio** mode — status matches reality | | | |
| 9 | Confirm STT provider label (server / Web Speech / unavailable) | | | |
| 10 | **Stop Listening** — tracks stopped, privacy pill idle | | | |
| 11 | **Analyze Now** — analysis in Glass | | | |
| 12 | **Open in IIVO** — `?lensAsk=` context chip | | | |
| 13 | Delete screenshot file manually — **Screenshot unavailable.**, no crash | | | |

### Pass/fail log template

```text
Date:
Tester:
Branch:
Glass version:
IIVO server: running / not running
OPENAI_API_KEY: configured / missing

Results: ___ / 13 passed

Blockers:
-

Follow-ups:
-
```
