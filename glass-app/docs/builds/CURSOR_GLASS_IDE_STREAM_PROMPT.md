# Glass IDE Stream — Cursor-Quality Build Prompt

Copy everything below the line into a new Cursor chat for the `desktop-glass` repo.

---

## Mission

Finish the **Glass IDE Coder live stream** so it looks and behaves like **Cursor's agent chat** while coding — not a status ticker, not placeholder UI. The backend is real (Anthropic agent, file writes, approval modes). The stream must **look real** because it **is real**.

**Quality bar:** 8+/10 vs Cursor for the stream pane during an active Coder run. No green lights without visual proof.

## Non-negotiables

1. **Do not stop at "events arrive"** — verify rendered UI: reasoning text, diff cards, syntax colors, `+N` / `−M`, tool rows.
2. **Run tests twice** before declaring done — actual command output, not assumptions.
3. **No commits** unless explicitly asked.
4. **API key** lives in repo `.env` or parent `.env` — never commit it.

## What the stream must show (Cursor-style)

### During a run
- **Reasoning text** streams with proper markdown (paragraphs, `` `inline code` ``, fenced code blocks with copy button).
- **Blinking caret** on the active streaming text block while agent is running.
- **Thinking indicator** — animated pill, not plain italic text.
- **Narration** (`narrate` events) as subtle activity lines, not random paragraphs.

### Write tools (`create_file`, `edit_file`, `delete_file`)
Each gets a **diff card** inside the transcript:
- Header: `filename` + language chip (TypeScript, TSX, etc.) + **`+N` `−M`**
- Body: red removed lines, green added lines, collapsed unchanged sentinel
- **Syntax highlighting** on diff lines: keywords, strings, numbers, comments (use shared `glassIdeSyntax.ts`)
- **Live diff on tool-start** (not only on tool-done):
  - `create_file`: preview from `toolInput.content`
  - `edit_file`: **read file from disk on tool-start**, compute diff from `old_string` / `new_string`
  - `delete_file`: read file, show full-file remove diff
  - Main process: `buildWriteToolStartPreview()` in `agentWriteToolPreview.ts` attaches `pendingApproval` to `tool-start` events
  - Transcript: `applyCoderTranscriptEvent()` merges `pendingApproval` on `tool-start`

### Non-write tools (`read_file`, `list_directory`, `search_files`, `run_project_command`)
- Compact icon rows with Live → Done badges (not unicode glyphs in boxes).

### Composer
- Send = up-arrow, Stop = square **in composer bar** (not stream toolbar).
- Model picker (Sonnet/Opus) bottom-left of composer.
- Cost footer above builder strip: tokens + est. cost for current run.

## Key files

| Area | Path |
|------|------|
| Transcript reducer | `src/shared/glassIdeCoderTranscript.ts` |
| Live preview (main) | `src/main/agentWriteToolPreview.ts` |
| Agent loop | `src/main/agentRunner.ts` |
| Stream UI | `src/renderer/overlay/GlassIdeStream.tsx` |
| Diff cards | `src/renderer/overlay/GlassIdeTranscriptToolCard.tsx` |
| Stream CSS | `src/renderer/overlay/GlassIdeStream.css` |
| Syntax | `src/shared/glassIdeSyntax.ts` |
| Markdown | `src/renderer/overlay/GlassResponsePanel.tsx` (`parseMarkdown` — render as **React**, never `dangerouslySetInnerHTML`) |
| Event wiring | `src/renderer/overlay/Overlay.tsx` |
| Live E2E | `tests/e2e/glass-ide-coder-live.spec.ts` |

## Known bugs to never reintroduce

| Bug | Fix |
|-----|-----|
| Transcript empty / only "Thinking…" | Dispatch `glass-agent-start` **before** `agentRun()`; match events via `agentCoderRunRef` fallback |
| `parseMarkdown` in `innerHTML` | Returns React nodes — render as `{parseMarkdown(text)}` |
| Relative paths fail writes | `resolveProjectPath()` in `agentCoderTools.ts` |
| macOS `/var/folders` blocked | `isSafePath()` allows `os.tmpdir()` |
| Aletheia auto-on during Coder | Skip `enableCompanionModeForAgent()` when `agentId === "coder"` |
| Diff appears only at tool-done | `pendingApproval` on `tool-start` from `buildWriteToolStartPreview` |

## Verification checklist (run all, twice)

```bash
cd desktop-glass

# 0. Build (E2E loads compiled out/ — not dev source)
npm run build

# 1. Typecheck
npm run typecheck

# 2. Unit tests (transcript + syntax + write preview)
node --import tsx --test \
  src/test/glassIdeCoderTranscript.test.ts \
  src/test/glassIdeStreamQuality.test.ts

# 3. Live E2E (needs ANTHROPIC_API_KEY in .env — single worker)
npx playwright test tests/e2e/glass-ide-coder-live.spec.ts --workers=1

# 4. Manual smoke
npm run glass:dev
```

### E2E must assert
- `[data-testid="glass-ide-transcript-diff"]` visible
- Contains filename, `TypeScript`, `+1`, `GLASS_PROOF`
- `proof.ts` exists on disk with correct content
- `coderRunUsage` populated; companion not auto-enabled

### Manual smoke must show
1. Thinking pill → streaming text with caret
2. Diff card with red/green lines **while tool is running**
3. Read tools as compact rows
4. After run: Applied badge, Open button on diff card

## Honest remaining gaps vs Cursor (OK to document, not OK to hide)

