# Cursor Code Review: IIVO Glass Terminal Upgrades

Please do a thorough code review of the terminal feature work described below.
Read every file listed, trace the full data flow for each feature, and produce
a structured report flagging any bugs, security issues, type-safety gaps, memory
leaks, race conditions, or UX regressions. Be blunt — we'd rather catch issues
here than in production.

---

## Context

IIVO Glass is an Electron macOS transparent overlay app. The built-in terminal
uses `node-pty` (main process) + `xterm.js` (renderer). All renderer→main
communication goes through a contextBridge preload (`window.glass.*`). Each IPC
handler in main must validate its sender with `isOverlayIpcSender(event.sender)`
(overlay window) OR a terminal-window check (`event.sender === getWindows()?.terminal?.webContents`).

The following 9 features were added across this session. Please review all of them.

---

## Features Built — Files to Review

### Feature 1 — xterm.js Addon Stack (Task #34, #38)
**Files:** `src/renderer/dock/GlassTerminalPanel.tsx` (top ~50 lines, addon init section)

- Canvas (WebGL2), FitAddon, SearchAddon, WebLinksAddon, LigaturesAddon, ImageAddon all loaded
- **Critical load order**: fit/search/webLinks/image loaded BEFORE `term.open()`, canvas/ligatures AFTER
- Scrollback set to 50,000 lines
- Check: are addons disposed correctly on unmount? Is `terminalReady` state set after addon init?

---

### Feature 2 — Cmd+K / Cmd+F Hotkeys (Task #35)
**Files:** `src/renderer/dock/GlassTerminalPanel.tsx` (global keydown useEffect)

- Cmd+K clears terminal (focus-scoped to terminal container)
- Cmd+F toggles FindBar (gated on `terminalReady` + `searchAddonRef.current`)
- Check: does the keydown listener use `capture: true`? Is it removed on unmount? Can it fire when the terminal doesn't have focus?

---

### Feature 3 — Command Block Parser (Task #36, #37)
**Files:**
- `src/renderer/dock/useTerminalBlocks.ts` — the full state machine
- `src/renderer/dock/GlassTerminalPanel.tsx` — `BlocksPanel`, `CommandBlock` components

