# Glass — known failures & first-look runbook

Quick reference for **symptoms we have already hit**, what actually caused them, and **where to look first** next time. Complements the boot-specific timeline in [GLASS_BOOT_RECOVERY.md](./GLASS_BOOT_RECOVERY.md).

Last updated: **2026-06-28** (command bar invisible / renderer crash session).

---

## How to use this doc

1. Match your **symptom** in the table below.
2. Run the **fast checks** for that category (usually E2E + renderer console).
3. Do **not** assume the first plausible cause (z-order, window hidden, stale cache) until the renderer DOM is verified.

---

## Symptom → look here first

| Symptom | Usually **not** the cause | Check first |
|--------|---------------------------|-------------|
| Frame + builder strip visible, **command bar missing** | Z-order, `moveTop`, overlay covering bar | Command window DOM empty? Renderer `ReferenceError`? |
| Logs say `commandBar=… visible=yes` but user sees nothing | “Window hidden” | `#root` empty in `command.html` — OS window exists, React never painted |
| `commandBarStackHeightPx: 0` in Glass state | Layout math wrong | Renderer never mounted or never measured stack |
| E2E: `[data-testid="glass-command-bar"]` not found | Bounds off-screen | Page error in command bundle; import missing in `CommandBar.tsx` |
| Dock/overlay OK, command bar window exists, bounds OK | Separate preload issue | Console on **command** page only |
| Boot splash 100%, long blank, then partial UI | Aletheia logic | Stale `out/`; overlay load blocking; see boot doc |
| `glass:dev` hang, no splash | Production bug | Vite + hidden macOS panel windows; use built `glass:dev` |
| Frame + strip **disappeared** after a “fix” | Regression from hosting command bar inside overlay | Revert overlay-hosted command bar; keep independent OS window |
| Only dock after killing terminal | Glass quit cleanly | Orphan Electron — `npm run glass:kill` |

---

## Incident: command bar invisible (2026-06-28)

### What we saw

- Glass frame (overlay) and builder strip rendered normally.
- Dock visible.
- Command bar OS window reported **`visible=yes`** with correct bounds in diagnostics.
- User saw **no composer pill** above the strip.

### What we wrongly suspected (red herrings)

These were tried and did **not** fix the user-visible bug:

| Attempt | Why it seemed plausible | Why it failed |
|---------|-------------------------|---------------|
| Raise command bar `relativeLevel` / `moveTop` | Full-screen overlay can cover chrome | Window was already “on top”; DOM was empty |
| macOS `pop-up-menu` always-on-top level | Panel stacking quirks | Same — no pixels to show |
| Defer `setBounds` until `did-finish-load` | Known macOS load abort | HTML loaded; ES module still crashed before paint |
| Host `<CommandBar />` inside overlay | Single compositor stack | **Regression** — frame and strip broke; reverted |
| Child window `parent: overlay` | Coordinate sync | Still invisible; reverted |

**Lesson:** If diagnostics say the command bar window is visible and on-screen, verify **renderer content** before touching window manager code.

### Actual root cause

React **crashed on first render** in the command bar window:

```
ReferenceError: ensureAletheiaDispatchRegistered is not defined
    at command-*.js (CommandBar useEffect)
```

`CommandBar.tsx` called `ensureAletheiaDispatchRegistered()` in a `useEffect` but **forgot the import**. The module loaded, React started mounting, then threw — leaving `#root` permanently empty.

### Fix

```typescript
// glass-app/src/renderer/command/CommandBar.tsx
import { ensureAletheiaDispatchRegistered } from "../aletheia/registerAletheiaDispatch.ts";
```

### Hardening added (still worth keeping)

| Change | File | Purpose |
|--------|------|---------|
| Block `setBounds` until React mounts | `windows.ts` | macOS aborts in-flight ES module load on bounds change |
| `commandBarRendererBusy()` until mount IPC | `windows.ts` | Don’t treat `did-finish-load` as “ready” — HTML ≠ React |
| `glass:renderer-mounted` IPC handler | `index.ts` + `command/main.tsx` | Main learns when command bar actually painted |
| 15s mount fallback + warning | `windows.ts` | Avoid stuck layout if IPC never fires |

