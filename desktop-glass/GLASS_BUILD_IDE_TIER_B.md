# Glass IDE — Tier B Build Plan (Monaco editor parity)

**Status:** B0–B7 **implemented** (see §13). B5b (real LSP) **not implemented**.

**Paste each phase into Cursor Agent in order. Each phase typechecks clean and is independently shippable.**

---

## 0. The point of Tier B (read this first)

Monaco is **not** the moat. It is the *floor* — the thing that makes Glass stop reading as "an agent overlay with panels" and start reading as a real editor. We build it so we earn the right to put the thing Cursor structurally **cannot** have on top of it: **presence** (IIVO voice + the reactive visual + a calm, ambient surface).

So the rule for every decision below: **match Cursor's editor just enough to be credible, then win on what Cursor can't be.** Do not out-VS-Code Cursor. When a feature is "more editor power but no presence payoff," it goes below the cut-line.

### Cut-lines (build vs. explicitly NOT building)

**Build (Tier B):**
- Monaco editor as the center surface (syntax, selection, multi-cursor, find/replace come free)
- Editable files + save (`Cmd/Ctrl+S`), dirty state
- Tab bar + "active file follows the agent" (Coder edits open/focus the file)
- Inline agent diffs *in the editor* (accept/reject hunks where the code lives)
- In-editor TypeScript intelligence (diagnostics, hover, completions) — staged: cheap bundled worker first, real project LSP second

**Explicitly NOT building (stays below the line, maybe never):**
- Debugger / breakpoints / run-config UI
- Extensions marketplace
- Full settings UI, themes gallery, keybinding editor
- Multi-root workspaces, git graph/blame UI
- Multi-language LSP day one (TS only; others are "later")
- Notebook / remote / SSH surfaces

Saying these out loud is what keeps this a *product* instead of a second VS Code.

---

## 1. What already exists (the plumbing Tier B builds on)

| Piece | File | Reuse for Tier B |
|-------|------|------------------|
| IDE grid + chrome suppression | `src/renderer/overlay/GlassIdeShell.tsx` (+ `.css`) | Editor mounts as a new region here |
| Read-only file tree + viewer | `src/renderer/overlay/GlassIdeFilePanel.tsx` | Tree stays; viewer is replaced by Monaco |
| Custom tokenizer | `src/shared/glassIdeSyntax.ts` (`tokenizeLine`) | Retire for the editor surface (Monaco owns highlighting); keep for any non-editor previews |
| List/read project files (IPC) | `src/main/glassIdeProject.ts`, `IPC.glassIdeListProject`, `IPC.glassIdeReadProjectFile` | Reuse list + read as-is |
| Path safety | `assertPathInProjectRoot`, `expandAgentPath` in `src/main/agentCoderTools.ts` | **Reuse for the new write IPC** |
| Read limits | `GLASS_IDE_MAX_READ_BYTES`, `GLASS_IDE_MAX_LIST_FILES` (`src/shared/glassIdeProject.ts`) | Same caps apply to editor open/save |
| AI stream + diffs | `GlassCoderPanel.tsx`, `GlassCoderStream.tsx` | Diff source for inline-in-editor diffs |
| Resize handle | `src/renderer/overlay/useCoderPanelResize.ts` | Generalize to the editor/preview/terminal splits |
| Terminal | xterm (`@xterm/*` already in deps) | Unchanged |

**Gap to close:** no Monaco dep, no write/save IPC, no tab model, no inline-diff-in-editor, no language service. That's the entire Tier B scope — and it's additive, not a rewrite.

---

## 2. Phase B0 — Layout frame for the editor (structural, no Monaco yet)

The editor needs a real frame to live in. This is the one slice of "Tier A polish" that is load-bearing for Tier B, so it goes first.

- Generalize `useCoderPanelResize.ts` into a reusable `useSplit(axis, storageKey, min, max)` hook (persist sizes to a small renderer store, not `localStorage` semantics that fight Electron — use the existing settings/store path).
- In `GlassIdeShell.tsx`, introduce a **center editor region** between the left column (preview/terminal) and the right stream column. Target layout in IDE mode:

```
┌───────────────────────────────────────────────────────────────┐
│  Glass IDE                                          [Exit]     │
├───────────┬───────────────────────────────┬───────────────────┤
│ FILE TREE │  EDITOR (tabs + Monaco)        │  AI STREAM + DIFFS│
│           │                                │                   │
│           ├───────────────────────────────┤                   │
│ (left)    │  TERMINAL (under editor)       │  (right column)   │
│           │                                │                   │
├───────────┴───────────────────────────────┴───────────────────┤
│  CHAT / PROMPT  (full width)                                   │
└───────────────────────────────────────────────────────────────┘
```

- Two draggable splits: tree↔editor (horizontal) and editor↔terminal (vertical). Preview becomes a tab alongside the editor (or a toggle in the editor region) so the live site and the code share the center.
- Keep the bottom chat composer and the right stream exactly as they are.
- **Acceptance:** splits drag, persist across reopen, no Monaco yet — region shows the existing read-only viewer as a placeholder. `npm run typecheck` clean.

---

## 3. Phase B1 — Monaco core (the credibility unlock)

**Goal:** open a file from the tree → it renders in Monaco with real syntax highlighting; read-only at first.

### Dependency + worker wiring (the one real gotcha)
- Add `monaco-editor` (pin a known-good version; do **not** use the auto-loading CDN `@monaco-editor/loader` path — Glass is offline-capable desktop, bundle it).
- electron-vite builds the renderer with Vite, so configure Monaco's workers explicitly. Two viable routes:
  1. `vite-plugin-monaco-editor` (add to `electron.vite.config.ts` renderer plugins), or
  2. manual `self.MonacoEnvironment = { getWorker }` importing `?worker` entries (`editor.worker`, `ts.worker`).
- Limit bundled languages to what we ship (ts/tsx/js/jsx/json/css/html/md) to keep the bundle lean. Workers must resolve to local files (no network) — verify in a packaged build, not just `dev`.

### Component
- New `src/renderer/overlay/GlassIdeEditor.tsx`:
  - Mounts one `monaco.editor.create(...)` instance into the editor region.
  - Loads content via the **existing** `window.glass.glassIdeReadProjectFile(relativePath)` — no new IPC needed for read.
  - Maps `language` (already returned by `languageFromRelativePath`) to Monaco's language id.
  - Honors `truncated` from the read response (show a banner; keep read-only when truncated).
  - Theme: a custom `defineTheme` "glass-dark" tuned to the Glass aesthetic (transparent-ish background, restrained palette) — this is a *presence* touch, not default VS Dark.
- Wire `GlassIdeFilePanel` selection → editor open (tree already emits `onSelectPath`).
- **Read-only this phase.** Retire the custom `tokenizeLine` viewer for the editor surface.
- **Acceptance:** click files in the tree, they render in Monaco with correct highlighting and the Glass theme; workers load in a packaged build; typecheck clean.

---

## 4. Phase B2 — Editable + save (cross into "real editor")

**Goal:** type in the editor, see dirty state, `Cmd/Ctrl+S` writes to disk.

### New write IPC (mirror the read path, reuse all guards)
- `src/shared/ipc.ts`: add `glassIdeWriteProjectFile: "glass:ide-write-project-file"` and the request/response types in `src/shared/glassIdeProject.ts`.
- `src/main/glassIdeProject.ts`: add `writeGlassIdeProjectFile(projectRoot, relativePath, content)`:
  - Resolve root via `resolveProjectRoot`, resolve abs path, **`assertPathInProjectRoot`** (same guard as read — never write outside the project root).
  - Reject if content exceeds `GLASS_IDE_MAX_READ_BYTES` (reuse the cap; rename to `..._MAX_FILE_BYTES` if clearer).
  - Refuse to create new files in this phase (write only to existing paths) unless we explicitly add "new file" UX — keeps the surface tight.
  - Write atomically (temp file + rename) to avoid half-written source on crash.
- `src/preload/index.ts`: expose `glassIdeWriteProjectFile(relativePath, content)`.

### Editor state
- Track dirty per open file (compare model version / a saved baseline).
- `Cmd/Ctrl+S` → write; clear dirty on success; toast on failure.
- Block IDE exit with unsaved changes (match the existing "blocked while coder run in progress" pattern in the shell).
- **Acceptance:** edit + save round-trips to disk; dirty dot shows/clears; path traversal is impossible (add a unit test alongside `glassIdeProject.test.ts`); typecheck clean.

