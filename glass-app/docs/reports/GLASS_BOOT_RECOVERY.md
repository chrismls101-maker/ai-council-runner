# Glass boot recovery (2026-06)

This document records the full Glass startup incident: what broke after Aletheia Phases 0–8, what we tried, what we reverted, and the **current working boot path** as of the end of this recovery session.

For **chrome visibility failures** (command bar missing while frame/strip show, renderer crashes, z-order red herrings), see [GLASS_KNOWN_FAILURES.md](./GLASS_KNOWN_FAILURES.md).

---

## Timeline

| Phase | What happened |
|-------|----------------|
| **Before P0–8** | `npm run glass:dev` with `electron-vite dev` started instantly. |
| **After P0–8** | Dev hang: no boot splash, invisible UI, ~7 hours stuck. Production DMG still worked. |
| **Diagnosis** | Not Aletheia UI logic — dev load path + P0–8 background work starting at window creation starved renderers on macOS panel windows. |
| **Experiments** | Boot splash skip, `IIVO_GLASS_DEV_PRIMARY`, heavy boot gating in `windows.ts` — **reverted** per user request. |
| **Production-parity launcher** | `glass:dev` → built bundle + `loadFile` (matches DMG). Old vite path renamed `glass:dev:vite`. |
| **Stale `out/` trap** | Source changed but `glass-run-built` only rebuilt when `out/` was **missing** — user kept running old main process with broken boot logic. Fixed with mtime stale check. |
| **Splash stuck at 100%** | Progress bar is a 10s renderer animation; main process was waiting for overlay `did-finish-load` before `finishSplash()`. Fixed: dismiss on timer only. |
| **Slow splash fade** | `finishSplash()` blocked ~800ms (420ms delay + 380ms opacity fade) before showing chrome. Fixed: instant cut, chrome shows immediately. |
| **Embedder cache** | Corrupt MiniLM cache caused 20–90s retry loops and spinner after boot. Cleared `~/Library/Application Support/Electron/models`. |
| **Tier 1 idle CPU** | Gated digest, lazy embedder, slower app-switch poll, deferred sidecar — quiet 4–5 min dock-only; kill → near silent in ~3 min. |
| **Current state** | Boot works (`10s splash → instant chrome`). Tier 1 + Tier 2B/2C shipped; overlay unchanged. Run M1 15-min bench to confirm silence target. |

---

## Symptoms we hit

| Symptom | Cause |
|---------|--------|
| `glass:dev` hang — no splash, invisible UI | Vite `loadURL` on hidden macOS panel windows + parallel 6-window load + CPU starvation from P0–8 loops |
| Boot splash reaches 100%, nothing happens for 20–30s+ | Main waited for overlay load before `finishSplash()`; overlay bundle is ~6.7MB |
| Splash fades slowly, Glass hidden underneath | `finishSplash()` opacity fade ran **before** `completeGlassBootSequence()` |
| Spinner / loading cursor after UI appears | Corrupt embedder cache + perception/digest starting too early |
| Only dock visible after killing terminals | Orphan Electron child; terminal SIGINT didn't always kill app |
| Small dock → full dock → strip ~15s later | **Normal** — placeholder → `useDockResize` → overlay bundle loads |
| `glass:dev:vite` from repo root | Missing script — added `glass:dev:vite` to root `package.json` |

Production **DMG install** worked throughout.

---

## Root causes (detailed)

### 1. Dev load path vs production

`electron-vite dev` sets `ELECTRON_RENDERER_URL` → windows use `loadURL` (Vite), not `loadFile` (built HTML).

On macOS, Glass opens **six transparent panel windows**. Three compounding failures:

| # | Issue | Effect |
|---|--------|--------|
| 1 | Parallel `loadURL` on **hidden** panel windows | macOS won't compositor hidden windows → navigation hangs (`did-start-loading`, no `dom-ready`) |
| 2 | `setBounds` / `relayoutAllWindows` during navigation | Reposition mid-load aborts navigation |
| 3 | P0–8 background work at window creation | Embedder, perception, screen digest, Aletheia bootstrap starve renderer CPU during first load |

**Phase 0–8 product code did not cause the hang** — timing and load path did. The panel + `loadURL` combo was always fragile; P0–8 pushed it over the edge.

**Why the DMG works:** bundled renderer, `loadFile`, boot splash, panel windows, no Vite dev server.

### 2. Stale `out/` bundle (critical dev trap)

