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
4. **Capture Screen captures current display** — click **Capture Screen**; the
   status pill shows "Capturing screen", then a screenshot is created.
5. **Send to IIVO creates a context item** — Capture Screen / Send to IIVO calls
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
| `available` | System audio capture available. (When listening: transcription provider not connected — paste manually.) |
| `requires_permission` | Grant Screen Recording / audio capture permission. |
| `requires_virtual_device` | System audio capture requires a virtual audio device. |
| `unsupported` | System audio capture is not supported in this build. |
| `error` | Safe error text from capture attempt |

### Privacy (v1.3)

- System audio capture only starts when you press **Start Listening**.
- System audio may require macOS Screen Recording permission or a virtual audio device.
- IIVO Glass does not capture audio on launch.
- Audio/transcript stays local until you send/analyze.

## Glass v1.4 — OpenAI speech-to-text

### Enable OpenAI STT

Set environment variables before launching Glass (repo root `npm run glass:dev`):

```bash
export OPENAI_API_KEY=sk-...
export IIVO_GLASS_STT_ENABLED=true
export IIVO_GLASS_STT_PROVIDER=openai
# optional:
export IIVO_GLASS_STT_MODEL=gpt-4o-mini-transcribe
export IIVO_GLASS_STT_AUTO_STOP=true
export IIVO_GLASS_STT_AUTO_STOP_MINUTES=30
```

Without `OPENAI_API_KEY`, UI shows **Not configured** — manual paste still works. No mock provider in UI.

### Cost warning

- Chunks default to **20 seconds**.
- Warning at **10 minutes** of listening.
- Optional auto-stop at 30 minutes when `IIVO_GLASS_STT_AUTO_STOP=true` (default OFF).

### Microphone paths

1. **Web Speech** when Electron/Chromium supports it (local browser STT, no OpenAI).
2. **MediaRecorder + OpenAI STT** when Web Speech unavailable and STT configured.

### System audio path

- Electron loopback capture → 20s chunks → OpenAI STT when configured.
- No YouTube-specific behavior. General system/screen audio only.
- Virtual audio device may still be required on macOS if loopback returns no audio track.

### v1.4 checklist

1. Launch Glass — no listening on launch.
2. Confirm STT Provider shows **Not configured** without env vars.
3. Set OpenAI env vars, relaunch — STT Provider shows **OpenAI**.
4. Start Session → Microphone → Start Listening → confirm chunks transcribe (~20s).
5. System Audio → Start Listening → confirm honest status + transcription when stream available.
6. Stop Listening stops all tracks.
7. Transcripts appear as `transcript_note` events with `microphone` or `system_audio` tags.
8. No mock provider option anywhere in UI.

### Privacy (v1.4)

- Audio only starts when you press **Start Listening**.
- Audio chunks may be sent to **OpenAI** for transcription when STT is enabled.
- Transcripts stay local until you send/analyze.
- Stop Listening stops microphone/system audio tracks.

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
- System audio uses Electron desktop loopback when supported; local transcription of system
  audio is not connected — paste manually or use Microphone mode for live transcript.
- Microphone transcription depends on Web Speech / MediaRecorder availability in Electron.
- No autonomous control: Glass observes and hands off; it does not click or type
  into other apps.
