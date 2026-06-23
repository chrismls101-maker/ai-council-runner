# Glass Coder — Locked Implementation Prompt

**Paste this entire document into Cursor Agent to implement Build 1 (baseline).**  
Do not implement delete_file, shell/git, web search, batch apply, or Cursor-style Tab/index in this pass.

---

## Mission

Add **Glass Coder** (`id: "coder"`) — a project-scoped coding agent that reads the user's repo, proposes edits, shows a **unified diff**, and applies changes **only after explicit approval**.

When a Coder run is active, Glass enters **Coder Workspace Mode**:
- **Command bar** hidden
- **Dock** hidden
- **Builder strip** remains (Agents tab + stop)
- A **resizable right side panel** opens (default ~480px, drag left edge to widen, min 380px, max 60% viewport)
- Panel hosts: streaming answer, approval diff cards, change log, file actions

This is distinct from **Code Analyst** (`id: "code"`) which is read-only and saves reports to `~/Desktop/IIVO Research`.

---

## Product rules (locked)

| Rule | Detail |
|------|--------|
| Writes go to project | Uses `glassSettings.agentCodeWorkspaceRoot` — **required** before Run |
| No `write_file` tool | Coder never writes to IIVO Research folder |
| No web search | Local code only |
| No shell / git | File read/write only in Build 1 |
| One run at a time | Same `activeAgentRun` mutex as other agents |
| Every write needs approval | `edit_file` and `create_file` pause until Apply or Skip |
| Reuse existing infra | `readFileForDiff`, `applyCodeToFile`, `computeUnifiedDiff`, `DiffView`, `isSafePath` |

---

## Coder Workspace Mode

### When it activates
- User starts a Glass Coder run from the Agents panel (`agentId: "coder"`)
- Stays active while `state.agentRun?.agentId === "coder"` and status is `"running"` OR while `agentPendingApproval` is set OR until user dismisses the Coder panel after terminal state (`done` / `error` / `cancelled`)

### When it deactivates
- Agent reaches terminal state AND user closes the Coder panel, OR user hits Stop
- Restore command bar + dock visibility to previous state

### Main process (`src/main/windows.ts` + `src/main/index.ts`)
Add `coderWorkspaceActive: boolean` to pushed `GlassState` (or derive from `agentRun` + `agentPendingApproval` in renderer — prefer explicit flag set by main on coder start/stop for window chrome control).

On `coderWorkspaceActive === true`:
- Hide `windows.commandBar` (similar to existing `commandBarVisible = false` path)
- Hide `windows.dock`
- Keep overlay + builder strip interactive (`setResponsePanelOpen` / `builderStripPanelOpen` patterns in `windows.ts`)
- Push layout so overlay content reserves right panel width

On deactivate: restore command bar and dock.

### Renderer layout (`src/renderer/overlay/Overlay.tsx`)
- New component: **`GlassCoderPanel.tsx`** + **`GlassCoderPanel.css`**
- Fixed right panel, left of builder strip (strip stays at `right: 0`, panel at `right: 52px`)
- Default width: **480px**; persisted in `glassSettings.coderPanelWidthPx` (add field + persistence in `glassSettingsPersistence.ts`)
- **Drag resize**: left-edge handle (mirror `useTerminalPanelResize.ts` pattern — drag left edge increases width)
- CSS variable: `--coder-panel-width` on overlay root; panel uses `width: var(--coder-panel-width)`
- All panel controls: `ensureOverlayInteractive` on pointer down + `GlassHoverTooltip` for labels (panel has `overflow: hidden` — do not use native `title` for toolbar icons)

### Agents panel behavior for Coder
- When user runs **Glass Coder** specifically: close the builder side panel (`onClose`) as today, but **open `GlassCoderPanel`** instead of relying only on `GlassResponsePanel`
- Code Analyst / Research / Writing keep current behavior (Answer Panel only, no workspace transform)
- Coder card: require `agentCodeWorkspaceRoot` — show inline picker if missing (reuse `agentPickWorkspaceRoot` IPC)

---

## Agent definition

### Types (`src/shared/ipc.ts`)
```typescript
export const GLASS_AGENT_IDS = ["research", "code", "writing", "coder"] as const;
```

Add to `AgentEventKind`:
```typescript
| "approval-required"
```

Extend `AgentEvent`:
```typescript
pendingToolId?: string;
pendingToolName?: string;
pendingToolInput?: unknown;
pendingApproval?: {
  filePath: string;
  relativePath: string;
  description: string;
  displayLines: import("./diff.ts").DiffLine[];
  diff: import("./diff.ts").UnifiedDiff;
  contentHash: string;
  proposedContent: string;
  fileExisted: boolean;
};
```

New IPC channels:
```typescript
agentApprove: "glass:agent-approve",   // payload: { runId, pendingToolId, approved: boolean }
```

