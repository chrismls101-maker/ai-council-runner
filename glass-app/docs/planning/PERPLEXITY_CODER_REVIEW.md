# Perplexity Coder IDE Review — Reconciliation

**Date:** 2026-06-23  
**Scope:** Glass Coder + Glass IDE stream only (not full Glass product).

## Executive summary

Perplexity's verdict is directionally correct: **VERIFY/RECOVER are strong; EDIT/INSPECT are thinner than Cursor**. Several P0 items in the external review were already shipped in QA v1.8 before the review landed.

## Already shipped (do not re-build)

| Review item | Status | Key files |
|-------------|--------|-----------|
| Fix all / auto-fix wiring | Done | `GlassIdeQaActions.tsx`, `GlassIdeStream.tsx` |
| Structured failure parsing | Done | `glassQaStructuredParsers.ts`, `buildStructuredFixPrompt` |
| Selective re-run after fix | Done | `glassQaRecovery.ts`, `coderQaPipeline.ts` |
| Trust ledger QA counters | Done | `deriveGlassIdeTrustLedger`, run header `qaProgressLine` |
| Sticky QA notification | Done | `GlassQaModeNotification.tsx` (no auto-dismiss timer) |
| Honest skip copy | Done | `deriveQaCompletionLists`, `GlassIdeCompletionCard.tsx` |
| Preview smoke v2 | Done | `GlassIdePreview.tsx`, `buildPreviewFailures` |
| Run-wide changeset | Done (discoverability improved in Sprint 1) | `GlassIdeChangesetPanel.tsx` |

## Real gaps addressed in Sprint 1–2

| Gap | Sprint |
|-----|--------|
| Trust edits for this run UI | 1 |
| Rollback outside RECOVER | 1 |
| Changeset prominence | 1 |
| Inspect cluster depth | 1 |
| Editor hunk navigation | 1 |
| @-file composer mentions | 2 |
| Symbol-lite index | 2 |
| Terminal cwd continuity | 2 |
| QA polish (tests-first, risk QA, ship copy) | 2 |

## Locked product decisions

- **Ship state:** Practical — `Ready to ship` / `Known warnings` / `Blocked` / `Needs human judgment`
- **Approval:** Graduated — per-edit default; `trust_edits` for run; `delete_file` always manual
- **Auto-fix:** Off by default; session opt-in in QA actions
- **Fix scope:** Touched-files-only by default
- **QA Mode:** Opt-in; risk-triggered auto-enable after daily-driver sprint
- **Language:** QA branded JS/TS-first

## Out of scope

- VS Code fork / full LSP
- Git panel
- Per-hunk accept/reject (navigation only in Sprint 1)
- Cloud CI replacement
