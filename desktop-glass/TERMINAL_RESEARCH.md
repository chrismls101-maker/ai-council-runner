# IIVO Glass Terminal — Research & Build Roadmap
*Researched June 2026*

> **Standalone download (paused):** product boundary, pricing options, and Glass-only feature rules → [`TERMINAL_STANDALONE.md`](./TERMINAL_STANDALONE.md).

---

## Terminal Landscape 2026

### Top Emulators Ranked

**Ghostty** — performance king on macOS. Built in Zig with Metal GPU rendering, 2ms input latency, ~45MB RAM, native UI on each platform, free and open source. No AI, no plugin system. What serious devs use as daily driver.

**Warp** — the AI-native terminal. Command output grouped into collapsible blocks (like an IDE), persistent input bar at bottom, `#` prefix activates natural language → shell, Agent Mode for autonomous multi-step tasks, inline error debugging, next-command suggestions watching shell output. Credit-based pricing. 8ms latency vs Ghostty's 2ms — users accept the tradeoff for AI.

**WezTerm** — the Swiss Army knife. Lua-configured, cross-platform (Windows too), supports every graphics protocol (Kitty, Sixel, iTerm2), tabs/splits/multiplexer built in.

**Kitty** — Linux power-user terminal. The Kitty graphics protocol is now the standard others implement. Built-in sessions replaced tmux for many users in 2025.

**iTerm2** — kitchen-sink macOS veteran. Every feature imaginable, 12ms latency and highest RAM. Still king for AppleScript/automation.

**Wave Terminal** — most architecturally similar to what we're building. Electron + xterm.js v6 + node-pty, open source, AI-integrated with BYOK (Claude, GPT, Gemini, Ollama). Context-aware AI reads scrollback and files. We have a massive advantage: overlay, voice, screen capture, and the full IIVO intelligence layer.

---

## xterm.js Addons Available Now

All under `@xterm/` namespace, v5.5+ compatible, all work in Electron:

| Package | What it adds |
|---|---|
| `@xterm/addon-search` | Ctrl+F in-terminal search with highlight + navigation |
| `@xterm/addon-web-links` | Auto-detects URLs, Cmd+click to open |
| `@xterm/addon-ligatures` | Programming ligatures (requires Node.js env — Electron is perfect) |
| `@xterm/addon-image` | Inline images via SIXEL + iTerm2 IIP protocol |
| `@xterm/addon-canvas` | Canvas/WebGL2 renderer — dramatically better throughput than DOM renderer |

---

## Feature Build List

### 🟢 Quick Wins (hours each)

1. **xterm.js addon stack** — install all 5 addons. Canvas renderer alone makes scrolling feel premium. Ligatures + web-links are free UX polish. ~2 hours total.

2. **Cmd+K clear + Cmd+F search** — search addon gives iTerm2-style find bar. Map Cmd+K to `terminal.clear()`. Two lines of code each.

3. **Command block grouping** — parse PTY output to detect prompt → output → prompt boundaries. Wrap each block in a styled div. Gives Warp's most-loved feature in simplified form. Store blocks in React state for individual copy.

4. **One-click copy output** — with blocks parsed, add a copy button to each block. Devs love this in Warp.

5. **Scrollback size bump** — xterm.js defaults to 1000 lines. Set to 50,000. One config line.

### 🟡 Medium Effort (days each)

6. **Explain Last Error on hotkey (⌘+E)** — grab last command + output from scrollback, send to Anthropic: *"This command failed. Explain why and suggest a fix in 2 sentences."* Show result in overlay tooltip or IIVO panel. No other terminal does this inside an overlay that stays on top.

