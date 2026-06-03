# IIVO Response Contracts v1 — QA Guide

## Layers

1. **Execution Mode** (user-facing) — Auto / Quick / Council. Gate runs **before** routing.
2. **Task Intent** — What the user wants done (asset, rewrite, decision, strategy, …).
3. **Route Lane** — How IIVO runs (`fast_direct`, `council_hidden`, `council_report`, `vision`, `research`).
4. **Response Contract** — Shape of the user-facing answer (`deliverable_first`, `rewrite_only`, …).
5. **Council Compression** — When council runs internally but the visible answer stays deliverable-first.

**Product law:** Quick is the default. Council is intentional escalation. Auto never silently sends simple prompts to Council.

## Examples

| Prompt | Intent | Lane | Contract | Route |
|--------|--------|------|----------|-------|
| Rewrite the hero… | rewrite_polish | fast_direct | rewrite_only | Direct Answer |
| Write a cold email to HVAC… | asset_generation | council_hidden | deliverable_first | Sales Attack |
| Should I build X or Y first? | decision | council_report | decision_first | Product Decision |
| How should I sell with cold email? | strategy | council_report | strategy_plan | Sales Attack |

## Daily Driver validation

- **wrong_route** — Route mismatch (e.g. Sales Attack for rewrite).
- **over_routed** — Fast-lane task sent to council.
- **contract_violation** / **wrong_output_format** — Answer opens with Final Action Plan / Decision Quality when user asked for a deliverable.
- **deliverable_not_first** — No email/copy/script in answer.
- **too_slow** — Fast-lane &gt;45s on council; simple direct &gt;20s noted.

## Trace (Cost & Trace panel)

Shows: **Execution Mode** (selected + effective + reason), Task intent, Response contract, Route lane, Target latency, Lane reason, Auto Router (internal).

## Commands

```bash
npm run test:execution-mode
npm run test:response-contracts
npm run test:routing
npm run test:daily-friction
npm run qa:daily -- --grep "@sales"
```
