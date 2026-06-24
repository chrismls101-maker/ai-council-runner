# Cursor Code Review: IIVO Glass Terminal Upgrades — Tasks #45, #46, #47

Please do a thorough code review of the three terminal features listed below. Read every file, trace every data flow, and produce a structured report flagging bugs, security issues, type-safety gaps, memory leaks, race conditions, or UX problems. Be blunt.

---

## Context

IIVO Glass is an Electron macOS transparent overlay. The built-in terminal runs in a separate BrowserWindow from the main overlay. All renderer→main IPC goes through a contextBridge preload (`window.glass.*`).

**Two IPC security patterns in use — know which is which:**
- `isOverlayIpcSender(event.sender)` — for requests from the overlay window
- `event.sender === getWindows()?.terminal?.webContents` — for requests from the terminal window

Tasks #45, #46, and #47 ALL originate from the terminal window, so they ALL use the second pattern. If any handler uses `isOverlayIpcSender` instead, that is a critical security bug.

---

## Task #45 — Screen-Aware Terminal Assistant (⌘+Shift+E)

**What it does:** Hotkey captures the full screen in the main process via `desktopCapturer`, packages it with terminal context, sends a multimodal request to Claude Vision, streams the analysis into a `VisionOverlay` component.

### Files to review

**`src/shared/ipc.ts`**
- Channel `terminalVisionAnalyze: "glass:terminal-vision-analyze"` exists and is unique
- `TerminalVisionRequest` has `terminalContext: string`, optional `lastCommand`, optional `lastOutput`
- `TerminalVisionResponse` has optional `analysis` and `error`

**`src/main/index.ts`**
- `desktopCapturer` added to the electron import destructure (not a separate import statement)
- Handler uses `event.sender !== terminalWindow.webContents` (NOT `isOverlayIpcSender`)
- `desktopCapturer.getSources(...)` is awaited; empty sources array handled
- `toPNG()` result checked for empty buffer
- Screenshot capture wrapped in try/catch
- `terminalContext` capped (6000 chars or similar) before use
- `askIivoGlass` called with the correct field for image data — check the actual `GlassAskRequest` type to confirm the field name used (`latestScreenshot`, `imageBase64`, etc.) matches the real type definition
- Entire handler wrapped in outer try/catch

**`src/preload/index.ts`**
- `terminalVisionAnalyze` uses `ipcRenderer.invoke`