Extend `GlassState`:
```typescript
agentPendingApproval?: {
  runId: string;
  agentId: GlassAgentId;
  pendingToolId: string;
  pendingToolName: string;
  // ...pendingApproval fields
} | null;

agentChangeLog?: Array<{
  runId: string;
  path: string;
  relativePath: string;
  action: "applied" | "skipped" | "failed";
  description: string;
  at: number;
  error?: string;
}>;

coderWorkspaceActive?: boolean;
```

### Catalog (`src/shared/agentCatalog.ts`)
```typescript
{
  id: "coder",
  icon: "⟁",
  name: "Glass Coder",
  description: "Explores your project and applies edits with your approval.",
  placeholder: 'Describe the change. e.g. "Add error handling to fetch in api.ts"',
}
```

### Tools (`src/main/agents/definitions.ts`)
```typescript
coder: [READ_FILE_TOOL, LIST_DIRECTORY_TOOL, SEARCH_FILES_TOOL, EDIT_FILE_TOOL, CREATE_FILE_TOOL],
```

**Do not** include `WRITE_FILE_TOOL` or `WEB_SEARCH_TOOL`.

#### `edit_file` schema
- `path` (absolute)
- `old_string` (exact match, must be unique in file)
- `new_string`
- `description` (shown in approval UI)

#### `create_file` schema
- `path` (absolute)
- `content` (full file)
- `description`

### System prompt
```
You are Glass Coder, a coding agent in IIVO Glass on macOS.

Explore the project with list_directory, search_files, and read_file. Make targeted edits with edit_file or create_file. The user approves or skips each change before it is written.

Rules:
- Always read_file before edit_file — never guess file contents
- old_string must match exactly; if not found, re-read and try again
- One logical change per edit_file call
- Write a clear description for every change
- Prefer edit_file over create_file
- Do not delete files unless explicitly asked (delete tool not available)
- After all changes: summarize what was applied, skipped, and suggest follow-ups
- Only operate under the project root provided in the first message
```

Inject project root in first user message (same pattern as `buildInitialUserMessage` for code agent in `agentRunner.ts`).

---

## Tool executors (`src/main/agentRunner.ts`)

### Path sandbox
Add `assertPathInProjectRoot(absPath, projectRoot)` — reject paths outside `agentCodeWorkspaceRoot`. Combine with existing `isSafePath` from `glassActions.ts`.

Pass `projectRoot` into `AgentRunOptions` from main (`state.glassSettings.agentCodeWorkspaceRoot`).

### Write tools flow (critical)
For `edit_file` and `create_file`, **do not execute immediately**:

1. Validate path in project root
2. `readFileForDiff(path)` → `content`, `hash`, `existed`
3. Compute `proposedContent`:
   - **edit**: verify `old_string` appears exactly once; replace; error if 0 or 2+ matches
   - **create**: fail if file exists; proposed = `content`
4. `computeUnifiedDiff(before, proposed)` + `collapseUnchanged`
5. Call `approvalGate(toolUseId, toolName, toolInput, approvalPayload)` → `Promise<boolean>`
6. If **false** (skip): return tool result `"User skipped this change."`
7. If **true**: `applyCodeToFile(path, proposedContent, contentHash)`
   - On `driftDetected`: return error tool result asking model to re-read
   - On success: append to `agentChangeLog`, return `"Applied <relativePath> — <description>"`

### `approvalGate` in `AgentRunOptions`
```typescript
approvalGate?: (request: {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  approval: AgentEvent["pendingApproval"];
}) => Promise<boolean>;
```

Main process (`index.ts`) implements with **keyed resolver Map**:
```typescript
// key = `${runId}:${toolUseId}`
const approvalResolvers = new Map<string, (approved: boolean) => void>();
```
- On `approval-required` broadcast: store resolver, set `state.agentPendingApproval`, `coderWorkspaceActive`, push
- `ipcMain.handle(IPC.agentApprove)`: resolve matching resolver, clear pending
- On `agentStop` / cancel / crash: reject all resolvers for that `runId` with `false`, clear pending

**Never use bare `ipcMain.once` without runId + toolUseId keying.**

Emit event:
```typescript
emit(onEvent, runId, agentId, "approval-required", {
  pendingToolId: toolUseId,
  pendingToolName: toolName,
  pendingToolInput: toolInput,
  pendingApproval: { ... },
});
```

**Narration**: do NOT emit `tool-start` narrate for write tools before approval. Narrate on `approval-required`: *"Review the change."*

---

## Glass Coder Panel UI (`GlassCoderPanel.tsx`)

### Sections (top to bottom)
1. **Header** — "Glass Coder" + status (Running / Waiting for approval / Done) + Stop + Close
2. **Prompt** — truncated user task
3. **Streaming answer** — reuse `parseMarkdown` from `GlassResponsePanel.tsx` (export if needed)
4. **Approval card** (when `agentPendingApproval` matches current run):
   - Relative file path + description
   - `DiffView` with `displayLines` from event/state
   - **Apply** (primary green) / **Skip** (ghost)
   - `ensureOverlayInteractive` on all buttons
5. **Change log** — list of applied/skipped/failed with Reveal in Finder per path (`agentRevealPath`)
6. **Resize handle** — left edge, 6px hit target