---

## 5. Phase B3 — Tabs + "active file follows the agent"

**Goal:** multiple open files; when the Coder applies an edit, that file opens/focuses.

- Open-files model in the shell (ordered list of `{relativePath, dirty}`), tab bar above the editor, click to switch, middle-click/✕ to close (guard dirty).
- One Monaco model per open file (don't recreate; cache models so undo history and scroll survive tab switches).
- **The presence hook:** when `GlassCoderPanel`/build loop reports an applied change to a path, the shell opens/focuses that tab and reveals the changed range. This is the moment Glass feels *alive* in a way a side-panel agent isn't — the editor moves with the agent.
- **Acceptance:** several tabs, dirty state per tab, Coder Apply jumps the editor to the edited file; typecheck clean.

---

## 6. Phase B4 — Inline agent diffs in the editor

**Goal:** pending Coder changes render *where the code lives*, not only in the right stream pane.

- Use Monaco's diff capability: either `monaco.editor.createDiffEditor` for a full proposed-vs-current view, or inline decorations + a peek widget for hunk-level accept/reject.
- Source the diff from the existing Coder stream/diff data (`GlassCoderStream.tsx` already parses diffs — reuse that model; don't re-diff).
- Accept → apply to the model + save path (B2); Reject → discard. Keep the right-pane changelog as the high-level log; the editor becomes the place you *act* on a hunk.
- **Acceptance:** a Coder proposal shows inline in the file; accept/reject works and reconciles with the changelog; typecheck clean.

---

## 7. Phase B5 — TypeScript intelligence (staged; biggest lift)

Do this in two stages so you ship value early and only pay for full LSP if you want cross-file power.

### B5a — Bundled in-editor TS service (cheap 80%)
- Monaco ships a TypeScript/JavaScript worker that gives **per-file** diagnostics, hover, and completions with zero server. Enable it, point its compiler options at the project's `tsconfig` (read once via main), and you get red squiggles + IntelliSense for the open file immediately.
- Limitation: it doesn't know the whole project graph (cross-file go-to-definition is weak). That's fine for a first ship.

### B5b — Real project LSP (only if cross-file nav matters)
- Run `typescript-language-server` as a child process from **main** (Glass already spawns processes — terminal/pty, agents).
- Bridge with `monaco-languageclient` + `vscode-jsonrpc` over a stdio transport proxied through IPC (renderer ⇄ preload ⇄ main ⇄ LSP).
- Gains: project-wide diagnostics, go-to-definition, find-references, rename.
- **Cost: this is the "weeks, not a polish pass" part.** Treat B5b as its own mini-project; do not block B0–B4 on it. Many teams stop at B5a.
- **Acceptance (B5a):** squiggles + hover + completion in an open `.ts` file; LSP child process is optional and behind a flag.

---

## 8. Phase B6 — Presence integration (the actual moat)

Only meaningful once B1–B4 make the editor real. This is what makes it "a Glass version Cursor can't be":

- **The editor reacts to IIVO state.** When the Coder is thinking, the editor's ambient glow / theme accent shifts (tie into the existing presence/voice state used elsewhere in Glass). When it speaks a summary, the changed lines pulse.
- **Voice-first navigation.** "Open the auth file", "what changed here", "explain this function" routed through the existing voice/ask path, acting on the active Monaco model + selection.
- **Calm by default.** No status-bar noise, no blinking badges; information appears when relevant and recedes. The opposite of Cursor's density. This is a deliberate aesthetic stance, enforced in the Glass theme + empty states.
- **Acceptance:** editor visibly responds to IIVO presence state; at least one voice command operates on the editor; the surface stays calm when idle.

---

## 9. Phase B7 — Full QA (the old Phase 5, now on a real editor)

Same as the original Phase 5, but it now means something because the IDE is real:
- Test suite + lint after verify; multi-pass review; preview smoke (loads, no console errors); iteration cap.
- Add editor-specific checks: save round-trip, path-traversal rejection, worker load in packaged build, dirty-guard on exit.

---

## 10. Recommended sequence (and what to NOT do first)

```
B0  Layout frame (splits + editor region)         ← do first; load-bearing
B1  Monaco core (read-only, themed)               ← the credibility unlock
B2  Editable + save (new write IPC, guarded)
B3  Tabs + active-file-follows-agent
B4  Inline agent diffs in editor
B5a Bundled TS intelligence (cheap)
B6  Presence integration (the moat)
─────────────────────────────────────────────────
B5b Real project LSP        ← optional, separate track, weeks
B7  Full QA                 ← only on a frozen, trusted editor
```

Do **not** polish empty states, icons, or motion before B1 — there's no editor to put them in yet. Do **not** start B5b before B0–B4 feel right in daily use.

---

## 11. The concrete first chunk (start here)

**B0 + the read-only half of B1**, as one shippable slice:

1. `electron.vite.config.ts` — add Monaco worker wiring (plugin or manual `getWorker`); restrict bundled languages to ts/tsx/js/jsx/json/css/html/md.
2. `package.json` — add `monaco-editor` (pinned). `npm i`, then verify workers resolve in a **packaged** build, not just dev.
3. `useCoderPanelResize.ts` → generalize to `useSplit`; add the tree↔editor and editor↔terminal splits in `GlassIdeShell.tsx` with a new center editor region.
4. `src/renderer/overlay/GlassIdeEditor.tsx` (new) — mount Monaco, load content via existing `glassIdeReadProjectFile`, map language, define + apply the "glass-dark" theme, honor `truncated`. Read-only.
5. Wire `GlassIdeFilePanel` selection → `GlassIdeEditor` open. Retire the `tokenizeLine` viewer for this surface.
6. `npm run typecheck` → zero errors. Manual check: click through files, confirm highlighting + theme + worker load.

**Done = you can browse the project in a real, themed Monaco editor inside Glass.** From there, B2 (save) is the next sprint and is where it becomes an editor you *use*, not just read.

---

## 12. Open decisions for you

- **LSP appetite:** ship at B5a (per-file intelligence, cheap) or commit to B5b (project-wide, weeks)? Recommend B5a now, B5b later.
- **New-file creation:** in scope for B2, or keep writes to existing files only at first? Recommend existing-only first (tighter surface).
- **Preview placement:** tab in the center editor region vs. keep it in the left column. Recommend a tab so code and live site share the big space.
- **Monaco version pin:** pick once and freeze; Monaco worker setup is version-sensitive with Vite.

---

## 13. Implementation record — B0 through B6 (completed)

**Documented:** June 2026  
**Overall status:** B0–B7 **shipped** in code. **B5b not implemented.**

This section is the as-built record for what landed in the repo. Use it for handoff, review, and B7 QA scoping.

### Summary matrix

| Phase | Status | Notes |
|-------|--------|-------|
| **B0** Layout frame | ✅ Done | 3-column grid, draggable splits, persisted layout |
| **B1** Monaco core | ✅ Done | `monaco-editor@0.52.2`, workers, `glass-dark` theme |
| **B2** Editable + save | ✅ Done | Write IPC, dirty tabs, ⌘/Ctrl+S, exit guard |
| **B3** Tabs + agent follow | ✅ Done | Multi-tab model cache, Apply → open/focus/reload |
| **B4** Inline agent diffs | ✅ Done | Inline `DiffEditor`, approval bar, stream delegates |
| **B5a** Bundled TS intelligence | ✅ Done | tsconfig IPC, Monaco TS/JS worker, `file://` URIs |
| **B5b** Real project LSP | ❌ Not implemented | Optional future track — see §7 B5b |
| **B6** Presence integration | ✅ Done | Shell glow, line pulse, voice editor commands |
| **B7** Full QA | ✅ Done | QA Mode toggle, pipeline, notification, auto-fix |

### Locked decisions (as built)

| Decision | Choice |
|----------|--------|
| LSP | **B5a only** — bundled Monaco TS/JS worker; B5b deferred |
| Preview placement | **Center tab** — Editor \| Preview in `GlassIdeEditorPane` |
| B2 writes | **Existing files only** — no create-file UX yet |
| Monaco pin | **`monaco-editor@0.52.2`** — workers verified in production build |
| Presence glow | **Unified cyan palette** — `glassPresenceGlow.css` tokens shared with overlay + companion |

---

### B0 — Layout frame ✅

**Goal:** Real editor region with draggable, persisted splits — no Monaco required yet.

**Shipped:**
- Generalized `useSplit.ts` (with `useSplitWithValue` for tree/stream widths); `useCoderPanelResize` delegates where applicable.
- `GlassIdeShell.tsx` restructured to **tree \| center (editor + terminal) \| AI stream** + bottom chat.
- Two horizontal splits (tree↔center, center↔stream) and one vertical split (editor↔terminal).
- Layout sizes persisted via `glassIdeLayoutSet` IPC → `GlassUserSettings` (`glassIdeTreeWidthPx`, `glassIdeStreamWidthPx`, `glassIdeEditorSplitRatio`).
- Extracted `GlassIdeFileTree.tsx` from the old file panel.

**Key files:**
- `src/renderer/overlay/GlassIdeShell.tsx`, `GlassIdeShell.css`
- `src/renderer/overlay/GlassIdeFileTree.tsx`
- `src/renderer/overlay/useSplit.ts`
- `src/shared/glassIdeLayout.ts`
- `src/test/glassIdeLayout.test.ts`

**IPC:** `glassIdeLayoutSet`

**Acceptance:** ✅ Splits drag, persist across reopen, typecheck clean.

---

### B1 — Monaco core ✅

**Goal:** Click a file → real Monaco with syntax highlighting and Glass theme.

**Shipped:**
- Pinned `monaco-editor@0.52.2` in `package.json`.
- Worker wiring in `electron.vite.config.ts` + `monacoEnvironment.ts` (editor, ts, json, css, html workers).
- `glassIdeMonacoShared.ts` — `glass-dark` theme, language map, `initMonacoEditor`, model URI helpers.
- `GlassIdeEditorPane.tsx` — Editor \| Preview center tabs.
- `GlassIdeEditorWorkspace.tsx` — Monaco mount, file load via existing read IPC.
- Retired `tokenizeLine` viewer for the editor surface (Monaco owns highlighting).

**Key files:**
- `src/renderer/overlay/glassIdeMonacoShared.ts`
- `src/renderer/overlay/GlassIdeEditorPane.tsx`
- `src/renderer/overlay/GlassIdeEditorWorkspace.tsx`
- `src/renderer/overlay/GlassIdeEditor.css`
- `src/renderer/overlay/monacoEnvironment.ts`

**IPC:** Reuses `glassIdeReadProjectFile`, `glassIdeListProject` (no new read IPC).

**Acceptance:** ✅ Syntax + theme in dev and packaged build; workers emit to `out/renderer/assets/*.worker-*.js`.

---

### B2 — Editable + save ✅

**Goal:** Type, dirty state, save to disk with guards.

**Shipped:**
- `writeGlassIdeProjectFile()` in `src/main/glassIdeProject.ts`:
  - `assertPathInProjectRoot`, existing files only, `GLASS_IDE_MAX_FILE_BYTES` cap, atomic temp+rename.
- IPC `glassIdeWriteProjectFile` + preload bridge.
- Dirty dot (●) per tab; ⌘/Ctrl+S save; save toast in editor pane.
- IDE exit blocked when any tab is dirty (alongside agent-running / approval-pending guards).

**Key files:**
- `src/main/glassIdeProject.ts`
- `src/shared/glassIdeProject.ts`
- `src/test/glassIdeProjectWrite.test.ts`

**IPC:** `glassIdeWriteProjectFile`

**Acceptance:** ✅ Edit + save round-trip; path traversal rejected in tests; typecheck clean.

---

### B3 — Tabs + active file follows the agent ✅

**Goal:** Multi-tab editor; Coder Apply opens and focuses the edited file.

**Shipped:**
- Tab bar in `GlassIdeEditorWorkspace.tsx` — open, switch, close (dirty confirm on close).
- One Monaco model per open file (cached in `modelsRef`; undo/scroll survive tab switches).
- Agent **Apply** → auto-open tab, reload from disk, refresh file tree (`refreshKey` on `GlassIdeFileTree`).
- Changelog **Show** in `GlassCoderStream` → `onOpenFile` opens file in editor.
- Pending-approval tab marker (◆) added in B4.

**Key files:**
- `src/renderer/overlay/GlassIdeEditorWorkspace.tsx`
- `src/renderer/overlay/GlassCoderStream.tsx`

**Acceptance:** ✅ Several tabs, dirty per tab, Coder Apply jumps editor to edited file.

---

### B4 — Inline agent diffs in the editor ✅

**Goal:** Pending Coder changes render in the editor, not only in the right stream.

**Shipped:**
- When `agentPendingApproval` for the active Coder run:
  - Auto-opens pending file tab.
  - Inline Monaco `DiffEditor` (`renderSideBySide: false`) — disk content vs `pending.proposedContent`.
  - Approval bar (Apply / Skip; Delete warning for `isDelete`).
  - Scrolls to first changed line from `displayLines`.
- `GlassCoderStream`: when `glassIdeActive`, shows compact delegate message instead of duplicate diff/buttons.
- Save/close blocked on pending tab; no dirty tracking on pending file during diff view.

**Key files:**
- `src/shared/glassIdeInlineDiff.ts` + `src/test/glassIdeInlineDiff.test.ts`
- `src/renderer/overlay/glassIdeDiffEditor.ts`
- `src/renderer/overlay/GlassIdeEditorWorkspace.tsx` (inline diff lifecycle)

**Acceptance:** ✅ Proposal shows inline; accept/reject reconciles with changelog; typecheck clean.

---

### B5a — Bundled TypeScript intelligence ✅

**Goal:** Per-file diagnostics, hover, completions via Monaco's bundled TS/JS worker — no LSP server.

**Shipped:**
- `readGlassIdeTsConfig()` in main — finds `tsconfig.json` / `jsconfig.json`, parses with `typescript` API; ignores "no inputs found" on empty projects.
- IPC `glassIdeReadTsConfig` → Monaco `typescriptDefaults` / `javascriptDefaults` (compiler options, diagnostics on, eager model sync).
- Model URIs upgraded to `file://` under resolved project root (better resolution vs `glass-ide://`).
- Workspace waits for TS config before opening files; remaps models when project root changes.
- Editor intelligence options: quick suggestions, hover, parameter hints, bracket guides, cross-document word suggestions.

**Key files:**
- `src/shared/glassIdeTsConfig.ts`
- `src/main/glassIdeTsConfig.ts`
- `src/renderer/overlay/glassIdeMonacoTypeScript.ts`
- `src/test/glassIdeTsConfig.test.ts`

**IPC:** `glassIdeReadTsConfig`

**Known limitation (by design):** Cross-file go-to-definition and project-wide diagnostics are weak until B5b.

**Acceptance:** ✅ Squiggles + hover + completion in open `.ts`/`.tsx`; tsconfig respected.

---

### B5b — Real project LSP ❌ Not implemented

**Planned but not built.** Would require:
- `typescript-language-server` child process from main.
- `monaco-languageclient` + `vscode-jsonrpc` over stdio, proxied renderer ⇄ preload ⇄ main ⇄ LSP.
- Gains: project-wide diagnostics, go-to-definition, find-references, rename.

**Recommendation unchanged:** Treat as a separate mini-project after B7 QA and daily-use validation of B5a. Do not block current ship on B5b.

---

### B6 — Presence integration ✅

**Goal:** Editor reacts to IIVO state; voice operates on Monaco selection; calm when idle.

**Shipped:**

**Presence glow on IDE shell**
- `deriveGlassIdePresencePhase()` — idle / listening / thinking / approval / answering from `GlassState`.
- `data-presence` on `.gide-shell` drives border, aura, and optional calm chip (hidden when idle).
- Unified glow tokens in `src/renderer/styles/glassPresenceGlow.css` (`--glass-accent-rgb`, `--presence-glow-cyan`, etc.).
- Overlay passive orbs dim when IDE active (`overlay-root--ide-active`); companion glow marks aligned to same cyan palette.

**Changed-line pulse**
- Monaco line decorations pulse on pending diff mount and after Coder Apply (`linesToPulseFromDisplay`).

**Voice-first editor commands**
- Editor context (file, selection, cursor) synced to main via `glassIdeEditorContextUpdate`.
- Voice phrases when IDE active: "open the auth file", "explain this function", "what changed here".
- `glass-ide-voice-command` in main resolves file open (`glassIdeOpenFile` broadcast) or launches Coder with enriched prompt.
- Agent prompts auto-enriched with active file/selection when `glassIdeActive`.

**Key files:**
- `src/shared/glassIdePresence.ts` + `src/test/glassIdePresence.test.ts`
- `src/shared/glassIdeEditorContext.ts` + `src/test/glassIdeEditorVoice.test.ts`
- `src/main/glassIdeEditorContext.ts`
- `src/renderer/styles/glassPresenceGlow.css`
- `src/renderer/overlay/GlassIdeShell.tsx`, `GlassIdeShell.css`
- `src/renderer/useVoiceMode.ts` (IDE voice routing)

**IPC / commands:** `glassIdeEditorContextUpdate`, `glassIdeOpenFile`, `glass-ide-voice-command`, `glass-ide-open-file`

**Acceptance:** ✅ Shell glow responds to Coder/ask state; voice opens/explains from editor; idle surface stays quiet.

---

### B7 — QA Mode ✅

**Goal:** Opt-in full quality pipeline after each Glass Coder run.

**Shipped:**
- **QA Mode toggle** + **Auto-fix toggle** in `GlassIdeShell` header (`qaModeEnabled`, `qaAutoFix` in settings).
- **Entry notification** — `GlassQaModeNotification` full-overlay card on first toggle per app session (6s countdown, staggered checklist, "Got it").
- **QA pipeline** (`src/main/coderQaPipeline.ts`) — sequential checks:
  1. Types/build (reuse `resolveBuildCommand`)
  2. Tests (detect `npm run test` / vitest / jest)
  3. Lint (detect `npm run lint` / eslint config)
  4. Preview smoke (webview console error probe via `idePreviewProbe` IPC)
  5. AI review pass 1 — correctness
  6. AI review pass 2 — production readiness
- **QA status board** — `GlassQaBoard` in AI stream pane below changelog.
- **Fix all with Glass** — combines failed check `fixPrompt`s → new Coder run with loop iteration.
- **Auto-fix** — 3-second countdown before auto-triggering fix (cancelable).
- When QA Mode on, legacy `coderAutoVerify` / `coderAutoReview` UI is suppressed (pipeline replaces them).
- Narration cues added to `agentNarration.ts`.

**Key files:**
- `src/shared/glassQaPipeline.ts` + `src/test/glassQaPipeline.test.ts`
- `src/shared/coderPostRunOrchestration.ts` + `src/test/coderPostRunOrchestration.test.ts`
- `src/main/coderPostRunOrchestration.ts` — deferred post-run scheduler
- `src/main/coderQaPipeline.ts`
- `src/renderer/overlay/GlassQaModeNotification.tsx` + `.css`
- `src/renderer/overlay/GlassQaBoard.tsx` + `.css`
- `src/renderer/overlay/GlassIdePreview.tsx` (preview probe)

**IPC:** `qaModeToggle`, `qaAutoFixToggle`, `showQaModeNotification`, `dismissQaModeNotification`, `qaPipelineFixAll`, `idePreviewProbe`, `idePreviewProbeResult`

**Acceptance:** ✅ Toggle QA Mode → entry card; Coder run completes → pipeline runs; failures show Fix all; auto-fix optional.

**Review record (post-ship audit):**

| Issue | Severity | Resolution |
|-------|----------|------------|
| Double auto-fix (main + UI countdown both fired) | High | Removed main-side auto-trigger; UI countdown is sole path |
| Auto-fix Cancel restarted countdown / interval kept running | High | Per-run suppression ref + explicit interval cleanup |
| Preview probe false pass when Preview tab unmounted | High | Keep preview webview mounted (hidden behind Editor tab) |
| Probe timeout / unavailable returned `[]` → pass | Medium | `skipped: true` / `null` resolves as skipped check |
| Review narration never fired (`running` vs result status) | Low | Narrate when step enters `running` |
| Pipeline completion narrated "Fixing…" before user action | Low | New cue `qa-issues-found` when failures remain |
| Pipeline triggered before approvals resolved | Fixed | `CoderPostRunScheduler` waits for run `done` + zero pending write approvals |
| `qaPipelineUpdate` IPC unused | Cosmetic | State sync uses `push()`; channel reserved |

**Manual test checklist:**

1. Toggle QA Mode on → entry card once per launch; dismiss via Got it or 6s timer
2. Run Coder with applied changes → six pipeline rows animate in sequence
3. Fail types/tests/lint → Fix all combines prompts; loop capped at 4
4. Enable Auto-fix → 3s countdown; Cancel suppresses for that run
5. Preview URL set, Editor tab active → preview probe still runs (hidden webview)
6. No preview URL → Live preview row shows **skipped**
7. Toggle QA Mode off → pipeline board clears

---

### IPC channels added (Tier B cumulative)

| Channel | Direction | Phase |
|---------|-----------|-------|
| `glassIdeLayoutSet` | renderer → main | B0 |
| `glassIdeWriteProjectFile` | renderer → main (invoke) | B2 |
| `glassIdeReadTsConfig` | renderer → main (invoke) | B5a |
| `glassIdeEditorContextUpdate` | overlay → main | B6 |
| `glassIdeOpenFile` | main → overlay (broadcast) | B6 |
| `qaModeToggle` | overlay → main | B7 |
| `qaAutoFixToggle` | overlay → main | B7 |
| `showQaModeNotification` | main → overlay (broadcast) | B7 |
| `dismissQaModeNotification` | overlay → main | B7 |
| `qaPipelineFixAll` | overlay → main (invoke) | B7 |
| `idePreviewProbe` | main → overlay | B7 |
| `idePreviewProbeResult` | overlay → main | B7 |

Existing channels reused: `glassIdeListProject`, `glassIdeReadProjectFile`, `glassIdeOpen` / `glassIdeClose`, preview set/reload.

**GlassCommand additions:** `glass-ide-open-file`, `glass-ide-voice-command`

---

### Test coverage (Tier B–specific)

| Test file | Covers |
|-----------|--------|
| `glassIdeLayout.test.ts` | Split clamps, defaults |
| `glassIdeProjectWrite.test.ts` | Write guards, round-trip |
| `glassIdeInlineDiff.test.ts` | Pending diff helpers |
| `glassIdeTsConfig.test.ts` | tsconfig parse, merge |
| `glassIdePresence.test.ts` | Presence phase derivation |
| `glassIdeEditorVoice.test.ts` | Voice intent matching |
| `glassQaPipeline.test.ts` | QA parse helpers, fix prompt merge |
| `coderPostRunOrchestration.test.ts` | Post-run gate — approvals, run complete, superseded |

Full suite: **1801 tests pass** (plus Tier B tests runnable via `node --import tsx --test src/test/glassIde*.test.ts`).

---

### Known limitations (as of B7 complete)

- **B5b LSP** — not implemented; cross-file TS navigation remains weak.
- **New file creation** — writes to existing paths only; no "New file" UX.
- **File list cap** — 800 files in tree listing.
- **Monaco bundle size** — overlay chunk ~6.4 MB including workers.
- **Exit guards** — blocked when dirty, agent running, or approval pending.
- **Voice IDE commands** — routed via Voice Mode when `glassIdeActive`; companion path uses standard coder/voice routing (IDE-specific phrases best via Voice Mode today).
- **QA preview probe** — requires preview URL set; webview stays loaded when Editor tab is active (hidden mount). 3s console capture window.
- **QA AI reviews** — capped at 5 files × 4KB each; uses `askIivoGlass` (network required).
- **QA pipeline timing** — triggers via `CoderPostRunScheduler` after Coder `done`, all write approvals resolved, and changelog entries recorded. Only files with action `applied` are verified/reviewed.

---

### What’s next — B5b and packaged validation

Tier B editor phases B0–B7 are shipped. Recommended follow-up:

- **Packaged daily use** — save round-trip, path-traversal rejection, worker load in **packaged** build, dirty-guard on exit.
- **Optional e2e** — IDE open → edit → save → Coder Apply → inline diff approve → QA pipeline.
- **B5b real LSP** — only after packaged QA validates B0–B7 (see §7 B5b).

**Do not start B5b until packaged QA validates the current editor.**