- Edit preview fails silently if `old_string` not found in file (no diff until tool-done error)
- Not full Monaco-grade highlighting (tokenizer-based, not AST)
- No collapsible tool groups when many tools run in sequence
- `edit_file` preview requires disk read on tool-start (adds ~ms latency — acceptable)

## Success criteria

You are done when:
1. All verification commands pass **twice** with zero failures.
2. Live E2E creates `proof.ts` and shows diff card in transcript.
3. A manual `edit_file` run shows **red + green diff on tool-start** before apply completes.
4. Reasoning text renders markdown correctly (code fences, inline code).

If anything fails, fix and re-run the full checklist — do not report success on partial results.

---

## Forensic theater vision (north star)

Glass IDE is not “chat that edits code.” The stream pane is a **forensic theater of engineering**: every agent action should appear as evidence—files, diffs, commands, failures, recoveries, verification—not narration about intent.

### Maturity model

| Stage | What it looks like |
|-------|-------------------|
| 1. Chat with tools | Linear messages + generic status lines |
| 2. Chat with receipts | Tool pills, file names, terminal snippets |
| 3. Reviewable agent stream | Inline diff cards, command receipts, sticky touched-files summary |
| 4. Operational stream | Phases, verify/recover loops, aggregate run review, editor sync |
| 5. Best-in-class stage | Line-level editor sync, run-wide changeset intelligence, cost provenance |

**Current target:** solid stage 3 → stage 4.

### IA model (Evidence-first timeline)

Vertical order in the stream pane:

1. **Sticky run header** — goal, model, elapsed, stop, phase chip
2. **Sticky review shelf** — touched files, pending approvals, failed checks, Open next
3. **Main transcript** — muted reasoning, tool calls, diff previews, command receipts, verify cards
4. **Completion** — summary of what changed and what needs review

### North-star principles

- **Evidence over prose** — every meaningful claim backed by a visible artifact in-stream
- **Consequence earns prominence** — edits, commands, failures, approvals outrank reasoning text
- **Compress success, expand risk** — successful reads collapse; failures and approvals persist
- **Local control always visible** — stop, open, review never hidden during active work

### Named patterns (build vocabulary)

| Pattern | Use when |
|---------|----------|
| **Proof Card** | Write tools — path, language, +/−, hunks, pre-apply review |
| **Command Receipt** | `run_project_command` — exact command, cwd, duration, exit code, output tail |
| **Muted Thought / Loud Evidence** | Reasoning subdued; tools/diffs/verify carry stronger hierarchy |
| **Run Spine** | Phase chip: Inspect → Edit → Apply → Verify → Recover → Finish |
| **Review Shelf** | Sticky module: touched files, pending approvals, failed checks |

### Build sprints (stream UX)

| Sprint | Deliverable | Status |
|--------|-------------|--------|
| **A** | Review shelf + enriched run header (phase, model, elapsed, stop) | ✅ Shipped |
| **B** | Command receipts + verify/QA cards in main transcript | ✅ Shipped |
| **C** | Collapse engine (reads cluster, reasoning muted/collapsible) | ✅ Shipped |
| **D** | Completion card + trust ledger counters | ✅ Shipped |
| **E** | Editor hunk sync (hover diff → pulse editor lines) | ✅ Shipped |

### Key files (Sprint A + B)

| Area | Path |
|------|------|
| Review shelf model | `src/shared/glassIdeReviewShelf.ts` |
| Run header + phase | `src/shared/glassIdeRunHeader.ts`, `src/shared/glassIdeRunPhase.ts` |
| Review shelf UI | `src/renderer/overlay/GlassIdeReviewShelf.tsx` |
| Run header UI | `src/renderer/overlay/GlassIdeRunHeader.tsx` |
| Command receipt parsing | `src/shared/glassIdeCoderTranscript.ts` (`parseCommandToolResult`) |
| Command receipt emit | `src/main/agentRunner.ts` (`CoderCommandReceipt` on tool-done) |
| Verify cards | `src/renderer/overlay/GlassIdeTranscriptVerifyCard.tsx` |
| Collapse rules | `src/shared/glassIdeTranscriptCollapse.ts` |
| Inspect cluster UI | `src/renderer/overlay/GlassIdeTranscriptInspectCluster.tsx` |
| Collapsed reasoning UI | `src/renderer/overlay/GlassIdeTranscriptReasoning.tsx` |
| Run summary + ledger | `src/shared/glassIdeRunSummary.ts` |
| Trust ledger UI | `src/renderer/overlay/GlassIdeTrustLedger.tsx` |
| Completion card UI | `src/renderer/overlay/GlassIdeCompletionCard.tsx` |
| Hunk sync | `src/shared/glassIdeHunkSync.ts` |
| Stream integration | `src/renderer/overlay/GlassIdeStream.tsx` |

### Sprint A + B verification

```bash
cd desktop-glass

npm run typecheck

node --import tsx --test \
  src/test/glassIdeReviewShelf.test.ts \
  src/test/glassIdeCoderTranscript.test.ts \
  src/test/glassIdeStreamQuality.test.ts \
  src/test/glassIdeTranscriptCollapse.test.ts \
  src/test/glassIdeRunSummary.test.ts \
  src/test/glassIdeHunkSync.test.ts
```

Run the block **twice** before declaring done.

### Anti-patterns (never ship)

- Big “thinking” blocks with no file/tool evidence
- Hiding diffs behind nested clicks by default
- Auto-apply without visible pre-apply review state
- Verify/QA only in a footer disconnected from the live transcript
- Generic completion summaries that omit changed files or validation status
