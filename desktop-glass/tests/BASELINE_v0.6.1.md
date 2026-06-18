# IIVO Glass — Baseline v0.6.0

**Date:** 2026-06-17
**Version:** 0.6.1 (package.json)
**Branch:** main
**Typecheck:** ✅ clean (0 errors)
**Tests:** 1,627 passing / 0 failing / 91 suites

---

## Health snapshot

| Metric | Value |
|--------|-------|
| Total tests | **1,627** |
| Passing | **1,627** |
| Failing | **0** |
| TypeScript errors | **0** |
| Test suites | **91** |
| New source files since v0.5.0 | **31** |
| Total files changed since v0.5.0 | **~102** |

---

## What shipped in this update

This update covers everything built between the v0.5.0 release tag and v0.6.0. It is divided into two layers: the **WIP Foundation** (Glass core infrastructure that was developed on a feature branch and merged), and five numbered **feature tasks** (#161–#165) built on top of it.

---

## Layer 1 — WIP Foundation (Glass Core Infrastructure)

These files represent the base platform that all #161–#165 features build upon. They were developed in parallel with v0.5.0 and merged in as a foundation layer.

### Glass PTY Terminal

A fully-integrated embedded terminal (PTY) inside the Glass dock panel. Users can run shell commands without leaving Glass.

| File | Role |
|------|------|
| `src/main/glassTerminal.ts` | PTY session lifecycle — create, write input, resize, destroy; `createPtySession`, `writePtyInput`, `destroyPtySession` |
| `src/main/glassTerminalWindow.ts` | Terminal window management and focus control |
| `src/renderer/dock/GlassTerminalPanel.tsx` | Terminal panel React component — renders xterm.js inside the dock |
| `src/renderer/dock/glassTerminalLayout.ts` | Terminal panel sizing and layout math |
| `src/renderer/dock/useTerminalPanelResize.ts` | Drag-to-resize hook for the terminal panel |
| `src/renderer/terminal/` | xterm.js renderer integration (addons, fit, WebGL) |
| `src/renderer/overlay/TerminalFeedWidget.tsx` | Overlay widget showing live terminal output in the feed |

Terminal features: PTY sessions via `node-pty`, `/run <command>` command bar syntax, streaming output in feed cards (`shell` kind), auto-fix suggestions on non-zero exits (`terminal-fix` feed kind), build error detection in-stream (`build-error` feed kind).

### Glass Actions Engine

| File | Role |
|------|------|
| `src/main/glassActions.ts` | Three action primitives the AI can invoke: `runShellCommand` (callback-based, returns cancel fn), `writeFile` (home/tmp only), `injectKeystrokes` (types into frontmost macOS app) |

### Code Context & Intelligence

| File | Role |
|------|------|
| `src/main/codeContextReader.ts` | Reads the file open in the active editor (Cursor, VS Code, Xcode, etc.) via accessibility APIs |
| `src/main/clipboardIntelligence.ts` | Clipboard change detection and content classification |
| `src/main/glassMemory.ts` | Persistent cross-session memory store for Glass AI (`~/.iivo-glass/memory.json`) |
| `src/main/glassScreenDigest.ts` | Screen content summarisation for passive context |
| `src/test/clipboardIntelligence.test.ts` | Tests for clipboard classification |

### Powers Palette

| File | Role |
|------|------|
| `src/renderer/command/GlassPowersPalette.tsx` | ⌘⇧P quick-launcher — searchable, keyboard-navigable list of Glass powers. 14 built-in powers across categories: ask, capture, terminal, session, tools, settings. Direct and prefill action kinds. |

### UI Components

| File | Role |
|------|------|
| `src/renderer/command/GlassAwarenessStrip.tsx` | Strip showing Glass's active awareness context (editor file, audio, etc.) |
| `src/renderer/command/CommandDesignIcon.tsx` | SVG icon for design-to-code trigger button |
| `src/renderer/components/CopyButton.tsx` | Reusable copy-to-clipboard button with animated feedback |
| `src/renderer/components/GlassMarkdown.tsx` | Markdown renderer for Glass AI responses |
| `src/renderer/useCopyToClipboard.ts` | Copy-to-clipboard hook with timeout reset |

### Shared Utilities

| File | Role |
|------|------|
| `src/shared/diff.ts` | Pure diff engine — `computeDiff`, `applyDiff`, `parseDiff`, `renderDiffHtml`; Myers diff algorithm |
| `src/shared/markdownCode.ts` | Extracts fenced code blocks from AI markdown responses; `extractCodeBlocks`, `pickBestBlock` |
| `src/test/diff.test.ts` | Tests for diff engine |
| `src/test/markdownCode.test.ts` | Tests for markdown code extraction |

### Type Declarations

| File | Role |
|------|------|
| `src/types/` | Module augmentation stubs for `node-pty`, `@xterm/xterm`, `@xterm/addon-*` — required for TypeScript to accept these native modules |

---

## Layer 2 — Feature Tasks (#161–#165)

### #161 — Diff Preview Before AI Code Apply

**What it does:** When Glass AI suggests a code change, the user sees a side-by-side diff panel before deciding to apply it. The panel shows added lines in green and removed lines in red. An "Apply" button writes the change to disk; "Dismiss" discards it.

**Key files:**
- `src/shared/diff.ts` — core diff engine (also part of WIP foundation)
- `src/shared/ipc.ts` — added `diff-preview-show`, `diff-preview-apply`, `diff-preview-dismiss` to `GlassCommand`; added `diffPreview?: DiffPreviewState` to `GlassState`
- `src/main/index.ts` — three new IPC handlers; `readFileForDiff` + `restoreBackup` integrated; diff preview state management
- `src/renderer/styles/glass.css` — diff panel, line-level add/remove coloring, apply/dismiss button styles
- `src/test/diff.test.ts` — 38 tests for diff engine

**UX flow:** AI response → "Apply to file" → Glass reads current file, computes diff, shows panel → user reviews → "Apply" writes patch or "Dismiss" closes.

---

### #162 — Build Output Monitoring

**What it does:** Glass monitors the PTY terminal stream for TypeScript/compiler errors in real time. When a build fails, a `build-error` feed card appears with the error snippet and a "Fix with AI" button that injects the error text + context into a Glass AI prompt.

**Key files:**
- `src/shared/commandFeed.ts` — added `"build-error"` to `GlassCommandFeedKind`; added `errorText?`, `errorFilePaths?` fields to `GlassCommandFeedItem`
- `src/shared/ipc.ts` — `buildVerifications` with `"not-found"` status; `GlassBuildCommand` type
- `src/main/index.ts` — `detectBuildErrors`, `checkBuildSuccess`, `resolveBuildCommand` (typecheck/type-check key detection fix), `buildMonitorLastFingerprint` dedup map; build monitor wired to PTY terminal stream
- `src/test/buildMonitor.test.ts` — tests for build error detection and dedup logic
- `src/renderer/styles/glass.css` — build-error card styles, "Fix with AI" button

**Design:** The monitor runs inside the PTY `onData` callback, accumulating output into a rolling buffer. It pattern-matches for TypeScript error signatures (`error TS`, `Cannot find`, etc.) and debounces to avoid false positives on in-progress builds. A fingerprint map prevents the same error from firing duplicate feed cards.

---

### #163 — Design-to-Code

**What it does:** ⌘⇧D (or the camera icon in the command bar) captures a screenshot of the current UI design and passes it to Glass AI. The user picks from four modes: **React component**, **HTML/CSS**, **Describe this design**, or **Match to my codebase**. The "match codebase" mode reads the currently open editor file and passes it as context so the AI matches the project's style.

**Key files:**
- `src/shared/designToCode.ts` (NEW) — pure module: `DesignToCodeAction`, `DesignToCodeContext`, `ImportedFileContext`; `buildDesignToCodePrompt` for all 4 modes; `langTagFor` (language → fenced code tag); `isEditorAppName`; `DESIGN_TO_CODE_ACTION_LABELS`
- `src/shared/commandFeed.ts` — added `"design-capture"` kind; `designImageDataUrl?`, `designDetectedFileName?` fields
- `src/shared/ipc.ts` — added `design-capture-start`, `design-generate`, `design-generate-cancel` to `GlassCommand`; `designToCodeRunning`, `designToCodeImageDataUrl`, `designToCodeDetectedFile` in `GlassState`
- `src/main/index.ts` — `runDesignGeneration`, `captureDesignScreenshot`, `cancelDesignGeneration`; 6 new command handlers
- `src/renderer/command/CommandDesignIcon.tsx` — SVG trigger button in command bar
- `src/renderer/overlay/OverlayFeedCard.tsx` — design-capture card renders screenshot thumbnail + 4 action buttons; `isWorking` phase includes `"permission"`
- `src/renderer/styles/glass.css` — design-capture card, thumbnail, action button grid, loading state
- `src/test/designToCode.test.ts` — 41 tests for all prompt-building paths

---

### #164 — Import-Aware Code Context

**What it does:** When "Match to my codebase" is selected, Glass now also reads the files imported by the target file (depth-1 and selective depth-2), giving the AI a richer picture of the codebase conventions. This is done with a smart BFS that respects a 32k character budget and skips test files, generated files, and `node_modules`.

**Key files:**
- `src/main/importGraphReader.ts` (NEW) — `parseImports` (regex-based, handles TS/JS/Python/CJS/dynamic imports); `resolveImportPath` (tries 9 extensions + index files); `findProjectRoot` (walks up for `package.json`/`tsconfig.json`); `readImportGraph` (BFS depth-1 + depth-2, 32k char budget, dedup via `visited` Set, proximity scoring)
- `src/shared/designToCode.ts` — added `ImportedFileContext` interface; `importedFiles?: ImportedFileContext[]` on `DesignToCodeContext`; `buildDesignToCodePrompt("match-codebase")` now includes imported files section
- `src/main/index.ts` — `runDesignGeneration` calls `readImportGraph` and passes `importedFiles` to context
- `src/test/importGraphReader.test.ts` (NEW) — 35 tests: parseImports (multiline, side-effect, dynamic, CJS, Python, dedup, bare specifier filtering), resolveImportPath (extension fallback, directory index), findProjectRoot, readImportGraph (depth limits, budget, skip rules, truncation)

**Token budget:** 32k characters (~8k tokens) across all imported files. Each file is capped at 4k characters. Depth-2 files only included if in the same or adjacent directory as the target. Skips: `node_modules`, `*.test.*`, `*.spec.*`, `*.d.ts`, binary assets.

---

### #165 — Custom Slash Commands

**What it does:** Users create `~/.iivo/glass-commands.json` to define their own commands that appear in the ⌘⇧P powers palette under a "custom" category (green badge). Three action types: **shell** (runs in dock terminal), **prompt** (sends preset text to Glass AI), **shell-then-prompt** (runs command, passes output to Glass AI for explanation).

**Key files:**
- `src/shared/customCommands.ts` (NEW) — pure module (no Electron imports): `CustomCommandAction` union (`shell | prompt | shell-then-prompt`); `CustomCommand` interface; `validateCustomCommands(raw)` with full validation (name regex, dedup, length limits, action type checks); `buildShellThenPromptText` helper; `DEFAULT_CUSTOM_ICON`, `CUSTOM_COMMANDS_FILENAME`, `CUSTOM_COMMANDS_DIR`
- `src/main/customCommandsLoader.ts` (NEW) — `loadCustomCommands()` (reads, parses, validates; ENOENT is silent); `watchCustomCommands(onChange)` (creates `~/.iivo/` if needed, `fs.watch` with 300ms debounce, calls onChange immediately + on change; returns cleanup fn)
- `src/shared/ipc.ts` — `customCommands?`, `customCommandsWarnings?` added to `GlassState`; `{ type: "custom-command-run"; name: string }` added to `GlassCommand`
- `src/main/index.ts` — `watchCustomCommands` startup call; `custom-command-run` handler with all three action types; `shell-then-prompt` wraps callback-based `runShellCommand` in a Promise with cancel ref, always resolves (non-zero exit prefixed to output so AI can explain failures)
- `src/renderer/command/GlassPowersPalette.tsx` — reads `state.customCommands`, builds `GlassPower[]` via `useMemo`, merges at top of palette; shows green "custom" badge instead of kbd hint; "custom" added to category union
- `src/renderer/styles/glass.css` — `.glass-powers-palette__item-badge` (green, uppercase, monospace, bordered)
- `src/test/customCommands.test.ts` (NEW) — 46 tests: validateCustomCommands (name regex, trailing hyphen, dedup, action types, limits, partial batches), buildShellThenPromptText (format, empty output, multiline), constants

**Config format (`~/.iivo/glass-commands.json`):**
```json
[
  { "name": "deploy", "description": "Deploy to staging", "icon": "⚡",
    "action": { "type": "shell", "command": "npm run deploy:staging" } },
  { "name": "review", "description": "Review my current code",
    "action": { "type": "prompt", "text": "Review the code I'm looking at for bugs." } },
  { "name": "test", "description": "Run tests and explain failures",
    "action": { "type": "shell-then-prompt", "command": "npm test",
                 "prompt": "Explain any test failures and suggest fixes:" } }
]
```

**Validation rules:** name must match `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` (no leading/trailing hyphens), max 40 chars; description max 120 chars; icon must be non-empty string; max 50 commands; duplicates skipped with warning.

---

## Bug fixes included in this update

| Bug | Fix |
|-----|-----|
| `resolveBuildCommand` read script value instead of key | Fixed: check `!== undefined` to get the key name, not `pkg.scripts[key]` body |
| `checkBuildSuccess` dedup had comment but no code | Fixed: `buildMonitorLastFingerprint` Map keyed by `"verify:<snippet>"` |
| `parseImports` regex broke multiline imports | Fixed: match `from '...'` directly (not full import statement) |
| `isWorking` missing `"permission"` phase | Fixed in `OverlayFeedCard.tsx` |
| `NAME_RE` allowed trailing hyphens (`"bad-"`) | Fixed: `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` |
| Empty icon string `""` passed validation | Fixed: explicit `icon.length === 0` check |
| `shell-then-prompt` leaked process on error | Fixed: `cancelRef` pattern stores cancel fn, called in catch |
| `shell-then-prompt` rejected non-zero exit | Fixed: always resolve, prefix exit code to output |
| `shell` action checked `glassDockTerminalOpen` only | Fixed: also check `glassDockTerminalId` (PTY may exit without resetting flag) |
| Web app `LoginPage.tsx` TS error (magicLink plugin) | Fixed: added `magicLinkClient` plugin to auth client |

---

## Architecture notes

### IPC pattern
All communication between main and renderer goes through `src/shared/ipc.ts`. `GlassState` is the single source of truth pushed from main → renderer. `GlassCommand` is the union of all commands renderer → main. New features add to these unions — they never bypass them.

### Pure modules
All prompt-building, validation, and data-shaping logic lives in `src/shared/` with no Electron/Node imports. This keeps it unit-testable in `node:test` without mocking.

### Test runner
`node --experimental-strip-types --test [files...]` — all test files listed explicitly in `package.json`. Add new test files to the list or they won't run in CI.

### Feed card architecture
`GlassCommandFeedKind` in `commandFeed.ts` is the gating union for what cards can appear. Adding a new card type requires: (1) add to the union, (2) add title to `COMMAND_FEED_TITLES`, (3) handle in `OverlayFeedCard.tsx`, (4) add CSS.
