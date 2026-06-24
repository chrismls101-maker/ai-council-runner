# IIVO Glass — limitations classification

This document separates **fixed automated coverage** from **environment / manual QA requirements**.

## Fixed (automated E2E + unit tests)

| Former limitation | Resolution |
|-------------------|------------|
| Thinking card required artificial stub delay | Command bar enforces a minimum thinking-card display duration (`THINKING_CARD_MIN_MS`) before replacing with the answer. E2E no longer depends on network delay for thinking visibility. |
| Panel status labels mismatched spec | Status grid now shows **Server**, **STT**, **Capture**, **Audio**, **Permissions**, **Session** with level dots. |
| Window layout checks used diagnostics strings only | E2E exposes `glass:e2e-get-window-metadata` (when `IIVO_GLASS_E2E=1`) with bounds, visibility, and tracked click-through state per window. |
| Custom CDP launcher felt like a workaround | Formalized as `launchGlassElectronForE2E` — intentional Electron 31 + Playwright compatibility layer (fixed CDP port 19222). |
| CI skip was vague | Skip reasons are explicit. Use `GLASS_E2E_CI=1` on runners with display/xvfb, or `GLASS_E2E_FORCE=1` locally. See `npm run glass:e2e:ci`. |

## Streaming / partial-answer decision (Voice Mode)

**Decision: Option B (non-streaming + latency UX bridge).** Token streaming for
`glass_direct` / `glass_visual_direct` is intentionally **deferred to Voice Mode
v2** to avoid destabilizing the working single-call pipeline (model fallback
chain, council-format stripping, visual 413 retry, abort/cancel semantics).

The bridge that keeps Voice Mode from feeling dead during 3–13s waits
(`glassAskTiming.ts`):

- escalating status: `Listening…` → `Transcribing…` → `Looking…` → `IIVO is
  thinking…` → `Still working…` (6s) → timeout copy (45s);
- first-sentence preview (`firstSentencePreview`) as an early answer hint;
- a Cancel button (`cancel-glass-ask`) and Stop Everything (`stop-everything`)
  that clear pending/partial state.

Voice Mode v2 enhancement (future): server-sent token streaming surfaced as
`ANSWER_PARTIAL` events into the existing `voiceModeReducer` (the state machine
already models an `answering` phase with `answerPreview`).

## Environment requirements (not product bugs)

| Requirement | Notes |
|-------------|-------|
| **GUI display for Electron E2E** | Headless CI runners without a virtual display cannot launch Glass windows. Run locally on macOS or use Linux + xvfb with `GLASS_E2E_CI=1`. |
| **Electron 31 + Playwright** | `_electron.launch()` is incompatible with Electron 31’s rejection of `--remote-debugging-port=0`. CDP spawn is the supported launcher. |

## Manual / human QA only

These require real OS permissions, hardware, or subjective verification — **not product bugs**:

| Area | Why manual |
|------|------------|
| **macOS Screen Recording** | Required for visual ask and Capture. Glass uses a lightweight probe and opens System Settings when permission is missing; macOS may require quitting and reopening Glass after you grant access. |
| **Microphone permission** | Requested **only** when you choose Microphone and start listening — never on launch. |
| **System audio loopback** | Glass tries native loopback first. If no audio track is returned, the panel explains virtual audio routing (BlackHole, Loopback, etc.) — guidance appears only after that path fails. |
| **OpenAI vision / STT** | Server-side config and billing (`OPENAI_API_KEY`, `IMAGE_VISION_ENABLED`, STT provider). The renderer never sees API key values; Setup shows Online/Ready/Disabled/Missing config from `/api/health`. |
| **Real browser handoff (optional)** | E2E records handoff URLs and verifies the stub IIVO web URL loads; set `IIVO_GLASS_E2E_REAL_HANDOFF=1` to use the real system browser. Production uses `openGlassHandoffUrl` with clipboard fallback on failure. |
| **Click-through feel** | OS-level pointer pass-through and visual polish on your desktop/TV. |
| **Live OpenAI STT** | Requires API keys and live transcription for server STT; Web Speech may work without server STT when configured locally. |
| **Multi-monitor visual verification** | Automated tests assert bounds/metadata; human confirms TV/HDMI placement feels correct. |

### Permission & setup panel (v1)

The Glass panel includes a **Setup** section with green/yellow/red status rows:

- **Screen Recording** — probe on Run Setup Check or visual ask preflight; **Open Screen Recording Settings** when needed.
- **Microphone** — **Not requested** until you start listening with Microphone; **Test Mic** runs the normal macOS prompt.
- **System Audio** — native loopback test on user action; virtual-device help only if no track is returned.
- **Vision / STT / Server** — derived from IIVO server health (no secrets exposed).

**Run Setup Check** refreshes server/vision/STT and screen-recording probe without requesting microphone or system audio.

Glass does **not** bypass macOS security, auto-capture on launch, or enable recording without explicit user action.

### macOS app identity (dev vs packaged)

| Mode | Privacy & Security list | Bundle id |
|------|-------------------------|-----------|
| `npm run glass:dev` | **Electron** (not IIVO Glass) | Electron dev binary |
| Packaged `IIVO Glass.app` | **IIVO Glass** | `com.iivo.glass` |

Grant Screen Recording, Microphone, and System Audio against the **packaged** app you actually launch:

```bash
npm run glass:package:mac:arm64   # Apple Silicon: use arm64 only for permission testing
npm run glass:package:verify
npm run glass:open:packaged
```

Use **one** `.app` build at a time. Do not alternate `mac-arm64` and `mac-universal` — macOS may grant Screen Recording to a different copy than the one you open. The Setup panel shows the running path and warns when multiple `IIVO Glass.app` bundles exist.

If you switched builds: `npm run glass:permissions:reset`, then re-grant on a single app path.

See `GLASS_QA.md` § macOS permissions (packaged app) for full steps.

## Commands

```bash
# Local full Electron E2E (macOS with display)
npm run glass:e2e

# CI entry — skips cleanly when no display
npm run glass:e2e:ci

# Force on a runner with display access
GLASS_E2E_FORCE=1 npm run glass:e2e

# Linux CI with xvfb example
xvfb-run -a GLASS_E2E_CI=1 npm run glass:e2e:ci
```

See also `GLASS_QA.md` for the full manual checklist.

## Visual ask (capture-on-ask)

| Capability | Status |
|------------|--------|
| **Capture-on-ask** | Implemented — screen is captured only when you send a visual-intent prompt from the command bar. |
| **Focused crop + quality presets** | Text/error prompts prefer active-window crop (System Events or workspace CGWindow bounds without Accessibility) or center crop; general prompts use whole-screen JPEG optimization. |
| **Preflight** | Before capture, Glass checks server health, vision config, display target, and the **same** 64×64 Screen Recording probe as Setup / Capture Diagnostics (non-empty thumbnail = pass). Visual ask does **not** open System Settings when the probe passes. |
| **Periodic Live Vision** | **Not implemented (by design).** Deferred for privacy, API cost, and performance. A future mode must include a clear ON indicator, stop control, capture frequency setting, and the same retention policy as manual capture. |

Run `npm run glass:qa:manual-report` before manual QA for server/vision/STT status and a short step list.

## User setup instructions (permissions & server)

### Screen Recording (visual ask / Capture)

1. Open Glass panel → **Setup** → **Screen Recording** (or trigger a visual ask).
2. If status is **Permission needed**, click **Open Screen Recording Settings**.
3. Enable **IIVO Glass** (or your dev Electron app name) under Privacy & Security → Screen Recording.
4. If capture still fails, **quit and reopen IIVO Glass** (macOS often requires a restart).
5. Click **Retry Capture** or **Run Setup Check** to verify.

### Microphone (listening / STT)

1. Use the command bar voice control → **Microphone** → **Start** (Glass does not ask on launch).
2. Allow the macOS microphone prompt when it appears.
3. If denied: **Open Microphone Settings** from Setup, enable Glass, then **Test Mic** or start listening again.
4. **Stop Everything** stops active microphone tracks.

### System audio

1. Choose **System Audio** and start listening (user-initiated).
2. If **System audio ready** appears, native loopback worked.
3. If **Virtual device required** appears, install/route via BlackHole or Loopback, open **Audio MIDI Setup** if offered, and select the virtual device as the capture source.
4. Virtual-device guidance is shown only when the native path fails.

### Vision & STT (IIVO server)

1. Run IIVO server: `npm run dev` from repo root.
2. Set `OPENAI_API_KEY` in server `.env` (never pasted into Glass UI).
3. Vision: `IMAGE_VISION_ENABLED=true` and vision model env as documented for IIVO.
4. STT: configure server STT provider; Setup → **STT** should show **Ready** when `/api/health` reports configured.
5. **Run Setup Check** in the panel to refresh **Server**, **Vision**, and **STT** rows.
6. If vision is disabled, visual ask shows an honest message — not a fake screen description.
