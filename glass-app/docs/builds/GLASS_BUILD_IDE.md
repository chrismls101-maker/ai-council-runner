# Glass Build IDE — Implementation Prompt

**Paste this entire document into Cursor Agent to implement Glass IDE mode in phases.**  
Each phase is independently shippable. Build in order.

---

## Mission

When the user clicks **Glass Coder**, Glass transforms into a **built-in IDE environment** — like bringing Cursor back from the dock, but entirely inside Glass. No external editor required for the core loop.

The IDE composes existing Glass pieces (Coder agent, terminal, build loop) into one cohesive layout instead of scattered panels.

---

## Layout (locked)

Live preview is **not** a full-width strip across the top. It sits in the **left column**, beside the AI stream pane.

```
┌─────────────────────────────────────────────────────────────┐
│  Glass IDE                                        [Exit]    │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│  LIVE PREVIEW        │  AI STREAM + DIFFS                   │
│  (left, upper)       │  (right — full height of main area)  │
│                      │  streaming text, approval cards,     │
│                      │  changelog, verify, review           │
├──────────────────────┤                                      │
│  TERMINAL            │                                      │
│  (left, lower)       │                                      │
├──────────────────────┴──────────────────────────────────────┤
│  CHAT / PROMPT  (full width — type task, ↵ to run)          │
└─────────────────────────────────────────────────────────────┘
```

| Region | Position | Phase |
|--------|----------|-------|
| Header + Exit | Top bar | 0 |
| Live preview | Left upper (square-ish) | 3 |
| AI stream + diffs | Right column (tall) | 0 placeholder → 2 |
| Terminal | Left lower | 1 |
| Chat / prompt | Bottom full width | 0 |

**Builder strip** stays visible on the right edge during IDE mode (Agents tab, terminal toggle, Aletheia). **Command bar** and **dock** hide. On **Exit IDE**, command bar and dock restore.

---

## Chrome rules (locked)

| Surface | IDE open | Exit IDE |
|---------|----------|----------|
| Command bar | Hidden | Restored |
| Dock | Hidden | Restored |
| Builder strip | **Stays visible** | Stays visible |
| Overlay IDE shell | Shown | Hidden |

Implementation: `setIdeChromeSuppressed(glassIdeActive || coderWorkspaceActive)` in `windows.ts`.  
`glassIdeActive` — user opened IDE shell.  
`coderWorkspaceActive` — Coder agent run in progress (existing).  
Chrome stays hidden while either is true.

---

## What already exists

| Piece | Location |
|-------|----------|
| Coder agent + approval | `GlassCoderPanel`, agent runner |
| Workspace chrome hide | `setCoderWorkspaceActive` → refactor to `setIdeChromeSuppressed` |
| Terminal (xterm) | `GlassTerminalPanel` in dock window |
| Build loop | `coderBuildLoop.ts` |
| Agents entry | `GlassAgentPanel` coder card |

---

## Phase 0 — IDE shell transform

**Goal:** Click Glass Coder → full IDE layout appears immediately (before Run).

### State + IPC (`src/shared/ipc.ts`)

```typescript
glassIdeOpen: "glass:ide-open",
glassIdeClose: "glass:ide-close",
```

Add to `GlassState`:
```typescript
glassIdeActive?: boolean;
```

### Main (`src/main/index.ts`, `src/main/windows.ts`)

- `glassIdeOpen` IPC → `state.glassIdeActive = true`, `syncIdeChromeFromState()`, `push()`
- `glassIdeClose` IPC → `state.glassIdeActive = false`, `syncIdeChromeFromState()`, `push()`
- Refactor `setCoderWorkspaceActive` to `setIdeChromeSuppressed(suppressed: boolean)` where  
  `suppressed = state.glassIdeActive || state.coderWorkspaceActive`
- `deactivateCoderWorkspace` clears only `coderWorkspaceActive`, then re-syncs chrome

### Preload (`src/preload/index.ts`)

```typescript
glassIdeOpen(): void
glassIdeClose(): void
```

### New component: `src/renderer/overlay/GlassIdeShell.tsx` + `GlassIdeShell.css`

- Fixed grid inside overlay (respect `--grp-bottom-reserve` for builder strip, right inset for strip width ~52px)
- Regions: header with Exit, preview placeholder, stream placeholder, terminal placeholder, chat composer
- Chat composer: project folder picker, textarea, Run — same rules as `GlassAgentPanel` coder card
- On Run: call `agentRun` with `agentId: "coder"` (do not close IDE shell)
- Exit: `glassIdeClose()` — blocked while coder run is `running` or approval pending (tooltip explains)

### Entry points

1. **Glass Coder card click** in `GlassAgentPanel` → `glassIdeOpen()`, close agents builder panel
2. **`openCoderWithPrompt`** → main sets `glassIdeActive` or renderer opens IDE on broadcast

### Overlay (`src/renderer/overlay/Overlay.tsx`)

- Render `<GlassIdeShell />` when `state.glassIdeActive`
- When IDE active, suppress standalone `GlassCoderPanel` slide-in (Phase 2 moves content into shell)

### Phase 0 placeholders

Preview, terminal, and stream panes show labeled placeholders (“Phase 1”, “Phase 2”, “Phase 3”). Chat is fully functional.

---

## Phase 1 — Terminal docked (bottom-left)

- Mount `GlassTerminalPanel` in the terminal slot
- On IDE enter: auto-open terminal, `cd` to `agentCodeWorkspaceRoot`
- Hide or reposition standalone terminal window while IDE active
- Draggable split between preview and terminal on the left column

---

## Phase 2 — AI stream pane (right column)

- Move `GlassCoderPanel` content into the stream slot (streaming, diffs, changelog, verify, review)
- Remove standalone right-slide `GlassCoderPanel` when IDE active
- Chat stays fixed at bottom

---

## Phase 3 — Live preview (left upper)

- URL bar + Electron `<webview>` or `BrowserView` for `http://localhost:…`
- Auto-detect dev server URL from terminal output
- Refresh on Coder Apply
- Static `index.html` fallback via minimal local file server

**Ceiling:** Web dev stacks only — not native mobile, pure backend APIs, or nested Electron apps.

---

## Phase 4 — File viewer (optional)

- File tree + read-only syntax-highlighted viewer
- Not full Monaco / LSP in this build series

---

## Phase 5 — Full QA mode

- Test suite + lint after verify
- Multi-pass review
- Preview smoke check (page loads, no console errors)
- Iteration cap like build loop

---

## Typecheck

```bash
cd desktop-glass && npm run typecheck
```

Zero errors required before each phase is done.

---

## Demo (end state)

1. Click Glass Coder → IDE transforms; command bar + dock gone; strip remains
2. Type task in bottom chat → Run
3. Diffs stream in right pane → Apply
4. Terminal (bottom-left): `npm run dev`
5. Preview (left upper) shows localhost site
6. Verify + review pass
7. Exit IDE → command bar + dock return

---

## Out of scope (ceiling)

- Full Cursor editor parity (Monaco + LSP + Tab completion)
- Preview for Xcode / iOS sim / Android emulator
- Cloud index sync
