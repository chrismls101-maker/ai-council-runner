# Glass Coder — Status (June 2026)

One-page snapshot of what exists and how to use it day-to-day.

---

## What Glass Coder is

A **project-scoped coding agent** inside Glass: reads your repo, proposes edits with unified diffs, runs commands, and applies changes only after you approve (unless you set `trust_edits`).

Distinct from **Code Analyst** (`code`) — read-only reports to `~/Desktop/IIVO Research`.

---

## How you open it (single UI)

**Agents strip → Glass Coder → Glass IDE**

1. Open the **Agents** panel on the builder strip.
2. Click **Glass Coder** — opens **Glass IDE** (`GlassIdeShell`).
3. Pick or confirm a project folder, then run from the IDE stream composer (or expand the card composer in Agents first).

Every Coder run sets `glassIdeActive` and opens the full IDE layout:

```
file tree | editor + terminal | AI stream + composer
```

There is **no separate side panel** anymore. The old `GlassCoderPanel` / `GlassCoderStream` path was removed.

**Entry points:**

| Action | What happens |
|--------|----------------|
| Click Glass Coder card | `glassIdeOpen()` + Agents panel closes |
| Run from Agents composer | `glassIdeOpen()` + `agentRun` |
| `openCoderWithPrompt` IPC | IDE opens with prefilled prompt |

---

## Stream stack (IDE)

```
GlassIdeRunHeader        task, phase, stats, file chips, stop
GlassIdeActiveFocusCard  pin: approval / failed command / verify + usage
GlassIdeChangesetPanel   expandable full file list
GlassIdeTrustLedger      activity counters (hidden when file chips show)
[gide-transcript scroll] phase dividers, diffs, receipts, verify, completion
GlassIdeStreamComposer
GlassIdeCostFooter       run total tokens + est. cost
```

---

## Maturity

**~4.5 / 5** on the research stream model — internal alpha, dogfood-ready on happy paths.

---

## Tests

```bash
cd desktop-glass
npm run typecheck
npm run build
node --import tsx --test src/test/glassIde*.test.ts
npx playwright test tests/e2e/glass-ide.spec.ts tests/e2e/glass-ide-coder-live.spec.ts --workers=1
```

---

## Still manual

- Messy runs: 20+ reads, multi-file approvals, fail → recover loops
- Per-**tool** token attribution (run-level usage only today)

See also: [`GLASS_IDE_STREAM_NEXT_PHASE.md`](GLASS_IDE_STREAM_NEXT_PHASE.md)