---

## Pattern: “OS window healthy, UI missing”

Any Glass chrome window (dock, command bar, overlay) can show this split:

```
OS layer OK          Renderer layer broken
─────────────        ──────────────────────
BrowserWindow        #root innerHTML length = 0
.isVisible() true    data-testid elements missing
bounds on-screen     commandBarStackHeightPx = 0
did-finish-load      pageerror / console.error in bundle
```

### Fast verification (manual or script)

Connect via CDP (E2E uses port **19222** when `IIVO_GLASS_E2E=1`) and run on the command page:

```javascript
({
  rootLen: document.getElementById("root")?.innerHTML?.length ?? 0,
  hasCommandBar: !!document.querySelector('[data-testid="glass-command-bar"]'),
  hasGlass: typeof window.glass !== "undefined",
})
```

If `rootLen === 0` after ~20s → **renderer crash or module never ran**, not z-order.

### Capture console errors (best signal)

Hook **before** waiting:

```bash
cd glass-app
npm run build
npm run e2e -- --grep "app launches and core windows"
```

On failure, diagnostics log open pages + window metadata. For deeper detail, attach Playwright listeners:

- `page.on("console")` — especially `error`
- `page.on("pageerror")` — uncaught exceptions
- `page.on("requestfailed")` — broken asset loads

Typical crash signatures:

- `ReferenceError: … is not defined` → **missing import** in a component used only in that window
- `TypeError: Cannot read properties of undefined` → bad assumption in mount path
- Silent empty root, no pageerror → **setBounds/show during module load** (macOS) or stale bundle

---

## Pattern: setBounds / relayout during renderer load (macOS)

Documented in boot recovery; applies to **command bar** and **dock**.

| Signal | Meaning |
|--------|---------|
| `did-finish-load` fired, `#root` still empty | ES module may still be loading — **do not** `setBounds` yet |
| Dock `did-finish-load` triggers `restack()` → command bar `setBounds` | Can abort command bar module load |
| Fix | Defer layout until `glass:renderer-mounted` or `dom-ready` + confirmed DOM |

**Files:** `glass-app/src/main/windows.ts` — `applyCommandBarLayout`, `ensureCommandBarWindowVisible`, `relayoutChromeWindows`, `stackGlassWindows`.

**Rule of thumb:** `did-finish-load` means HTML parsed, **not** React mounted.

---

## Pattern: stale `out/` bundle (dev trap)

| Symptom | Cause |
|---------|--------|
| Source edited, behavior unchanged | `npm run glass:dev` runs old `out/main/index.js` |
| Missing new log lines after edit | Same |
| “Fixed” bug still reproduces | Rebuild not triggered |

**Fix:** `npm run build --prefix glass-app` then restart. `glass-run-built.mjs` rebuilds when key main files are newer than `out/` — if unsure, build manually.

---

## Pattern: overlay-hosted command bar (do not repeat)

**Symptom after experiment:** Frame and builder strip disappear; command bar still wrong.

**Cause:** Mounting command bar inside overlay changes overlay hit-testing, load order, and stacking assumptions.

**Current architecture:** Independent `command.html` OS window. Keep it that way unless deliberately redesigning with full E2E coverage.

---

## Pattern: missing imports in window-specific entry points

Command bar, dock, overlay, and panel are **separate Vite entries**. A function used in `CommandBar.tsx` is **not** automatically available because overlay imports it elsewhere.

| Entry | Main file | Common pitfall |
|-------|-----------|----------------|
| Command bar | `src/renderer/command/main.tsx` → `CommandBar.tsx` | New `useEffect` hook calling shared helper without import |
| Dock | `src/renderer/dock/main.tsx` | Same |
| Overlay | `src/renderer/overlay/main.tsx` | Large bundle — errors may surface later |