`glass-run-built.mjs` originally only ran `npm run build` when `out/main/index.js` or renderer HTML was **absent**. Editing `src/main/*.ts` without rebuilding meant `npm run glass:dev` silently ran **old** boot logic — no `[IIVO Glass] boot: …` logs, splash stuck at 100%, etc.

**Fix:** rebuild when `index.ts`, `windows.ts`, `bootSplash.ts`, or `bootTiming.ts` is newer than `out/main/index.js`.

### 3. Splash / chrome sequencing bugs

- Splash progress bar = **10s renderer animation** (`GLASS_BOOT_DURATION_MS`). Splash also waits for chrome `did-finish-load` (20s cap) so dismiss never beats window creation + renderer load.
- Old boot gate: `await Promise.all([whenGlassWindowsReady, splashMinDisplay])` — overlay often outlasted the bar (stuck at 100% with no dismiss fix).
- Regression (fixed): timer-only dismiss while `createWindows` runs late in init → ~3s blank after splash. Restored `Promise.all` with instant `finishSplash` (no fade delay).

### 4. Embedder / vector memory

Corrupt cache under `~/Library/Application Support/Electron/models`:

- `EOF while parsing a string at line 13778`
- `Protobuf parsing failed` on re-download partial files

Caused 20s dev / 90s packaged retry loops and perceived “still loading” after chrome visible.

### 5. Orphan processes

Ctrl+C on terminal didn't always kill Electron → dock-only ghost UI. Fixed with `glass:kill` + SIGINT/SIGTERM forwarding in `glass-run-built`.

---

## What we tried and reverted

| Experiment | Outcome |
|------------|---------|
| Skip boot splash in dev (`IIVO_GLASS_DEV_PRIMARY`, `bootSplash.ts` hacks) | Reverted — splash should run when `out/renderer/splash.html` exists |
| Large `windows.ts` boot gating (defer secondary windows, overlay presentation guards) | Reverted to stable HEAD + targeted fixes only |
| Debug scripts (`prove-glass-boot`, test loaders, etc.) | Removed except `prove-glass-run-built.mjs` |
| 5s devPrimary load retry (mentioned in review) | Was experimental code, not in final tree |

---

## Current working boot flow (`npm run glass:dev`)

```
glass-run-built.mjs
  ├─ glass-kill (stale Electron)
  ├─ rebuild if out/ missing OR main sources newer than out/main/index.js
  └─ electron out/main/index.js  (no ELECTRON_RENDERER_URL)

app.whenReady
  ├─ showSplash? → beginGlassBootSequence + createSplashWindow
  ├─ createWindows (parallel loadFile; chrome hidden while glassBootPending)
  ├─ await Promise.all([
  │     splashMinDisplay (10s minimum),
  │     whenGlassWindowsReadyOrTimeout (dock + overlay + command bar, 20s cap),
  │   ])
  ├─ finishSplash()
  │    ├─ fire boot sound playComplete (non-blocking)
  │    └─ completeGlassBootSequence() immediately
  │         ├─ dismissSplashWindow (instant destroy, no fade)
  │         ├─ showPrimaryGlassWindows (dock + command bar + overlay)
  │         └─ deferred relayout if macos-visible-frame
  └─ startGlassBackgroundWork()
       ├─ aletheiaPermissionMonitor.start + aletheiaSidecarManager.start
       ├─ runAletheiaBootstrap
       ├─ startSpendPolling, startLiveTerminalPolling
       ├─ startPerceptionLoop (app-switch 3s idle / 1.5s companion)
       └─ startScreenDigestLoop (companion only; first run 60s after loop starts)
       # embedder: lazy — first memory use or API key connect only
```

**User-visible timing:** ~10s boot splash minimum; splash stays up until dock/overlay/command bar finish loading (up to 20s cap) so chrome is painted before the splash disappears — no blank gap. Overlay builder strip may still populate a few seconds after reveal (large bundle). Heavy background work starts after splash dismiss.

---

## Fixes implemented (file reference)

### Scripts

| File | Purpose |
|------|---------|
| `scripts/glass-run-built.mjs` | Production-parity dev launcher; stale rebuild; SIGINT/SIGTERM → Electron |
| `scripts/glass-kill.mjs` | Kill orphan Glass / electron-vite / Electron helper processes |
| `scripts/prove-glass-run-built.mjs` | `IIVO_GLASS_PROVE_BOOT=1` → log `GLASS_BOOT_OK` and quit |

### `package.json` scripts

