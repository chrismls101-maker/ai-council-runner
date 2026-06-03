# IIVO Daily Driver Simulation

Real-world scenario testing for **general AI usefulness** and **product feel** — not basic smoke tests.

## Standard

> Daily Driver QA should prove IIVO can help with real work, not just explain IIVO.

| Master QA | Daily Driver QA |
|-----------|-----------------|
| "What is IIVO?" parity | Founder, sales, support, marketing, ecommerce tasks |
| System qualification | Useful vs generic / worse-than-ChatGPT friction |
| Pass/fail gates | General vs IIVO-specific usefulness buckets |

Basic IIVO intro prompts belong in **`npm run qa:master`** only.

## Scenario mix

| Audience | Share (full catalog) | Default `qa:daily` |
|----------|----------------------|---------------------|
| **General** | ~80% (40+ scenarios) | 9 of 10 |
| **IIVO/product** | ~20% (≤10 scenarios) | 1 of 10 |

Categories include: founder, local business, sales, marketing, support, product, website, hiring, finance, ecommerce, creator, legal/policy, productivity, technical, competitive, vision, context, lens, memory, and IIVO product.

## Commands

| Command | Scenarios |
|---------|-----------|
| `npm run qa:daily` | **10 default** — broad real-world sample (mostly non-IIVO) |
| `npm run qa:daily:full` | All non-`liveOnly` scenarios (~55+) |
| `npm run qa:daily:live` | Full + live vision + outcome flows |
| `npm run qa:daily:watch` | Slower headed run with QA pacing |

### Filter by tag

```bash
npm run qa:daily -- --grep @founder
npm run qa:daily -- --grep @sales
npm run qa:daily -- --grep @support
npm run qa:daily -- --grep @memory
npm run qa:daily -- --grep @context
npm run qa:daily -- --grep @iivo
```

## Default 10 scenarios

1. `founder-saas-1500-14days` — lean SaaS validation ($1,500 / 14 days)  
2. `sales-hvac-cold-email` — cold email for HVAC missed-call pilot  
3. `marketing-jargon-hero` — rewrite jargon homepage hero  
4. `support-billing-access` — billing/access support response  
5. `product-priority-export` — CSV vs filters vs SMS priority  
6. `ecommerce-jewelry-conversion` — jewelry store conversion diagnosis  
7. `legal-privacy-promises` — privacy overclaims to avoid  
8. `context-meeting-notes-fixes` — Context Bridge on product meeting notes *(IIVO)*  
9. `vision-homepage-hierarchy` — screenshot handoff (no live vision in default)  
10. `memory-guard-ecommerce-shipping` — ecommerce support with no IIVO/Front Desk bleed  

## Execution Mode Gate (v1)

Before Auto Router picks a workflow, **Execution Mode** decides how aggressive routing can be:

| Mode | Behavior |
|------|----------|
| **Auto** (default) | Quick-first. Asks before Council or Builder when uncertain. |
| **Quick Mode** | One AI, Direct Answer. Rewrite, support, summary, one-off email. |
| **Council Mode** | Multi-agent Product Decision / Sales Attack for strategy and tradeoffs. |
| **Builder Mode** | Large canvas artifacts; confirms before opening workspace. |

**Daily Driver expectations (Auto selected):**

- Rewrite / support / legal / marketing → **Effective: Quick** → Direct Answer (under ~20s target).
- Founder / product decision → **Effective: Council** → Product Decision (under ~150s).
- One cold email → Quick or deliverable-first; **&gt;90s** → `too_slow`.
- Quick effective **&gt;30s** → `worse_than_chatgpt`; **&gt;45s** → major `too_slow`; **&gt;60s** → blocker.

Agent Mind should note: `Selected Mode: Auto. Effective Mode: Quick` (or Council + reason).

Composer UX: primary bar is **Mode** + **Configure** only; Auto Router details live under **Configure → Advanced routing**.

## Agent Mind panel

During `npm run qa:daily` or `npm run qa:daily:watch`, a floating **Agent Mind** section appears in the QA monitor overlay. It narrates what the automated tester is doing — plan, why the scenario matters, current action, observations, evaluation, and friction severity. This is public QA narration, not hidden model reasoning, and it uses **no extra AI calls**.

Transcripts:

- `test-results/iivo-daily-driver-summary.json` → `agentMindTranscript`
- `test-results/iivo-daily-driver-agent-mind.md` → readable markdown

**Watch mode** (`npm run qa:daily:watch`) is the best visual experience: slower pacing and a short pause after each scenario evaluation.

## Friction report

Written to: `test-results/iivo-daily-driver-summary.json`

### Usefulness buckets

- **General AI usefulness** — business advice, writing, support, marketing, prioritization, documents  
- **IIVO-specific usefulness** — Lens, Vision, Context Bridge, Memory Guard, Benchmark  

### Friction types

- `useful_answer` / `generic_answer` / `worse_than_chatgpt`
- `self_reference_bleed` — IIVO mentioned on unrelated general tasks
- `wrong_route` / `over_routed` / `context_ignored` / `memory_bleed`
- `too_slow` / `worse_than_chatgpt` / `skipped_live` / `technical_fail`

**Memory / outcome contamination** on general scenarios (neutral preset): forbidden unprompted signals include `Relevant Past Outcome`, AI Front Desk, AI receptionist, missed calls, missed-call recovery, SMS follow-up, delayed SMS, 0 pilots, pilot customers, plumbers, and HVAC. **Blocker** when contamination changes answer meaning (support, ecommerce, memory-guard defaults); **major** when incidental.

**Worse than ChatGPT/Claude** when: generic phrasing, no concrete next step, over-long rewrite, or unprompted IIVO/AI Front Desk bleed.

## Prerequisites

```bash
npm run dev
npm run qa:install
```

Neutral preset is forced before each scenario (no AI Front Desk default contamination).