### IPC from panel
```typescript
window.glass.agentApprove({ runId, pendingToolId, approved: true | false })
window.glass.agentStop()
```

### Preload (`src/preload/index.ts`)
Add `agentApprove(payload)` bridge method.

---

## Wiring changes

| File | Change |
|------|--------|
| `src/main/agents/definitions.ts` | Coder prompt + tools |
| `src/main/agentRunner.ts` | Write executors, approval gate, project root injection |
| `src/main/glassActions.ts` | Optional: shared `proposeEdit` helper |
| `src/main/agentHistoryStore.ts` | History entries for coder track `changedFiles[]` not `savedFilePath` |
| `src/main/index.ts` | Coder workspace chrome, approval IPC, change log, run options |
| `src/main/windows.ts` | Hide/show command bar + dock on coder workspace |
| `src/shared/ipc.ts` | Types, channels, state fields |
| `src/shared/glassSettings.ts` | `coderPanelWidthPx?: number` |
| `src/main/glassSettingsPersistence.ts` | Persist panel width |
| `src/shared/agentCatalog.ts` | Coder card |
| `src/shared/agentNarration.ts` | Cues for edit/create/approval (no pre-approval "Editing…") |
| `src/preload/index.ts` | `agentApprove` |
| `src/renderer/overlay/GlassCoderPanel.tsx` | **New** — main Coder UI |
| `src/renderer/overlay/Overlay.tsx` | Coder workspace layout, panel mount, agent event → approval state |
| `src/renderer/builder/GlassAgentPanel.tsx` | Coder run opens workspace; require project folder |
| `src/renderer/overlay/GlassResponsePanel.tsx` | **No change required for Coder** — Coder uses dedicated panel |

---

## Agent run flow (end-to-end)

```
User picks Glass Coder → sets project folder if needed → enters prompt → Run
  → main: coderWorkspaceActive=true, hide dock + command bar
  → GlassCoderPanel opens (resizable)
  → agent loop: read/search/list freely
  → edit_file/create_file → approval-required → panel shows diff
  → User Apply → applyCodeToFile → tool result → loop continues
  → User Skip → "User skipped" tool result → loop continues
  → done → status Done, narration, lastNotice, history updated
  → User Close panel → coderWorkspaceActive=false, restore chrome
```

---

## Out of scope (Build 1 — do not implement)

- `delete_file`
- `replace_file` (full-file replace tool)
- Shell / terminal execution
- Git operations
- Web search
- Apply All / Skip All batch
- Auto `glass-verify-build` after apply (Build 2)
- Restore backup UI (Build 2)
- Cursor Tab / codebase embedding index
- Computer Use agent

---

## Tests (required)

Add tests in `src/test/`:
1. `assertPathInProjectRoot` — allows inside root, rejects `..` escape
2. `edit_file` proposal — unique `old_string`, zero matches error, double match error
3. Approval resolver — approve resolves true, skip false, stop clears pending
4. `computeUnifiedDiff` on edit proposal (reuse existing diff tests pattern)

Run before done:
```bash
cd desktop-glass && npm run typecheck
```

---

## Acceptance checklist

- [ ] `Glass Coder` card appears in Agents panel
- [ ] Cannot run without project folder set
- [ ] Starting Coder hides command bar and dock; strip remains
- [ ] Resizable right panel opens; width persists across sessions
- [ ] Agent reads files and proposes edits
- [ ] Each edit shows unified diff with Apply / Skip
- [ ] Apply writes file with backup + hash drift protection
- [ ] Skip returns skip message to model without writing
- [ ] Stop cancels pending approval and restores workspace
- [ ] Change log shows applied/skipped files
- [ ] Code Analyst / Research / Writing unchanged
- [ ] `npm run typecheck` passes

---

## Implementation order

1. IPC types + `GLASS_AGENT_IDS` + catalog + definitions (no executors yet) — typecheck
2. Path sandbox + `edit_file`/`create_file` proposal logic + unit tests
3. Approval gate in `agentRunner` + main resolver + `agentApprove` IPC
4. `GlassCoderPanel` UI (static mock with fake diff first, then wire events)
5. Coder workspace mode (hide chrome, layout vars, resize handle)
6. `GlassAgentPanel` Coder-specific run path + project folder gate
7. Narration + history + `lastNotice` polish
8. Full typecheck + manual smoke test

---

## Manual smoke test

1. Set project folder to a git repo in Settings → Glass Agents
2. Run Glass Coder: "Add a comment at the top of README.md"
3. Verify: dock/bar hidden, panel opens, diff shows, Apply writes file
4. Run again with Skip on first proposed change — agent should acknowledge skip
5. Stop mid-run — chrome restores
6. Confirm Code Analyst still produces report in IIVO Research (no workspace transform)

---

*Build 2 (future): delete_file, restore backup, auto typecheck feedback, Apply All.*  
*Build 3 (future): editor context from frontmost app, lightweight file index.*
