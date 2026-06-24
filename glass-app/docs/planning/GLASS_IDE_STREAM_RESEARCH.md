# Glass IDE Stream — Perplexity Research Archive

Source: Perplexity research prompt + follow-ups #3 (roadmap) and #4 (wireframes).  
Archived for reconciliation with [`GLASS_IDE_STREAM_NEXT_PHASE.md`](GLASS_IDE_STREAM_NEXT_PHASE.md).

## Vision (research)

The stream pane should let a developer understand in ~2 seconds: what the agent is doing, what files changed, whether commands succeeded, and what needs review next. Evidence over narration. Progressive disclosure: collapse success, pin errors and approvals.

**Recommended wireframe:** Wireframe 1 (engineering ledger) first; Wireframe 3 (active focus card) as long-term ceiling.

## Must ship (2-week sprint)

| Item | Research requirement |
|------|---------------------|
| Diff cards | Pre-apply inline diffs: path, language, +/−, hunk preview, apply/skip/open |
| Sticky run summary | Phase, touched files, pending approvals, failed checks, stop |
| Phase model | Inspect → Edit → Apply → Verify → Recover → Complete |
| Command receipts | Command, cwd, elapsed, exit code, truncated output, retry |
| Reasoning | Collapsed by default, expandable full text |

## Stretch

- Grouped collapse for read/search/list
- Open next in run summary
- Failed-step pinning (errors stay expanded)

## Wireframe 1 layout (target IA)

```
RUN header (goal, phase, stop, counts, next review)
SUMMARY (files changed, checks)
FILES chips (created/edited/failed)
INSPECT section (collapsed reads)
EDIT section (diff cards)
VERIFY section (command receipt, expanded on error)
Reasoning summary (collapsed, bottom)
```

## Wireframe 2

Phase-bucketed: Inspect → Edit → Verify → Recover sections with status per phase.

## Wireframe 3

Active focus card (failing test pinned top) + touch map + event ledger below.

## Post-sprint backlog (research P1)

- Editor-synced diff highlight / scroll-to-hunk
- Run-wide unified changeset view
- Per-step cost/token attribution
- Richer verification artifact cards
- Failure clustering + replay timeline