| Script | Behavior |
|--------|----------|
| `glass:dev` | Built bundle (recommended) |
| `glass:dev:vite` | `electron-vite dev` + macOS vite fixes |
| `glass:kill` | Orphan cleanup |
| `prove:run` | Automated boot proof |
| Root `glass:dev:vite` | Forwards to `glass-app` |

### `index.ts`

- `startGlassBackgroundWork()` deferred until after splash dismiss (built) or `whenGlassWindowsReadyOrTimeout` (vite).
- Includes `runAletheiaBootstrap` (moved out of immediate boot path).
- `getCurrentWindowContext()` no longer awaited before `createWindows`.
- Splash path: timer-only dismiss; background work starts after overlay ready **without blocking UI**.

### `windows.ts`

- `glassBootPending` — hide chrome until splash completes (built bundle).
- `relayoutAllWindows` deferred while `glassBootPending` or staggered vite loads.
- `scheduleChromeVisibilityRecovery()` — retry command bar/overlay show 4s after boot.
- `finishSplash()` — instant splash destroy + chrome show (no blocking fade).
- `whenGlassWindowsReadyOrTimeout` — 45s safety cap with load-state logging.
- **Vite only:** `prepareVitePanelBeforeLoad`, staggered loads, wait for Vite dev server, defer relayout until loads complete.

### `bootSplash.ts`

