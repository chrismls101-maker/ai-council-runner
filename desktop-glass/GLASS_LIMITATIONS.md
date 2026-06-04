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

## Environment requirements (not product bugs)

| Requirement | Notes |
|-------------|-------|
| **GUI display for Electron E2E** | Headless CI runners without a virtual display cannot launch Glass windows. Run locally on macOS or use Linux + xvfb with `GLASS_E2E_CI=1`. |
| **Electron 31 + Playwright** | `_electron.launch()` is incompatible with Electron 31’s rejection of `--remote-debugging-port=0`. CDP spawn is the supported launcher. |

## Manual / human QA only

These require real OS permissions, hardware, or subjective verification — **not code limitations**:

| Area | Why manual |
|------|------------|
| **macOS Screen Recording** | Permission prompt and capture quality cannot be faked in E2E. |
| **Microphone permission** | Real mic access and OS prompts. |
| **System audio loopback** | Virtual device setup and OS-specific audio routing. |
| **Real browser handoff** | E2E mocks `shell.openExternal`; real Safari/Chrome launch is manual. |
| **Click-through feel** | OS-level pointer pass-through and visual polish on your desktop/TV. |
| **Live OpenAI STT** | Requires API keys and live transcription. |
| **Multi-monitor visual verification** | Automated tests assert bounds/metadata; human confirms TV/HDMI placement feels correct. |

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