7. **Natural language → shell (⌘+Space in terminal)** — type English, hit hotkey, Claude converts to shell command, injects into PTY input buffer (don't run — user confirms with Enter). Uses our Anthropic key, similar to Warp's `#` prefix.

8. **Session context feed to IIVO panel** — rolling buffer of last N commands + outputs. When user triggers IIVO Ask, prepend terminal context. "Why did that npm install fail?" becomes answerable because IIVO already has the context.

9. **Auto-title tabs from running command** — parse PTY stream for foreground process name (`git`, `npm`, `python`) and update tab label dynamically.

10. **Inline image rendering** — `@xterm/addon-image`. Python scripts that output charts via iTerm2 inline protocol render right in terminal. AI tools producing diagrams benefit from this.

### 🔴 Ambitious (sprint each)

11. **Voice → shell** — we have mic + Deepgram key. Hold hotkey, speak command, Deepgram transcribes, Claude converts to shell, inject into PTY. User hits Enter to confirm. No terminal has this as a first-class experience. We make it native because we're an always-listening overlay.

12. **Screen-aware terminal assistant** — ⌘+Shift+E captures screen + sends with terminal scrollback to Claude Vision. *"The terminal on screen shows this error. Here's the last 50 lines of output. What's wrong and how do I fix it?"* Context includes whatever app crashed, IDE showing the file — not just raw terminal text. Only possible because of the overlay architecture.

13. **AI command suggestions sidebar** — slim right-side pane watching current directory + last command, showing 3 suggested next commands with explanations. Updates after each command completes. Warp Agent Mode but lighter, in our overlay.

14. **Persistent smart scrollback** — log all terminal sessions to disk (encrypted, per-project), searchable with natural language via Claude. "Find the command I ran last week to deploy to staging" → Claude searches stored sessions and returns exact command.

---

## The Moat

Every AI terminal — Warp, Wave, Fig/Amazon Q — is a standalone app competing for window space. **IIVO Glass is always on top, always listening, and can see the entire screen.** The terminal inside IIVO isn't just a terminal — it's the command layer of an AI overlay.

Features 6, 8, 11, and 12 are only possible because of the overlay architecture. That's the differentiator.

**Fastest path to "people want to use the IIVO terminal":**
- Addon stack (hours)
- Explain-last-error hotkey (a day)  
- Voice → shell (a sprint)

Those three make it feel like something they haven't seen before.

---

## Build Log — Tasks Completed

*Built June 2026 — all features verified with dedicated review agents*

### Task #34 — xterm.js Full Addon Stack ✅
Installed all 5 addons under `@xterm/` namespace: canvas (WebGL2 renderer), search, web-links, ligatures, image. Load order matters: fit/search/webLinks/image load before `term.open()`, canvas/ligatures after. Scrollback set to 50,000 lines. All addons disposed on component unmount.

**Files:** `GlassTerminalPanel.tsx`, `package.json`

---

### Task #35 — Cmd+K / Cmd+F Hotkeys ✅
Cmd+K calls `terminal.clear()` (focus-scoped to terminal container). Cmd+F toggles the xterm.js SearchAddon FindBar, gated on `terminalReady`. Keydown listener uses `capture: true` and is cleaned up on unmount.

**Files:** `GlassTerminalPanel.tsx`

---

### Task #36 — Command Block Grouping ✅
Built `useTerminalBlocks` hook wrapping `terminalBlockParser.ts` — a state machine that parses the raw PTY stream into discrete `TerminalBlock` objects. OSC 133 shell integration sequences (`ESC ] 133 ; A|B|C|D`) are the primary signal; heuristic prompt detection (`(?<!\d)%\s*$`, `\$\s+$`) is the fallback. Blocks have `command`, `output`, `status` (`success | error | unknown | running`), `exitCode`, and `durationMs`. Rolling 500-block window.

> **Post-review fix:** Parser extracted to `terminalBlockParser.ts` with single-pass OSC segment accumulation; plain chunks after OSC lock-in no longer dropped. Unit tests in `terminalBlockParser.test.ts`.

**Files:** `terminalBlockParser.ts`, `useTerminalBlocks.ts`, `GlassTerminalPanel.tsx`

---

### Task #37 — One-Click Copy Buttons ✅
Each rendered command block has a copy button that writes the block's output to clipboard. `CommandBlock` component receives the block data; `BlocksPanel` maps blocks to components. Copy button shows a ✓ check for 1.5s after click.

**Files:** `GlassTerminalPanel.tsx`, `GlassTerminalPanel.css`

---

### Task #38 — 50k Scrollback ✅
Single config change: `scrollback: 50000` in xterm.js Terminal constructor. Covered under Task #34.

---

### Task #39 — Explain Last Error ⌘+E ✅
Hotkey grabs the last error block from the command buffer, sends `{ command, output }` to Claude via `glass:terminal-explain` IPC (main process, output capped at 8000 chars). Result displays in `ExplainOverlay` — a glass-styled card overlaid on the terminal. Overlay has loading / done / error phases. `renderMarkdownInline` renders code spans and bold inline. Escape dismisses. Copy button available on result.

> **Post-review fix:** IPC sender corrected to `isTerminalIpcSender` (terminal window, not overlay). Explain now targets `status === "error"` blocks first. See *Code Review, Fixes & Verification* below.

**Key fix:** `triggerExplain` callback must be declared before the hotkey `useEffect` that references it (TS2448).

**Files:** `ipc.ts`, `main/index.ts`, `preload/index.ts`, `GlassTerminalPanel.tsx`, `GlassTerminalPanel.css`

---

### Task #40 — Natural Language → Shell ⌃+Space ✅
Ctrl+Space toggles `NLCommandBar` — a floating input bar above the terminal. User types English, hits Enter → sends to Claude via `glass:nl-to-shell` IPC, response (with backticks stripped) previewed with a green left border. User hits Enter again to inject into PTY, or edits first. Ctrl+Space or Escape dismisses.

**Key fixes:**
1. `handleInputKey` Enter calls `e.stopPropagation()` — prevents double PTY injection from event bubbling to outer div's `handlePreviewKey`.
2. `submit()` only called when phase is `"idle"` or `"error"` — prevents concurrent IPC calls during loading.
3. Button label shows `⌃` not `⌘` (hotkey is Ctrl+Space, not Cmd+Space — avoids macOS Spotlight conflict).

**Files:** `ipc.ts`, `main/index.ts`, `preload/index.ts`, `GlassTerminalPanel.tsx`, `GlassTerminalPanel.css`

---

### Task #41 — Terminal Context → IIVO AI Panel ✅
After each command completes, a 400ms debounced effect pushes the last 15 finished blocks to main process via `glass:terminal-context-push` (fire-and-forget `ipcMain.on`). Main stores them in `terminalContext.ts` — a 15-block rolling buffer with a 10-minute staleness guard. When user submits an IIVO AI query, `getTerminalContextString()` is appended to `userContext` (additive — no change when context is null).

> **Post-review fix:** IPC sender corrected to `isTerminalIpcSender`; main-side `normalizeTerminalContextBlocks()` validates and caps payloads. See *Code Review, Fixes & Verification* below.

**Key fix:** Type predicate `isFinished` for proper TypeScript narrowing — no unsafe `as` cast on `b.status`.

Format: `--- Built-in terminal session ---\n$ cmd ✓ [2.3s]\n  └ output (truncated to 400 chars)\n---`

**Files:** `ipc.ts`, `main/index.ts`, `main/terminalContext.ts` (new), `preload/index.ts`, `GlassTerminalPanel.tsx`

---

### Task #42 — Auto-title Terminal Tabs ✅
Two parallel title sources, last-write wins:

1. **OSC 0/2 sequences** — parsed in the PTY data handler with `OSC_TITLE_RE` (lastIndex reset before each loop). Programs like `vim`, `git` set their own titles this way instantly.
2. **Foreground process poll** — `startTitlePolling(termId)` runs `pgrep -P <shellPid>` then `ps -o comm= -p <childPid>` every 2 seconds via `getForegroundProcessName()` in `glassTerminal.ts`. Returns null when shell is foreground (no children), clearing any stale title.

**Key fix:** `will-quit` handler iterates `titlePollIntervals.keys()` and calls `stopTitlePolling` before `killAllPtySessions()` — because `appIsQuitting = true` causes the PTY `onExit` callback to early-return, which would otherwise orphan all intervals.

**Files:** `ipc.ts`, `main/index.ts`, `main/glassTerminal.ts`, `preload/index.ts`, `GlassTerminalPanel.tsx`

---

### Task #43 — Inline Image Rendering ✅
`@xterm/addon-image` loaded in the addon stack (Task #34). Supports SIXEL and iTerm2 Inline Image Protocol (IIP). Python scripts using `matplotlib` + `imgcat`, or any tool writing `ESC ] 1337 ; File=...` sequences, render images directly in the terminal cell grid.

**Files:** `GlassTerminalPanel.tsx`

---

### Task #44 — Voice → Shell ⌘+Shift+V ✅
`VoiceShellBar` component: hotkey starts mic recording (`MediaRecorder` + `getUserMedia`), elapsed timer shows recording duration, stopping sends audio blob to main via `glass:voice-shell-transcribe` IPC. Main uses Deepgram pre-recorded REST API (`POST /v1/listen`) — isolated from the existing streaming Deepgram session. Transcript piped through `nlToShell` (Task #40 infrastructure) to produce a shell command. User reviews and confirms with Enter.

**Security:** `voiceShellTranscribe` handler uses `isTerminalIpcSender` — terminal is a separate BrowserWindow from overlay. DEEPGRAM_API_KEY never leaves main process. Language follows `glassSettings.uiLocale` via `deepgramLanguageCode()`.

**Key fixes:**
- `Buffer.from(new Uint8Array(rawBuffer))` — ArrayBuffers lose prototype across IPC, must reconstruct.
- `stoppedRef` race guard prevents double `stopRecording()` calls.
- `releaseMic()` stops all MediaStream tracks on dismiss, Escape, unmount, AND after audio is assembled.
- Hotkey check: `e.key === "V"` (uppercase — Shift is held).

**Files:** `ipc.ts`, `main/index.ts`, `preload/index.ts`, `GlassTerminalPanel.tsx`, `GlassTerminalPanel.css`

---

---

### Task #45 — Screen-Aware Terminal Assistant ⌘+Shift+E ✅

**What it does:** Hotkey captures the full screen in the main process (never in renderer), packages it alongside the last 15 terminal blocks, sends a multimodal request to Claude Vision via the existing `latestScreenshot` + `visualIntent` fields on `GlassAskRequest`, and streams the analysis into a `VisionOverlay` — a top-anchored glass card distinct from the bottom-anchored Explain overlay.

**Data flow:** `⌘+Shift+E` in renderer → IPC `glass:terminal-vision-analyze` (terminal-window security) → `desktopCapturer.getSources({ types: ['screen'] })` → resize thumbnail → base64 PNG → Claude Vision → stream result → `VisionOverlay`.

**Post-review fixes (Cursor audit):**
- Now calls `captureDisplayById()` on the user's selected display rather than blindly taking `sources[0]` at 1440×900.
- Hides overlay and command bar before capture; keeps terminal window visible so Claude can read on-screen errors — restored in a `finally` block.
- `explainGenRef` pattern applied to vision too — stale responses can't overwrite newer state.

**IPC security:** `event.sender === getWindows()?.terminal?.webContents` (NOT `isOverlayIpcSender`).

**Files:** `ipc.ts`, `main/index.ts`, `preload/index.ts`, `GlassTerminalPanel.tsx`, `GlassTerminalPanel.css`

---

### Task #46 — AI Command Suggestions ✅

**What it does:** OSC 7 (`ESC ] 7 ; file://host/path BEL`) passively tracks cwd on every `cd`. 800ms after any command block reaches a finished status, three AI-powered suggestion chips slide up from the bottom of the terminal. Clicking a chip injects the command into PTY **without** a trailing newline — user reviews and presses Enter. Any keypress dismisses the bar.

**Data flow:** block → `status: success|error|unknown` → 800ms debounce → IPC `glass:terminal-suggest` → Claude → JSON array of `{ command, why }` → `SuggestionsBar` chips → click → `sendPtyInput(termId, command)` (no `\n`).

**Key decisions:**
- Auto-show / auto-dismiss — no toggle needed. Zero friction: appears when relevant, gone the moment you start typing.
- Suggestion chips inject WITHOUT `\n` — auto-running a speculative suggestion on a single click is dangerous.
- Error silently falls to idle — suggestions are non-critical; no error UI shown.

**Post-review fixes (Cursor audit):**
- Added `suggestGenRef` — stale API responses can't reopen the bar after the user already dismissed or started a new command.
- Gen ref bumped on: new running block, explicit dismiss, keypress dismiss, session switch.

**IPC security:** terminal-window check on handler.

**Files:** `ipc.ts`, `main/index.ts`, `preload/index.ts`, `GlassTerminalPanel.tsx`, `GlassTerminalPanel.css`

---

### Task #47 — Persistent Smart Scrollback ⌘+Shift+F ✅

**What it does:** Every finished terminal command is encrypted and written to SQLite. ⌘+Shift+F opens a search bar — type plain English, Claude searches plaintext summaries and returns row IDs, decrypt on demand, display as cards with Run and Copy actions.

**Storage:** `better-sqlite3` at `~/Library/Application Support/IIVO Glass/scrollback.db`. WAL mode. Two tables: `sessions` and `commands`. Indexes on `session_id` and `started_at`.

**Encryption:** AES-256-GCM. 32-byte key generated once, encrypted with Electron `safeStorage` (macOS keychain), stored to `scrollback.key` (mode 0600). Per-row: 12-byte IV + 16-byte auth tag + ciphertext, stored as a single BLOB. `command` and `output` fields encrypted; `command_plain` (truncated to 120 chars) kept in plaintext for Claude search summaries.

**NL search flow:** user query → main fetches last 200 `command_plain` summaries → Claude returns JSON array of matching row IDs → `getByIds` decrypts only those rows → results rendered as cards.

**Post-review fixes (Cursor audit):**
- `scrollbackValidation.ts` — pure validation helpers, testable without the native module.
- `normalizeScrollbackWriteBlocks()` in main — caps fields, rejects blocks with missing `sessionId`.
- `parseScrollbackSearchIds()` — accepts string IDs (`"42"`) from Claude in addition to numbers.
- `getByIdsInOrder()` — preserves Claude's relevance ordering rather than DB insertion order.
- Renderer write path uses a 300ms debounce so OSC 7 cwd can arrive before the write fires; skips write when `termId` is missing.
- Scrollback "Copy" uses `window.glass.writeClipboard` (IPC bridge) instead of raw `navigator.clipboard`.
- `better-sqlite3` upgraded to `^12.11.1` (V8 14.8 fix required for Electron 42).

**Native module setup (one-time):**
```bash
cd desktop-glass
npm install better-sqlite3@^12.11.1 @types/better-sqlite3 --ignore-scripts
cd node_modules/better-sqlite3
npx node-gyp rebuild --release --target=42.3.3 --dist-url=https://electronjs.org/headers
```

**Tests added:** `scrollbackStore.test.ts` — encrypt/decrypt roundtrip, write/read, NL search ID parsing, validation helpers. 10/10 passing.

**IPC security:** both `scrollbackWrite` (`ipcMain.on`) and `scrollbackSearch` (`ipcMain.handle`) use terminal-window check.

**Files:** `scrollbackStore.ts` (new), `scrollbackValidation.ts` (new), `src/types/better-sqlite3.d.ts` (stub), `ipc.ts`, `main/index.ts`, `preload/index.ts`, `GlassTerminalPanel.tsx`, `GlassTerminalPanel.css`, `package.json`, `electron-builder.yml`

---

## Manual Smoke Test — Tasks #45–#47

After `npm run glass:dev`:

1. **⌘⇧E** — vision overlay appears, analysis references what's actually on screen (not just terminal text)
2. Run any command → wait ~800ms → 3 suggestion chips appear; run another command → bar clears immediately, no stale chips
3. **⌘⇧F** → type "the deploy command" → results appear as decrypted cards → Run injects without auto-running
4. Check `~/Library/Application Support/IIVO Glass/scrollback.db` exists and is non-empty (sqlite3 CLI to verify rows)
5. **⌘⇧V** (voice→shell) still works — verify Task #44 not regressed

---

## Remaining Backlog

> All planned terminal upgrades are complete. Next phase: full terminal UI redesign (all surface area now locked in).

> **Note:** Run `npm install` in `desktop-glass/` to install the 5 `@xterm/addon-*` packages added in Task #34.

---

## Code Review, Fixes & Verification — June 2026

*Full audit of Tasks #34–#44 after initial build. Review traced every IPC channel, PTY data path, and React lifecycle; fixes applied and re-verified with unit tests.*

### Architecture recap

IIVO Glass terminal runs in a **dedicated terminal `BrowserWindow`** (`src/renderer/terminal/main.tsx` → `GlassTerminalPanel`). It is **not** embedded in the overlay window. All renderer→main communication goes through the contextBridge preload (`window.glass.*`).

| Window | Role |
|---|---|
| **Overlay** | Command bar, AI panel, onboarding, auto-fix cards |
| **Terminal** | xterm.js + PTY UI, all terminal hotkeys and AI features (#39–#44) |

This matters for IPC security: handlers must check `isTerminalIpcSender`, not `isOverlayIpcSender`, for anything the terminal UI calls.

```
PTY output (main)
  └─► terminal.webContents.send(ptyData)
        └─► GlassTerminalPanel
              ├─► xterm.write(data)
              ├─► terminalBlockParser → blocks state
              ├─► OSC title parse → tabTitle
              └─► debounced terminalContextPush → main AI context

User input
  └─► xterm.onData → sendPtyInput → ptyInput IPC → writePtyInput (main)
```

---

### What was built (Tasks #34–#44)

| Task | Feature | Key files |
|---|---|---|
| #34 | xterm.js addon stack (canvas, fit, search, web-links, ligatures, image) | `GlassTerminalPanel.tsx`, `package.json` |
| #35 | Cmd+K clear, Cmd+F find bar | `GlassTerminalPanel.tsx` |
| #36 | Command block parser (OSC 133 + heuristic fallback) | `useTerminalBlocks.ts` → `terminalBlockParser.ts` |
| #37 | One-click copy per block | `GlassTerminalPanel.tsx` |
| #38 | 50k scrollback | `GlassTerminalPanel.tsx` |
| #39 | Explain Last Error ⌘+E | `ipc.ts`, `main/index.ts`, `preload`, `GlassTerminalPanel.tsx` |
| #40 | Natural language → shell ⌃+Space | same + `NLCommandBar` |
| #41 | Terminal context → IIVO AI panel | `terminalContext.ts`, debounced push from renderer |
| #42 | Auto-title tabs (OSC 0/2 + foreground process poll) | `glassTerminal.ts`, title poll in `main/index.ts` |
| #43 | Inline image rendering (addon-image) | covered by #34 |
| #44 | Voice → shell ⌘+Shift+V | Deepgram REST + reuse of #40 `nlToShell` |

---

### Code review findings (pre-fix)

A structured review of all eight terminal upgrade features flagged **three ship-blocking issues** and several P1/P2 items.

#### P0 — Ship blockers

1. **IPC sender mismatch** — `terminalExplain`, `nlToShell`, and `terminalContextPush` used `isOverlayIpcSender`, but `GlassTerminalPanel` only mounts in the **terminal window**. Result: Explain, NL→Shell, and context push returned `Unauthorized` or silently no-op'd in production.

2. **OSC 133 output gap** — After the first OSC 133 sequence, `useTerminalBlocks` hit `if (ps.useOsc133 === true) return` on plain PTY chunks. Command output between OSC markers was **never accumulated** — blocks were empty or command-only under zsh/bash shell integration.

3. **B+C same-chunk command loss** — When `B`, command text, and `C` arrived in one PTY chunk, final mode was `output`, so command extraction (`mode === "command"`) never ran.

#### P1 — Should fix

- Deepgram hardcoded `language=en` (broken for Español / 中文 voice→shell)
- `ptyInput`, `ptyResize`, `ptyReplay` had **no sender validation** (overlay preload could theoretically inject to any `termId`)
- Explain Last Error targeted any last finished block, not just errors
- Cmd+K cleared xterm but not block history or AI context
- `terminalContextPush` had no main-side field validation or size caps
- Command text used `.trim()` per PTY chunk → `"npm "` + `"run"` became `"npmrun"`

#### P2 — Nice to have

- Canvas addon could throw if WebGL2 unavailable (no fallback)
- `terminalReady` not reset on unmount
- `CommandBlock` copy `setTimeout` not cleared on unmount
- Overlapping ⌘+E explain requests not guarded

---

### Fixes applied

#### IPC security (`src/main/index.ts`)

Added helpers:

```typescript
isTerminalIpcSender(sender)   // terminal BrowserWindow only
isValidPtySessionId(termId)   // termId in active PTY sessions
```

| Handler | Sender check |
|---|---|
| `terminalExplain` | `isTerminalIpcSender` |
| `nlToShell` | `isTerminalIpcSender` |
| `terminalContextPush` | `isTerminalIpcSender` only (overlay must **not** forge terminal history) |
| `voiceShellTranscribe` | `isTerminalIpcSender` |
| `ptyInput`, `ptyResize`, `ptyReplay` | `isTerminalIpcSender` + valid session ID |
| `writeClipboard` | overlay **or** terminal |
| `resizeTerminal`, `dismissTerminalWindow` | `isTerminalIpcSender` |

Overlay auto-fix (`glass-terminal-fix-accept`) unchanged — main calls `writePtyInput` directly, not renderer IPC.

#### OSC 133 parser (`terminalBlockParser.ts`)

- **Extracted** pure parser from `useTerminalBlocks.ts` for testability.
- **Single-pass segment parser**: walks each chunk, accumulates text between OSC markers with live mode tracking (fixes B+C same-chunk and plain-chunk gaps).
- **Command accumulation** appends stripped text **without per-chunk `.trim()`** so split commands like `"npm "` + `"run build"` stay correct.

#### Terminal context (`terminalContext.ts`)

- `normalizeTerminalContextBlocks()` — validates shape, status enum, caps command (2000 chars) and output (2000 chars) on main.
- Empty push or all-invalid push → `clearTerminalContext()`.

#### Deepgram locale (`glassLocale.ts` + `main/index.ts`)

- `deepgramLanguageCode(locale)` → `en` / `es` / `zh` from `glassSettings.uiLocale`.
- Voice transcription URL uses `language=${encodeURIComponent(dgLang)}`.
- 5 MB max audio buffer size.

#### GlassTerminalPanel UX / robustness

- **⌘+E** — prefers most recent `status === "error"` block; shows "No failed command to explain." when none; buffer scrape fallback for non-OSC shells.
- **Explain request guard** — `explainGenRef` ignores stale responses; dismiss/Escape increments gen.
- **⌘+K** — `clearTerminalHistory()` clears xterm + blocks + pushes `[]` to clear main AI context.
- **Blocks panel Clear** — same `clearTerminalHistory()` path.
- **Canvas/ligatures** — try/catch around post-`open()` addon load (WebGL fallback).
- **`terminalReady`** — reset to `false` on unmount.
- **Copy timer** — cleared on `CommandBlock` unmount.

> **Note:** Task entries above (#39, #40, #41) originally documented `isOverlayIpcSender` — that was incorrect for the terminal window architecture and has been corrected in this pass.

---

### Double-check / re-audit (second pass)

| Check | Result |
|---|---|
| `GlassTerminalPanel` only in terminal window | Confirmed (`terminal/main.tsx`) |
| All terminal AI IPCs use terminal sender | Confirmed |
| `terminalContextPush` not allowed from overlay | Confirmed (prevents forged AI context) |
| OSC plain chunks accumulate after mode lock-in | Confirmed + unit test |
| B + command + C in one chunk | Confirmed + unit test |
| Multi-chunk output without OSC | Confirmed + unit test |
| Cmd+K does not clear context on panel mount | Confirmed (only explicit clear) |
| Title poll cleanup (exit, kill, will-quit) | Confirmed |
| Addon load order (pre/post `open()`) | Confirmed |
| Hotkeys: `capture: true`, focus-scoped, cleanup on unmount | Confirmed |
| `enrichedUserContext` additive when no terminal context | Confirmed |
| TypeScript (`npx tsc --noEmit`) | No new errors beyond pre-existing groups |
| Linter on touched files | Clean |

---

### Unit tests added

| File | Coverage |
|---|---|
| `src/test/terminalBlockParser.test.ts` | OSC 133 multi-chunk commands/output, B+C same chunk, plain output chunks, heuristic fallback, `resetParserState` |
| `src/test/terminalContext.test.ts` | `normalizeTerminalContextBlocks` length caps, invalid entry filtering |

Run: `npm test` (both files wired into the main test script).

---

### Manual smoke test checklist

After `npm run glass:dev` (and `npm install` if addons missing):

1. Open terminal → run `false` → **⌘+E** explains the error (not Unauthorized)
2. **⌃+Space** → describe a task → Claude returns a command preview → Enter injects
3. Run a few commands → ask IIVO something → AI should see terminal context in overlay
4. **⌘+K** → terminal scrollback + history sidebar clear
5. With **Español** locale → **⌘⇧V** transcribes Spanish (`language=es` on Deepgram)
6. **⌘+F** find bar toggles; **⌘+K** does not leave stale blocks in sidebar

---

### Verdict

**Safe to ship** after this hardening pass. All P0 and P1 review items resolved. Parser logic covered by automated tests. Remaining backlog (#45–#47) unchanged.

