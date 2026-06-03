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

## Privacy controls

- Visible Listening and Screen-capture indicators.
- Pause and Stop everything buttons.
- Delete individual saved moments and Clear all moments.
- No recording by default, no background capture on launch, no auto-send.
- Copy shown in panel: "IIVO Glass only captures when you press Capture or Start
  Listening."

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
- No system-audio or microphone transcription yet (placeholder transcript input).
- No autonomous control: Glass observes and hands off; it does not click or type
  into other apps.