**`src/renderer/dock/GlassTerminalPanel.tsx`**
- `triggerVisionAnalyze` declared BEFORE the hotkey `useEffect` that references it (same lesson as Task #39's `triggerExplain` bug — if it's after, TS2448 will bite at runtime)
- Hotkey: `e.metaKey && e.shiftKey && e.key === "E"` (uppercase — Shift is held)
- Plain ⌘+E is gated with `!e.shiftKey` so it doesn't also fire on ⌘+Shift+E
- `triggerVisionAnalyze` in the hotkey `useEffect` dependency array
- Escape clears BOTH `explainState` AND `visionState`
- `VisionOverlay` has distinct positioning from `ExplainOverlay` so they don't stack (one top-anchored, one bottom-anchored)
- Race condition guard (`visionGenRef` or similar) prevents stale responses from overwriting newer state

**`src/renderer/dock/GlassTerminalPanel.css`**
- `.gte-vision-overlay` exists with distinct position from `.gte-overlay` (explain overlay is `bottom: 44px`, vision overlay should be `top: 44px` or equivalent)

---

## Task #46 — AI Command Suggestions (auto-show after command)

**What it does:** OSC 7 tracks cwd. 800ms after a command block finishes, 3 AI suggestions slide up as chips. Click → injects into PTY without auto-running. Any keypress dismisses.

### Files to review

**`src/shared/ipc.ts`**
- Channel `terminalSuggest: "glass:terminal-suggest"` exists and is unique
- `TerminalSuggestRequest`: `lastCommand`, `lastStatus` (`"success" | "error" | "unknown"`), `cwd`, `recentCommands`
- `TerminalSuggestion`: `command`, `why`
- `TerminalSuggestResponse`: optional `suggestions` array, optional `error`

**`src/main/index.ts`**
- Handler uses terminal-window security (`event.sender !== terminalWindow.webContents`)
- `askIivoGlass` call matches actual function signature
- Markdown fence stripping handles both ` ```json ` and ` ``` ` variants
- Response parsed with `JSON.parse` in try/catch; returns `{ error: "..." }` on failure
- Response validated as array (`Array.isArray`) before returning

**`src/preload/index.ts`**
- `terminalSuggest` uses `ipcRenderer.invoke`

**`src/renderer/dock/GlassTerminalPanel.tsx`**
- `OSC7_CWD_RE.lastIndex = 0` reset before the while loop (same discipline as OSC title regex)
- `decodeURIComponent` wrapped in try/catch (malformed URIs throw)
- Trigger `useEffect` dependency array is `[blocks]` ONLY — NOT `[blocks, cwd, suggestState]` (would cause infinite re-trigger loop)
- Debounce timer cleared in useEffect cleanup return
- Error from API silently falls to `idle` (no error shown — suggestions are non-critical)
- Finds the LAST finished block (`[...blocks].reverse().find(...)`)
- Suggestions dismissed when any block enters `running` status
- Suggestions dismissed on any non-meta/non-ctrl keypress
- **Critical: `onSelect` / `runSuggestion` injects WITHOUT trailing `\n`** — auto-running a suggestion on click is dangerous since suggestions are speculative. User must press Enter themselves.
- `suggestState` NOT in the keydown `useEffect` dep array (functional updater used instead — avoids stale closure without the dep)
- `writtenBlockIdsRef` or equivalent dedup ref reset on session switch

**`src/renderer/dock/GlassTerminalPanel.css`**
- `.gtp-suggest-bar` has `z-index` below overlays (overlays are z-200; suggestions should be z-50 or similar)
- Slide-up animation defined

---

## Task #47 — Persistent Smart Scrollback (⌘+Shift+F)

**What it does:** Every finished command encrypted with AES-256-GCM and written to SQLite via `better-sqlite3`. ⌘+Shift+F opens a search bar — NL query → Claude searches plaintext summaries → returns row IDs → decrypt and display results.

### Files to review

**`src/main/scrollbackStore.ts`** — this is the most critical file

Encryption:
- IV is exactly 12 bytes (`crypto.randomBytes(12)`)
- Auth tag is exactly 16 bytes (`cipher.getAuthTag()`)
- Storage format: `iv (12 bytes) + authTag (16 bytes) + ciphertext`
- Decrypt reads subarray offsets exactly: iv = `buf.subarray(0, 12)`, authTag = `buf.subarray(12, 28)`, ciphertext = `buf.subarray(28)`
- `decipher.setAuthTag(authTag)` called before `decipher.update()`
- Key is 32 bytes (`crypto.randomBytes(32)`)
- Key file written with mode `0o600`
- `safeStorage.encryptString` / `safeStorage.decryptString` used (NOT custom encryption on the key)

DB setup:
- `getDb()` uses WAL mode (`PRAGMA journal_mode = WAL`)
- `foreign_keys = ON`
- Tables: `sessions` (id, session_id UNIQUE, project_root, started_at) and `commands` (id, session_id, command_enc BLOB, output_enc BLOB, command_plain TEXT, exit_code, status, cwd, started_at, duration_ms)
- Indexes on `session_id` and `started_at`
- `getDb()` and `getEncKey()` are lazy — NOT called at module load time (Electron app may not be ready yet)

Exports:
- `registerSession`, `writeBlocks`, `getRecentSummary`, `getByIds`, `closeDb` all present
- All DB operations wrapped in try/catch (graceful degradation — no crash if DB unavailable)
- `closeDb()` uses optional chaining (`_db?.close()`)

Import style:
- `import Database from "better-sqlite3"` — ESM default import, NOT `require()`

**`src/shared/ipc.ts`**
- `scrollbackWrite: "glass:scrollback-write"` (fire-and-forget)
- `scrollbackSearch: "glass:scrollback-search"` (invoke)
- `ScrollbackWriteBlock.status` is `"success" | "error" | "unknown"` — does NOT include `"running"`
- All 4 interfaces exported

**`src/main/index.ts`**
- `scrollbackWrite` uses `ipcMain.on` (NOT `ipcMain.handle`) — fire-and-forget
- `scrollbackSearch` uses `ipcMain.handle`
- Both use terminal-window security (`event.sender !== terminalWindow.webContents`)
- `registerSession` called when a new PTY session is created
- `closeDb()` called in `will-quit` BEFORE `killAllPtySessions()`
- `askIivoGlass` return field used in `scrollbackSearch` matches the actual return type (check `GlassAskResponse` — is it `.answer`, `.content`, or something else?)
- Claude's ID response stripped of markdown fences, parsed with try/catch, filtered to numbers before `getByIds`

**`src/preload/index.ts`**
- `scrollbackWrite` uses `ipcRenderer.send` (fire-and-forget)
- `scrollbackSearch` uses `ipcRenderer.invoke`

**`src/renderer/dock/GlassTerminalPanel.tsx`**

Write path:
- `writtenBlockIdsRef` tracks already-written block IDs to prevent duplicate writes
- Ref reset on session switch (not just unmount)
- Output capped at 2000 chars before writing
- `status` field excludes `"running"` blocks (filtered before write)
- `window.glass.scrollbackWrite(...)` called — fire-and-forget, no await

`ScrollbackSearchBar` component:
- `inputRef.current?.focus()` in a `useEffect` with `[]` deps (runs once on mount)
- Outer div has `onKeyDown={(e) => e.stopPropagation()}` — prevents keystrokes from closing the suggestions bar or triggering other hotkeys while typing in the search input
- Escape calls `onClose`
- Enter submits the search
- "Run" button injects command WITHOUT `\n` (user presses Enter themselves)
- "Copy" button uses `navigator.clipboard.writeText`
- No conditional hooks

Hotkey:
- `e.metaKey && e.shiftKey && e.key === "F"` (uppercase F — Shift is held)
- Checked BEFORE plain ⌘+F (find bar) in the keydown handler — gated with `e.shiftKey` so they don't conflict
- Toggles `showScrollback`

**`package.json` + build config**
- `better-sqlite3` in `dependencies` (NOT devDependencies)
- `@types/better-sqlite3` in `devDependencies`
- `electron-builder.yml` (or equivalent) has `better-sqlite3` in `asarUnpack` so the native binary isn't packed into the asar archive

**`src/types/better-sqlite3.d.ts`** (ambient stub — present because npm install hasn't run yet)
- Stub covers all methods used in `scrollbackStore.ts`: `Database` default export, `.prepare()`, `.exec()`, `.pragma()`, `.transaction()`, `.close()`, statement `.run()`, `.get()`, `.all()`
- Will be superseded by `@types/better-sqlite3` once `npm install` is run

---

## Cross-Cutting Checks

1. **IPC security across all 3 tasks**: every new handler uses `event.sender === getWindows()?.terminal?.webContents`. If any uses `isOverlayIpcSender` instead, that is wrong — the terminal is a different BrowserWindow.

2. **TypeScript**: run `npx tsc --noEmit` in `desktop-glass/`. Acceptable pre-existing errors only:
   - `GlassUserProfile` / `normalizeGlassUserProfile` in `main/index.ts`
   - `SortingHatScreen.tsx` MouseEventHandler
   - `@xterm/addon-*` module-not-found
   Any other error is a regression from these tasks.

3. **No new npm packages** for #45 and #46. For #47: `better-sqlite3` + `@types/better-sqlite3` are the only new deps.

4. **Hotkey conflicts** — verify no new hotkey collides with an existing one:
   - ⌘+Shift+E (vision) — must not fire on plain ⌘+E (explain)
   - ⌘+Shift+F (scrollback search) — must not fire on plain ⌘+F (find bar)
   - ⌘+Shift+V (voice shell, Task #44) — check it still works

5. **`better-sqlite3` Vite externals**: the Vite main process config must NOT bundle `better-sqlite3`. Check whether the project uses `externalizeDepsPlugin()` (auto-externalizes all deps in package.json) or a manual `external` array. If manual, confirm `better-sqlite3` is listed.

---

## Action Required (not a code bug)

After Cursor finishes review, the user needs to run this once on their machine:
```bash
cd desktop-glass && npm install better-sqlite3 @types/better-sqlite3
```
The native binary rebuilds for the Electron ABI at that point. Until then the ambient type stub in `src/types/better-sqlite3.d.ts` keeps tsc happy.

---

## Deliverable

Structured report:
1. **Per-task status**: LGTM / Issues Found for each of Tasks #45, #46, #47
2. **Bugs found**: file path, line number, description, suggested fix
3. **Security issues**: any IPC handler with wrong security check
4. **Hotkey conflicts**: any collision found
5. **Overall verdict**: safe to ship? What must be fixed vs. nice-to-have?

Codebase path: `/Users/newuser/Desktop/ai-council-runner/desktop-glass/src`