**When adding a `useEffect` that calls a registrar/bootstrap helper:** grep for existing imports in sibling components (`BuilderStrip.tsx`, `OverlayFeedCard.tsx`) and copy the import pattern.

---

## E2E tests to run first

From repo root or `glass-app/`:

```bash
# Core windows — command bar testid, overlay root, dock
npm run build --prefix glass-app
npm run e2e --prefix glass-app -- --grep "app launches and core windows"
```

This test failed for **weeks** with “element not found” while OS metadata looked perfect — because it correctly detects **missing DOM**, not missing windows.

Other useful greps:

```bash
npm run e2e --prefix glass-app -- --grep "command bar"
npm run e2e --prefix glass-app -- --grep "builder strip"
```

---

## Key files by problem area

| Area | Files |
|------|--------|
| Window create / show / stack | `src/main/windows.ts` |
| Command bar UI | `src/renderer/command/CommandBar.tsx`, `command/main.tsx` |
| Overlay / frame / strip | `src/renderer/overlay/Overlay.tsx`, builder strip components |
| Layout math | `src/shared/glassLayoutMath.ts`, `src/main/glassLayoutManager.ts` |
| Boot / splash | `src/main/index.ts`, `src/main/bootOnboarding.ts`, `src/shared/bootSplash.ts` |
| Dev launcher | `scripts/glass-run-built.mjs`, `scripts/glass-kill.mjs` |
| E2E | `tests/e2e/glass-critical.spec.ts`, `tests/e2e/helpers/launchGlassElectronForE2E.ts` |
| Built output | `out/renderer/command.html`, `out/renderer/assets/command-*.js` |

---

## Glass state / log fields cheat sheet

| Field / log | Healthy | Broken |
|-------------|---------|--------|
| `windows.commandBarVisible` | `true` | `false` (hidden by boot/onboarding/IDE suppress) |
| `commandBarStackHeightPx` | `> 0` after mount | `0` → renderer didn’t measure stack |
| Diagnostics `commandBar=… visible=yes` | Necessary not sufficient | Can be yes with empty renderer |
| `ideChromeSuppressed` | `false` in normal Glass | `true` hides dock + command bar |
| `glassBootPending` / onboarding flags | false after boot | true → chrome intentionally hidden |

---

## Decision tree (command bar missing)

```
Command bar not visible?
│
├─ Is overlay/frame visible?
│   ├─ NO → boot / overlay load path → see GLASS_BOOT_RECOVERY.md
│   └─ YES
│       ├─ Run E2E "app launches and core windows"
│       │   ├─ FAIL: element not found
│       │   │   └─ CDP console on command.html
│       │   │       ├─ ReferenceError / pageerror → fix renderer (imports, mount crash)
│       │   │       └─ no error, root empty → setBounds-during-load, stale out/
│       │   └─ PASS → likely local stale build or orphan process → rebuild + glass:kill
│       │
│       └─ state.commandBarStackHeightPx === 0 ?
│           └─ YES → renderer never mounted (see above)
```

---

## Related docs

- [GLASS_BOOT_RECOVERY.md](./GLASS_BOOT_RECOVERY.md) — splash hang, vite vs built bundle, embedder cache, orphan processes
- [GLASS_CONTRACT.md](../architecture/GLASS_CONTRACT.md) — intended window architecture
- [ALETHEIA_COMPUTER_OPERATOR.md](../architecture/ALETHEIA_COMPUTER_OPERATOR.md) — computer operator UI surfaces (touches command bar toggles)

---

## Changelog

| Date | Incident | Resolution |
|------|----------|------------|
| 2026-06 | Boot hang / splash stuck | Production-parity `glass:dev`, stale `out/` rebuild, splash sequencing — see boot doc |
| 2026-06-28 | Command bar invisible, frame/strip OK | Missing `ensureAletheiaDispatchRegistered` import in `CommandBar.tsx` |
| 2026-06-28 | False z-order / stacking rabbit hole | Empty `#root`; OS visibility was a red herring |
| 2026-06-28 | Overlay-hosted command bar experiment | Reverted — broke frame/strip |
