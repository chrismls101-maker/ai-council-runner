# Glass IDE Stream — Reconciliation & Next Phase Plan

**Updated:** 2026-06-22  
**Research source:** Perplexity 2-week roadmap + Wireframes 1–3 (archived in [`GLASS_IDE_STREAM_RESEARCH.md`](GLASS_IDE_STREAM_RESEARCH.md))  
**Status snapshot:** [`GLASS_CODER_STATUS.md`](GLASS_CODER_STATUS.md)

---

## Executive summary

The Glass IDE stream is a **Cursor-style engineering ledger**, not a chat log. P0/P1 from the research sprint are **shipped**. Wireframe 3 v1 (active focus, changeset, live usage in focus card) is **shipped**.

**Maturity vs research:** Level **~4.5 / 5** (see maturity model below).

**Remaining:** manual QA on messy runs, optional panel deprecation, per-tool token attribution (backlog).

---

## Verification results (latest)

| Check | Status | Notes |
|-------|--------|-------|
| Stream unit tests | **34/34 pass** | + phase dividers, active focus, changeset |
| Live E2E `glass-ide-coder-live` | **2/2 pass** | `create_file` + `edit_file` |
| `npm run build` | pass | Required before E2E |
| `npm run typecheck` | pass | |

**Manual smoke still recommended:** command fail → recover, 20+ inspect collapse, approval-heavy multi-file run.

---

## Gap matrix — Must ship vs repo

| Research item | Status | Evidence |
|---------------|--------|----------|
| Inline pre-apply diff cards | **Done** | `buildWriteToolStartPreview`, `GlassIdeTranscriptToolCard`, E2E |
| Path + language + +/− + hunk + syntax | **Done** | `glassIdeSyntax.ts`, diff card |
| Apply / Skip on diff card | **Done** | `glass-ide-diff-approval` in `GlassIdeTranscriptToolCard` |
| Open file from card | **Done** | Open + Jump |
| Sticky run summary | **Done** | Unified `GlassIdeRunHeader` + file chips |
| Phase in header | **Done** | `glassIdeRunPhase.ts`, label **Complete** for finish |
| Phase dividers in stream | **Done** | `glassIdeTranscriptPhaseDividers.ts` |
| Touched / pending / failed counts | **Done** | Header stats + chips |
| Stop button | **Done** | Header + composer |
| Open next | **Done** | Header |
| Command receipts | **Done** | Receipt card UI |
| Retry / send-to-agent | **Done** | Failed receipt actions |
| Reasoning collapsed | **Done** | `GlassIdeTranscriptReasoning` |
| Inspect cluster collapse | **Done** | `glassIdeTranscriptCollapse.ts` |
| Expand compact diffs | **Done** | Expand/Collapse on applied cards |
| Completion card | **Done** | `GlassIdeCompletionCard` |
| Active focus card (WF3) | **Done** | `GlassIdeActiveFocusCard` |
| Unified changeset (WF3) | **Done** | `GlassIdeChangesetPanel` |
| Run usage in focus | **Done** | `coderRunUsage` on active focus card |
| Per-tool token cost | **Backlog** | Run-level only today |

---

## Current vertical stack (IDE mode)

```
GlassIdeRunHeader              RUN chrome (task, phase, stats, chips, stop)
GlassIdeActiveFocusCard        Wireframe 3 — pin what needs attention + usage
GlassIdeChangesetPanel         Expandable full changeset list
GlassIdeTrustLedger            Counters (hidden when file chips visible)
[gide-transcript scroll]
  — Inspect — | — Edit — | — Apply — | …   phase dividers
  clusters / reasoning / diff cards / receipts / verify / completion
GlassIdeStreamComposer
GlassIdeCostFooter
```

**Single UI:** Agents strip → Glass Coder → **Glass IDE** (`GlassIdeShell`). Legacy side panel removed.

---

## Maturity model

| Level | Description | Glass today |
|-------|-------------|-------------|
| 1 | Chat + tool labels | Past |
| 2 | Diff cards on tool-done only | Past |
| 3 | Live diffs, receipts, collapse rules | Past |
| 4 | Unified chrome, in-stream approval, command recovery | **Done** |
| 5 | Active focus, changeset, usage in stream chrome | **v1 done** |

---

## P2 — Backlog

- Per-**tool** token/cost attribution (needs richer `AgentEvent` usage fields)
- Reasoning reordered to bottom on run complete
- Wireframe 3 **touch map** heat (chips already serve this)
- Editor line pulse beyond hunk hover

---

## Definition of done (research)

| Question | Answer |
|----------|--------|
| What is the agent doing now? | **Yes** — phase in header + active focus card |
| What files changed? | **Yes** — chips + changeset + diff cards |
| Did it succeed? | **Yes** — completion card, verify, command retry/send-to-agent |
| What needs review next? | **Yes** — Apply/Skip on card, Open next, focus card for pending |

---

## Key files

| Area | Path |
|------|------|
| Stream layout | `src/renderer/overlay/GlassIdeStream.tsx` |
| Diff / command cards | `GlassIdeTranscriptToolCard.tsx` |
| Run chrome | `GlassIdeRunHeader.tsx`, `glassIdeRunHeader.ts` |
| Phase dividers | `glassIdeTranscriptPhaseDividers.ts` |
| Active focus | `glassIdeActiveFocus.ts`, `GlassIdeActiveFocusCard.tsx` |
| Changeset | `GlassIdeChangesetPanel.tsx` |
| Collapse | `glassIdeTranscriptCollapse.ts` |
| Tests | `src/test/glassIde*.test.ts`, `tests/e2e/glass-ide-coder-live.spec.ts` |