Key things to verify in `useTerminalBlocks.ts`:
- OSC 133 regex `lastIndex` is reset to 0 before each loop
- State machine modes: `idle → prompt (A) → command (B) → output (C) → finalize (D)`
- D handler pushes block immediately AND nulls `currentBlock` (bug fix #2)
- Command extraction ONLY runs when `ps.mode === "command"` (bug fix #3 — no fallback clause)
- Heuristic `%\s*$` uses negative lookbehind `(?<!\d)%` to exclude "100%", "42%" etc.
- `>\s+$` heuristic is intentionally ABSENT (too many false positives)
- 500-block rolling window uses functional updater
- `clearBlocks()` fully resets `stateRef` including `useOsc133: null`

---

### Feature 4 — Explain Last Error ⌘+E (Task #39)
**Files:**
- `src/shared/ipc.ts` — `terminalExplain` channel, `TerminalExplainRequest/Response` types
- `src/main/index.ts` — `IPC.terminalExplain` handler (~line 8273)
- `src/preload/index.ts` — `terminalExplain()` bridge method
- `src/renderer/dock/GlassTerminalPanel.tsx` — `ExplainOverlay` component, `triggerExplain` callback

Verify:
- Main handler calls `isOverlayIpcSender(event.sender)` ✓
- Output capped at 8000 chars before sending to Claude
- `triggerExplain` is declared BEFORE the hotkey `useEffect` that references it (TS2448 fix)
- ExplainOverlay uses `position: absolute` inside `position: relative` panel
- Escape dismisses overlay via functional `setState` without `return` (allows find bar to also see Escape)
- `renderMarkdownInline` handles: code spans (`` `text` ``), bold (`**text**`), newlines — no infinite loop on unmatched patterns

---

### Feature 5 — Natural Language → Shell ⌃+Space (Task #40)
**Files:**
- `src/shared/ipc.ts` — `nlToShell` channel, `NlToShellRequest/Response`
- `src/main/index.ts` — `IPC.nlToShell` handler (~line 8309)
- `src/preload/index.ts` — `nlToShell()` bridge
- `src/renderer/dock/GlassTerminalPanel.tsx` — `NLCommandBar` component

Verify:
- Main handler: `isOverlayIpcSender` + prompt validation + backtick stripping on LLM response
- `NLCommandBar.handleInputKey`: Enter calls `e.stopPropagation()` to prevent double-injection through the outer div's `handlePreviewKey` (Bug #1 fix)
- `handleInputKey` Enter branch only calls `submit()` when phase is `"idle"` or `"error"` — NOT during `"loading"` (Bug #2 fix)
- Edit button copies command back to input and refocuses
- When `termId` is undefined, Run button is disabled

---

### Feature 6 — Terminal Context → AI Panel (Task #41)
**Files:**
- `src/shared/ipc.ts` — `terminalContextPush` channel, `TerminalContextBlock` type
- `src/main/terminalContext.ts` — rolling 15-block buffer, 10-minute staleness guard
- `src/main/index.ts` — `IPC.terminalContextPush` handler (fire-and-forget `ipcMain.on`), injection at `submitCommand` path
- `src/preload/index.ts` — `terminalContextPush()` bridge
- `src/renderer/dock/GlassTerminalPanel.tsx` — 400ms debounced push effect

Verify:
- `ipcMain.on` (not `handle`) for the push — still calls `isOverlayIpcSender` + `Array.isArray` guards
- `enrichedUserContext` is additive: when `getTerminalContextString()` returns null, behavior is identical to before
- Type predicate `isFinished` narrows `b.status` — no unsafe `as` cast when pushing to main
- Staleness guard: `Date.now() - lastUpdated > 10 * 60 * 1000` returns null
- 400ms debounce uses `window.setTimeout` with cleanup in `return () =>` — no leak
- `running` blocks filtered out before push

---

### Feature 7 — Auto-title Terminal Tabs (Task #42)
**Files:**
- `src/shared/ipc.ts` — `terminalTitleUpdate` channel
- `src/main/glassTerminal.ts` — `getForegroundProcessName(termId)` function
- `src/main/index.ts` — `titlePollIntervals` Map, `startTitlePolling`, `stopTitlePolling`, `will-quit` cleanup
- `src/preload/index.ts` — `onTerminalTitleUpdate` listener
- `src/renderer/dock/GlassTerminalPanel.tsx` — `OSC_TITLE_RE`, `tabTitle` state, header display

Verify:
- `OSC_TITLE_RE.lastIndex = 0` reset before the while loop in `onPtyData` handler
- `stopTitlePolling` called in: (a) PTY `onExit` callback, (b) `glass-terminal-kill` handler, (c) `will-quit` handler BEFORE `killAllPtySessions()` — the will-quit fix iterates `titlePollIntervals.keys()` explicitly because `appIsQuitting=true` causes onExit to skip it
- `getForegroundProcessName`: uses `pgrep -P <pid> 2>/dev/null || true` to avoid throwing on no children
- `tabTitle` resets to null when session switches (via the poll-subscription effect + attach cleanup)
- Header shows: `tabTitle || (terminalActive ? "Glass Terminal" : "Terminal — session ended")`

---

### Feature 8 — Voice → Shell ⌘+Shift+V (Task #44)
**Files:**
- `src/shared/ipc.ts` — `voiceShellTranscribe` channel, `VoiceShellTranscribeRequest/Response`
- `src/main/index.ts` — `IPC.voiceShellTranscribe` handler (terminal-window security check)
- `src/preload/index.ts` — `voiceShellTranscribe()` bridge
- `src/renderer/dock/GlassTerminalPanel.tsx` — `VoiceShellBar` component

Verify:
- **Critical**: main handler uses `event.sender !== getWindows()?.terminal?.webContents` (NOT `isOverlayIpcSender`) — terminal window is a different BrowserWindow from overlay
- Buffer conversion: `Buffer.from(new Uint8Array(rawBuffer as ArrayBuffer))` handles IPC serialization
- Deepgram REST POST: `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true...` with `Authorization: Token <key>` header
- `VoiceShellBar`:
  - `streamRef` and `recorderRef` stored as refs, not state
  - `releaseMic()` stops ALL tracks: `stream.getTracks().forEach(t => t.stop())`
  - `stoppedRef` guards `stopRecording()` against double-call race
  - Elapsed timer `setInterval` is cleared when phase leaves `"recording"`
  - Mic released on: unmount, Escape, dismiss, AND after audio assembled (not just on unmount)
  - Hotkey: `e.metaKey && e.shiftKey && e.key === "V"` (uppercase — Shift produces uppercase)
  - After transcription, calls `window.glass.nlToShell(...)` — reuses Task #40 infrastructure

---

## Cross-Cutting Concerns to Check

1. **IPC security**: every `ipcMain.handle` / `ipcMain.on` handler has exactly one sender validation check at the top. Which handlers use `isOverlayIpcSender` vs. `terminal webContents` check — and is each choice correct?

2. **TypeScript strictness**: run `npx tsc --noEmit` and confirm zero new errors beyond the 4 pre-existing groups:
   - `GlassUserProfile` / `normalizeGlassUserProfile` in `main/index.ts`
   - `SortingHatScreen.tsx` `MouseEventHandler` mismatch
   - `@xterm/addon-*` module-not-found (pending `npm install`)

3. **React rules of hooks**: no `useCallback`/`useEffect`/`useState` inside conditions or loops in `GlassTerminalPanel.tsx`

4. **Memory leaks**: check every `setInterval` / `setTimeout` / event listener / IPC listener in the new code has a corresponding cleanup

5. **PTY data handler performance**: `onPtyData` now does OSC title parsing, OSC 133 block parsing, AND xterm write on every chunk. Are the regex operations cheap enough for high-throughput output?

6. **`package.json`**: confirm `@xterm/addon-canvas`, `@xterm/addon-image`, `@xterm/addon-ligatures`, `@xterm/addon-search`, `@xterm/addon-web-links` are in `dependencies` (user must run `npm install`)

---

## Deliverable

Please produce a structured report with:

1. **Per-feature status**: LGTM / Issues Found for each of the 8 features
2. **Bugs found**: file path, line number, description, suggested fix
3. **Security issues**: any IPC handler missing a sender check or leaking sensitive data
4. **Performance concerns**: anything that could cause jank in the PTY data path
5. **Overall verdict**: is this safe to ship? What must be fixed vs. what's a nice-to-have?

Be thorough. The codebase path is:
`/Users/newuser/Desktop/ai-council-runner/desktop-glass/src`