- Returns `false` when `ELECTRON_RENDERER_URL` is set (vite dev won't hide chrome behind splash).
- `IIVO_GLASS_BOOT_SPLASH=1` still forces splash on.

### `glassEmbedder.ts` / `glassMemoryEngine.ts`

- No infinite retry on corrupt cache; `embedderInitFailedPermanently`.
- `IIVO_GLASS_SKIP_EMBEDDER=1` to skip.
- **Lazy init:** no `notifyMemoryServicesReady()` at boot; `ensureEmbedderReady` on first memory op or API key connect.
- Startup embedder timeout when explicitly init: **20s dev** / **90s packaged**.

---

## Proof results

| Command | Result |
|---------|--------|
| `npm run prove:boot` (minimal dock `loadFile`) | PASS ~1s |
| `npm run prove:run` (full app, built bundle) | PASS `GLASS_BOOT_OK` (~16–35s typical; ~104s after fresh model download) |
| `electron-vite dev` / `glass:dev:vite` (before fixes) | FAIL — stuck at `did-start-loading` |
| `electron out/main/index.js` directly | WORKS |
| `npm run glass:dev` (current, user verified) | PASS — 10s splash → instant chrome |

---

## Daily commands

```bash
# Stuck dock-only, hung preview, or ghost Electron
npm run glass:kill --prefix glass-app

# Normal dev (production-parity, auto-rebuild on main source changes)
npm run glass:dev
# or from anywhere in monorepo:
npm run glass:dev --prefix glass-app

# Vite HMR (macOS fixes applied; optional)
npm run glass:dev:vite

# Prove boot without manual watch
npm run prove:run --prefix glass-app

# Corrupt / partial embedder cache — delete and relaunch
rm -rf ~/Library/Application\ Support/Electron/models
# Packaged app userData:
# rm -rf ~/Library/Application\ Support/IIVO\ Glass/models

# Skip embedder if models keep failing
IIVO_GLASS_SKIP_EMBEDDER=1 npm run glass:dev --prefix glass-app
```

### What to look for in terminal (healthy boot)

```
[glass-run-built] building (missing or stale out/)…   ← only when sources changed
[glass-run-built] starting Glass (production-parity built bundle)
[IIVO Glass] boot: splash timer (10s)…
[IIVO Glass] boot: dismissing splash
GLASS_BOOT_OK: splash finished, chrome shown   ← prove:run only
```

If you never see `boot: …` lines after changing main-process code, the bundle is stale — run `npm run build --prefix glass-app` or touch a stale-check file and restart.

---

## Aletheia Phases 0–8

Committed `main` includes Aletheia P0–B8 (`CURSOR_CONTEXT.md`). Boot fixes did **not** change Aletheia product UI logic. Running `npm run glass:dev` uses latest source + uncommitted boot recovery changes until merged and a new DMG is built.

---

## Idle performance validation (2026-06-27)

### Product goal

Users should not pay a high CPU/GPU/fan “price” to keep Glass on screen. **Claude Desktop and Cursor are effectively silent at idle** — Glass should approach that when the user is not in Companion, Listen, or an active session.

### Before Tier 1 (broken / heavy idle)

- Fan often ramped within seconds of boot.
- Screen digest first run at **8s** (full display capture + Vision API).
- Embedder init at every boot (20s retry on corrupt cache).
- Sidecar + permission monitor during splash.
- App-switch AppleScript every **1.5s** always.

### After Tier 1 (user-tested, dock-only idle)

| Observation | Result |
|-------------|--------|
| Glass open, Companion off, not using Listen | **Quiet for 4–5+ minutes**; only occasional tiny fan tick |
| Terminal | Agent bus heartbeats only — no digest, Deepgram, or embedder spam |
| Kill Glass (`glass:kill` / Ctrl+C) | Noise calms over **~3 minutes** → **near silent** |
| Conclusion | Residual idle hum is Glass baseline (renderers + light polls), not macOS generally broken |

### Residual idle cost (Glass open, user doing nothing)

Still running — this explains the low baseline vs Claude/Cursor:

| Source | Interval | CPU/GPU |
|--------|----------|---------|
| 6 Electron renderers (overlay fullscreen transparent + dock + command bar + panel + notes + terminal) | Always | GPU compositing (WindowServer) |
| App-switch `osascript` | 3s (companion off) | Small CPU spikes |
| Clipboard read | 2s | Very light |
| Aletheia sidecar health poll | 15s idle | Light |
| Permission monitor poll | 15s idle | Light |
| Agent bus heartbeat | 30s | Negligible |

**Not running at dock-only idle:** screen digest, embedder init, Vite-scale parallel loads.

### Tier 1 optimizations (implemented 2026-06-27)

| Change | Detail |
|--------|--------|
| Screen digest gated | Only when `companionModeActive` and not privacy; first delay **60s** (was 8s) |
| Embedder lazy init | No boot `notifyMemoryServicesReady()`; init on memory use or API key connect |
| App-switch poll throttle | **3s** companion off, **1.5s** companion on |
| Deferred sidecar + permission monitor | `startGlassBackgroundWork()` only (not during splash) |

Tier 0: clear corrupt embedder cache:

```bash
rm -rf ~/Library/Application\ Support/Electron/models
```

---

## Tier 2 plan (Perplexity synthesis — 2026-06-27)

External review aligned with our diagnosis: **Tier 1 removed the expensive mistakes**; **Tier 2 must attack structural GPU/compositor cost and polling discipline** to match Claude/Cursor silence at dock-only idle.

### Why Claude/Cursor are silent vs Glass

| Claude / Cursor at idle | Glass at dock-only idle (today) |
|-------------------------|----------------------------------|
| One (or few) windows, no fullscreen transparent compositor | Fullscreen transparent overlay + dock + command bar at boot (panel/notes/terminal lazy) |
| Minimal always-on polling | At dock-only idle: no app-switch AppleScript; no clipboard poll unless intel enabled; sidecar/permission every 60s |
| No continuous GPU layer over entire display | WindowServer compositing full-screen transparent panel |

Fullscreen transparent Electron windows are a **worst-case GPU scenario** on macOS — not broken, but structurally noisier than dock-only panels. Workarounds from overlay/Electron community: avoid exact display bounds (width/height minus ~2px), avoid menu-bar overlap, no idle animations on transparent DOM.

**Polling:** macOS has no true clipboard-change events for all apps — polling is normal, but checks should be **cheap** (`NSPasteboard` / Electron `changeCount` before `readText()`). **AppleScript every few seconds is the expensive poll** — gate or suspend when companion off.

### Perplexity-ranked implementation order

| Phase | Work | Files / notes |
|-------|------|----------------|
| **2A** | Overlay compositor — `workArea` bounds audit; −2px inset experiment; remove idle overlay animations/CSS effects | `windows.ts`, overlay CSS |
| **2B** | Collapse idle windows — lazy-create panel/notes/terminal; destroy when unused | `windows.ts` `createWindows` |
| **2C** | Polling discipline — app-switch 15–30s or **suspend** when companion off; sidecar adaptive backoff; clipboard `changeCount` before read | `index.ts` `startPerceptionLoop` |
| **2D** | Split overlay bundle (~6.7MB) — idle shell vs heavy features; lazy `import()` | overlay Vite entry |
| **2E** | Coalesce `push()` when observation plane unchanged | `index.ts` |

### Shipping benchmarks (DMG gate)

**Baseline:** 2020 M1 MacBook (noisy here → worse on Intel). **Regression:** one 2018–2019 Intel Mac.

| Metric | Target (15 min dock-only: Companion off, Listen off) |
|--------|------------------------------------------------------|
| % CPU (Electron + Helpers) | **0–1%** sustained |
| Energy Impact (Activity Monitor) | **Low** — like 1Password / quiet menu-bar apps |
| GPU / WindowServer | No sustained elevation when overlay static |
| Subjective | Near-silent fan; kill Glass → near silent within ~3 min |

**Protocol:** boot → 10s splash → idle 15 min → log CPU/Energy at 1, 5, 10, 15 min; compare to Claude/Cursor on same machine; record results below.

### Tier 2 checklist

- [ ] 2A Overlay bounds + −2px experiment + idle animation audit — **skipped** (overlay stays as-is)
- [x] 2B Lazy-create panel, notes, terminal at first use (`ensurePanelWindow`, `ensureNotesPadWindow`, `ensureTerminalWindow`)
- [x] 2C Suspend app-switch AppleScript when companion off and no live session; restart on companion/listen toggle
- [x] 2C Clipboard poll paused when companion off and clipboard intelligence disabled; 5s interval when enabled but companion off
- [x] 2C Sidecar + permission idle poll 15s → **60s** when companion inactive
- [ ] 2D Overlay bundle code-split
- [ ] 2E Coalesce redundant `push()`
- [ ] Bench: M1 15-min profile (fill in table below)
- [ ] Bench: Intel spot-check

### Tier 2B/2C shipped (2026-06-27)

**2B — lazy windows** (`windows.ts`): boot creates dock, overlay, command bar only. `ensurePanelWindow`, `ensureNotesPadWindow`, `ensureTerminalWindow` create on first use. Overlay untouched.

**2C — polling** (`index.ts`, sidecar hosts):
- App-switch AppleScript **suspended** when companion off and no live listen session; resumes on companion/listen toggle.
- Clipboard poll **stopped** when companion off and clipboard intelligence disabled; **5s** when intel on but companion off; **2s** with companion.
- Sidecar + permission monitor idle interval **15s → 60s** when companion inactive.

**Validate:** `npm run glass:kill --prefix glass-app && npm run glass:dev` → idle 15 min dock-only; expect fewer renderer processes and lower CPU vs pre-Tier-2.

### Benchmark log (fill when Tier 2 ships)

| Time | M1 % CPU | M1 Energy | Notes |
|------|----------|-----------|-------|
| 1 min | | | |
| 5 min | | | |
| 10 min | | | |
| 15 min | | | |

### Tier 1 completed

1. ~~Gate screen digest when companion off~~
2. ~~App-switch 3s idle / 1.5s companion~~
3. ~~Lazy embedder~~
4. ~~Defer sidecar + permission past splash~~

---

## Perplexity research brief (archived)

Original prompt sent for external review. Findings captured in **Tier 2 plan** above. Key takeaway: attack compositor surface and AppleScript polling before bundle splits; ship only after M1 idle benchmarks pass.

---

## Key files (quick index)

```
glass-app/
  scripts/glass-run-built.mjs      # dev launcher + stale rebuild
  scripts/glass-kill.mjs           # orphan process cleanup
  scripts/prove-glass-run-built.mjs
  src/main/index.ts                # deferred background work, splash timer boot
  src/main/windows.ts              # boot sequence, vite stagger, instant finishSplash
  src/shared/bootSplash.ts         # splash gating (off for vite URL)
  src/shared/bootTiming.ts         # GLASS_BOOT_DURATION_MS = 10_000
  src/main/glassEmbedder.ts        # embedder failure handling
  src/main/glassMemoryEngine.ts    # startup embedder timeout
  docs/reports/GLASS_BOOT_RECOVERY.md  # this document
```

---

## Session notes (for the next person)

- **Default dev path is built bundle**, not vite. Rebuild is ~4–30s depending on renderer; main-only changes are fast when stale check triggers.
- **Don't assume `out/` matches `src/`** — always check for `boot:` log lines after editing main process.
- **Splash at 100% ≠ boot complete** until main logs `boot: dismissing splash`.
- **First boot after deleting models** is slow (download + init); subsequent boots are faster.
- **Ctrl+C** should quit cleanly now; if dock ghost persists, run `glass:kill`.
- **Idle noise:** Tier 1 + Tier 2B/2C (lazy windows, polling discipline). Overlay compositor untouched per product constraint.
- **Kill test:** if machine goes near-silent after killing Glass, residual hum while running is expected Glass baseline.
- **Ship gate:** M1 0–1% CPU / Low Energy Impact over 15 min dock-only before DMG release.

---

## Related docs

- [GLASS_KNOWN_FAILURES.md](./GLASS_KNOWN_FAILURES.md) — symptom → first-look runbook (command bar invisible, renderer crashes, stale `out/`, setBounds-during-load)
