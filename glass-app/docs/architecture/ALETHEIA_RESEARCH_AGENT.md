# Aletheia — Research Agent Design Intelligence
> Compiled from deep research into professional-grade AI research pipelines.
> Use this to inform what flows through every torrent column, what signals matter,
> and how Phase 5 delivery should be structured.

---

## HOW TO USE THIS DOCUMENT

Each section maps directly to a phase of the Signal Path prototype.
- **What the AI is actually doing** → what should appear in the LEFT column (raw process)
- **Signals that matter** → what should appear in the MIDDLE column (extraction/analysis)
- **What separates shallow from deep** → what the RIGHT column should show (reasoning/output)
- **What the user should see** → informs Phase 5 delivery design

---

## PHASE 1 — Search / Source Discovery

### What the AI is actually doing
A professional-grade agent doesn't treat the question as a single search query.
It first analyzes **intent** — what was literally asked, what is probably needed,
and what the underlying decision is.

Then it decomposes the question into a **directed acyclic graph (DAG) of atomic
sub-questions** — each independently answerable, with edges representing dependencies
(answer to sub-question A feeds into sub-question B).

Each sub-question gets:
- A retrieval strategy
- A priority score (1–10)
- Explicit **verification criteria** — conditions that define when the sub-question is answered

**Key stat:** Research fan-out (sub-searches per user question) more than doubled in
major AI systems between Q3 2025 and Q1 2026. A single question now spawns 6+
parallel sub-queries covering: market overview, use-case comparisons, pricing,
reviews, technical compatibility, and competitive positioning.

### Source triage (not a search — a strategic triage)
Sources are sorted into tiers before reading:
- **Core sources** (5–7): read fully
- **Supporting sources** (10–15): skimmed for specific claims
- **Reference sources**: held for citation verification only

Shallow agents read URL snippets and call it research.
Deep agents treat snippets as a filter only — actual content is fetched via HTTP
to get the full page body.

### Source credibility signals (evaluated simultaneously)
- Institutional authority — is the publisher a recognized institution?
- Consistency with high-confidence knowledge — agrees with independently verified facts?
- Authorship traceability — named expert or organization accountable?
- Freshness signals — publication/update dates vs. query time-sensitivity
- Cross-source reinforcement — cited by other trusted sources?

**Platform weights (reference):** Stack Overflow 0.90, GitHub Discussions 0.85,
Hacker News 0.85, Reddit 0.70 — multiplied by post-level engagement.

### Shallow vs. deep
- Shallow: searches once per topic, verbatim query
- Deep: 4–10 strategically different query formulations including synonyms,
  negations ("what are the known failure modes of X"), and domain-specific framings.
  Uses **multi-hop retrieval** — first search reveals new entities that trigger
  second-order searches, which reveal third-order dependencies.

### What the user should see (torrent signals)
- The research plan — list of sub-questions being investigated (not just a spinner)
- Query branching — which sub-questions run in parallel vs. sequentially
- Scope declaration — the agent's interpretation of the question
- Sources being evaluated — URLs checked, not just final citations
- Tier classification — fully read vs. skimmed vs. held in reserve
- Credibility signals — institutional affiliation, publish date, cross-citation count
- Coverage map — which sub-questions have sufficient sourcing vs. still open

---

## PHASE 2 — Reading & Extraction

### What the AI is actually doing
The agent doesn't read sources sequentially. It runs **targeted extraction**:
for each source, it asks specific sub-questions rather than summarizing the whole document.
The same source may be queried multiple times for different sub-questions.

**Parallel extraction operations:**
1. **Claim identification** — isolating specific factual claims, confidence indicators, and authors
2. **Evidence typing** — distinguishing primary data, secondary synthesis, opinion, speculation
3. **Temporal tagging** — when each claim was made (time-sensitivity varies widely)
4. **Counter-signal detection** — actively flagging passages that contradict earlier sources

A `think` tool (used in systems like NVIDIA's Deep Researcher) lets the agent record
internal reasoning at each extraction step without taking external action — creating a
private reasoning trail that becomes part of the audit log.

### Knowledge gap detection
Two types:
- **Explicit gaps** — direct statements that something is unknown
- **Implicit gaps** — context-inferred absence of evidence

The agent tracks *what it didn't find*, not just what it did.
Verification criteria set per sub-question upfront — a sub-question is not marked
"answered" until those criteria are met, even if the text sounds plausible.

### Shallow vs. deep
- Shallow: extracts top 3 paragraphs and moves on
- Deep: sets verification criteria per sub-question, refuses to mark answered until
  criteria are met, tracks both explicit and implicit knowledge gaps

### What the user should see (torrent signals)
- Live extraction feed — claims being pulled from which sources, in real time
- Evidence type labels — primary data, synthesis, or opinion
- Counter-signal flags — when a finding conflicts with an earlier finding
- Sub-question status — "answered" / "partially answered" / "gap detected" / "conflicting signals"

---

## PHASE 3 — Synthesis (Draft)

### What the AI is actually doing
After extraction, the agent holds working memory of hundreds of individual claims,
each tagged with source, confidence level, and timestamp.

**Four simultaneous synthesis operations:**
1. **Deduplication** — removes redundant claims while preserving source diversity
   (five sources saying the same thing is itself a signal — it's not wasted)
2. **Conflict detection** — contradicting claims are flagged and routed to resolution
3. **Coherence testing** — the emerging synthesis is tested for internal logical consistency
4. **Gap filling or acknowledgment** — remaining gaps are either addressed with another
   search loop or explicitly declared as open questions

### Contradiction resolution
Works like an arbitration layer:
- Claims from conflicting sources are compared for logical coherence and reliability
- Deprioritized outputs: weakly supported OR logically inconsistent with majority evidence
- Some frameworks use a **Consistency Risk Score (CRS)** — probability that two outputs
  from the same system, on the same topic, contradict each other semantically

### The verify-replan loop
Dynamic agents use a **Plan → Execute → Verify → Replan** loop:
- After synthesis, a verifier checks if the draft answer is complete
- If not, new sub-questions are generated and the research loop continues
- Loop runs until explicit **stop conditions** are met (quality vs. compute cost)

### Shallow vs. deep
- Shallow: assembles narrative from extracted text, resolves conflicts by picking
  the most recent or most prominent source
- Deep: maintains a **structured evidence weight matrix** tracking which claims have
  multiple independent sources vs. single-source vs. contradicted.
  Single-source, unvalidated claims are marked as unverified even in the final output.

### What the user should see (torrent signals)
- Synthesis confidence per claim — how many independent sources support each major finding
- Active contradictions — unresolved conflicts the user may want to investigate
- Loop count — how many verify-replan iterations ran before the agent was satisfied
- Gap register — explicit knowledge gaps that couldn't be filled, with reason why

---

## PHASE 4 — Verification

### What the AI is actually doing
Verification is a **post-processing pipeline** that runs after the draft is written,
separate from synthesis. A dedicated verifier subagent receives the draft and the
full research file, then runs in sequence:

1. **Anchors every factual claim** to a source citation
2. **Fetches each source URL** — confirms it still resolves and actually contains the claimed content
3. **Removes unsourced claims** — if a factual claim can't be traced to any source,
   it's either re-sourced or deleted
4. **Builds a closed citation map** — every inline citation maps to a source list entry,
   every source is cited at least once (no orphan citations, no orphan sources)

### Citation integrity stats (industry benchmarks)
- Hallucinated reference rates: as high as 21% in baseline systems
- Score verification passing rate: as low as 42% in baseline systems
- Method-code alignment: 20–80% range across systems
- Best systems: zero hallucinated references, achieved by building evidence chains
  *by construction* throughout the research process — not just checking at the end

### Shallow vs. deep
- Shallow: citations generated alongside text generation in one pass —
  the model produces a sentence and a plausible-looking citation together,
  with no independent check that the citation is real or supports the claim
- Deep: **zero-assumption protocol** — every reference verified against external
  databases independently, nothing passes unless it resolves

### What the user should see (torrent signals)
- Verification status per citation — verified / mismatched / dead link / not found
- Removed claims log — what was in the draft but cut because it couldn't be sourced
- Source coverage — percentage of claims with verified citations vs. hedged/unverified
- Hallucination risk flags — claims that passed synthesis but couldn't be fully verified

---

## PHASE 5 — Delivery

### What a professional-grade delivery actually packages
Three distinct layers (per Anthropic's research on agent visibility):

1. **The answer** — structured to fit the consumer's decision context
2. **The audit trail** — log of agent activity: what was searched, retrieved, rejected,
   what contradictions were found and how they were resolved
3. **The uncertainty register** — explicit confidence calibration for each major claim

### The trust problem with polished output
"Fluent output can create false confidence" — a system may sound more certain than the
evidence justifies, presenting weak analysis in a confident tone.

Three categories of measures that enable user oversight:
- **Agent identifiers** — what exactly ran
- **Real-time monitoring** — what happened at each step
- **Activity logging** — persistent, auditable record of the session

### The test for serious vs. shallow delivery
Can you trace any claim in the output backward, step by step, to the raw source?
If yes → serious pipeline.
If the answer is "it just appeared in the text" → shallow, regardless of how confident it sounds.

### What separates the delivery formats (from Perplexity research on presentation)

| Format | Best For | Primary User Need |
|--------|----------|-------------------|
| Decision Brief | Irreversible, time-sensitive decisions | "Tell me what to do" |
| Options Scorecard | Multi-path, trade-off heavy choices | "Show me the choices" |
| Progressive Disclosure | Variable depth, mixed audience | "Let me go deeper if I want" |
| Confidence Differentiation | High-stakes, verify before acting | "Tell me what to trust" |
| Claim-Anchored Source Map | Accountable, cite-able output | "Show me where this came from" |
| Reasoning Trail | Auditable, defensible decisions | "Show me how you got there" |
| Structured Transformation | Workflow-embedded output | "Give it to me in the shape I need" |

**Key insight:** The most powerful implementations combine at least two.
Recommended combination for Aletheia:
**Decision Brief + Options Scorecard + Confidence Differentiation**

---

## THE FULL PIPELINE AT A GLANCE

| Stage | Core Operation | Shallow Tell | Deep Tell | User Signal |
|-------|----------------|--------------|-----------|-------------|
| Query Decomposition | Intent analysis + DAG of sub-questions | Single verbatim query | 6–10 atomic sub-questions with dependencies | Research plan shown upfront |
| Source Discovery | Tiered triage across heterogeneous sources | Snippet summaries cited directly | Full-page HTTP fetches, credibility scoring | URL log with tier labels |
| Reading & Extraction | Targeted claim extraction per sub-question | Top paragraphs summarized | Verification criteria set per claim; gaps detected | Live extraction feed + gap register |
| Synthesis | Dedup + conflict detection + coherence test | Most prominent source wins | Evidence weight matrix + verify-replan loop | Conflict log + loop count |
| Verification | Citation anchoring + URL fetch + orphan removal | Citations generated inline with text | Zero-assumption protocol against external DBs | Per-citation verification status |
| Delivery | Answer + audit trail + uncertainty register | Polished report, no process visibility | Full provenance chain per claim | Traceable claim-to-source drill-down |

---

## DESIGN PRINCIPLES FOR THE TORRENT DISPLAY

Based on everything above, here is what should flow through each column at every phase:

### LEFT column (raw process)
Shows what the system is *doing*: URLs being fetched, sources being read,
claims being extracted, citations being verified. The operational feed.

### MIDDLE column (analysis layer)
Shows what the system is *finding*: claim types, evidence labels, credibility scores,
contradiction flags, sub-question status. The analytical layer.

### RIGHT column (reasoning/synthesis)
Shows what the system is *concluding*: synthesis confidence, loop counts,
gap register, contradiction resolutions, final confidence calibration.
The intelligence layer.

---

*All four intelligence responses compiled above. Production design responses below.*

---

## RESPONSE 5 — Multi-Stream Real-Time UI Design

### The Fundamental Design Problem
The human eye can only focus on one thing at a time, but the interface must simultaneously communicate the state of multiple streams. The resolution — the same in Bloomberg, NOC dashboards, and Palantir Gotham:

**Design for peripheral vision, not foveal attention.**

Panels you're not reading should communicate "normal" through texture and color. A change in that texture draws the eye without requiring conscious monitoring. Professional tools are designed for humans under cognitive load running on little sleep making high-stakes decisions. Every design choice flows from that constraint.

---

### Layout: The Architecture of Attention

**F-Pattern with a Status Spine:**
- Top of screen: most time-critical global state — one glance tells you whether everything is normal
- Left column: navigation and persistent context
- Central panels: the live streams
- Right gutter (if used): detail and drill-down — requires *intent* to read, not reflexive attention

**Palantir Foundry layout principle:** Lighter-colored containers signal higher importance; darker backgrounds signal secondary content. Counterintuitive to consumer product designers, but functionally correct — you read toward the light.

**The NOC rule for panel count:** Never more than 10 visible components on a single view. When everything is highlighted, nothing stands out. A developer dashboard has 15–20 widgets because it was built by someone who wanted to see everything. A professional tool has 6–8 because the operator can't act on everything simultaneously.

**For parallel streams specifically — what spatial relationships communicate:**
- Panels grouped **horizontally** → same analytical layer, read comparatively
- Panels stacked **vertically** → drill-down relationship, bottom explains top

**Stratified layout pattern (most powerful):** Most general, high-confidence signal at top. Progressively more specific, lower-confidence data below. User can read top-only and act, or read through all layers for depth. The layout itself encodes the information hierarchy.

---

### Color Systems: Semantic, Not Decorative

**Five-color status system (NOC standard):**
- Green — nominal, no action required
- Yellow — watch, may need attention
- Amber — degraded, action likely needed
- Red — critical, immediate action required
- Gray — offline, no data, unknown state

**The design contract: by default, everything is green.** The operator shouldn't read a single panel to know whether they need to act — the absence of non-green is itself the signal.

**Bloomberg color grammar (different from traffic-light):**
- Orange/amber — primary interactive and live data elements
- Bright blue — secondary data, labels, column headers
- White/light gray — body text and static values
- Green/red — price changes ONLY (reserved exclusively for directional moves)

**Critical rule: green and red are protected for their single semantic meaning.** Using red for decorative borders or hover states poisons the grammar and forces users to decode rather than read. A $10M tool never uses red decoratively. A $50K tool does it constantly.

**Dark background values that work:**
- Avoid pure black (`#000000`) — creates oppressive contrast, makes subtle distinctions harder
- Use dark navy/charcoal: `hsl(225, 15%, 10%)` as base
- Elevated card surfaces: `hsl(225, 12%, 14%)` — gives layering depth that allows complex layouts to breathe

**Rule:** Color-only encoding is always an accessibility failure. Encode directionality through at minimum two channels — color plus sign (+/-), arrow, or parenthetical. Professional tools do this automatically.

---

### Typography: The Most Under-Invested Layer

**Tabular numerals are non-negotiable.**

The single most visible difference between a professional data interface and an amateur one: whether numbers use tabular (fixed-width) figures or proportional figures.

In a live feed where values update constantly, proportional numerals cause **layout jitter** — the number field widens and narrows as digits change width (1 is narrower than 0 is narrower than 8). This creates a shimmering, unstable quality that reads as low-quality.

Fix: one CSS property — `font-variant-numeric: tabular-nums`

Every font used by Bloomberg, every Bloomberg imitator, and every serious fintech product enables this. Bloomberg's proprietary typeface (Bloomberg Prop Unicode N, designed by Matthew Carter) was specifically engineered for optimal tabular numeral rendering at dense column layouts.

Additional rules:
- Any updating number: `tabular-nums`
- Financial tables: add `slashed-zero` to prevent 0/O confusion
- Code and terminal output: actual monospace

**Typeface selection for dense interfaces (non-proprietary):**
- **Inter** — geometric sans-serif, excellent tabular numeral support, free
- **DM Sans** — geometric precision, wide counters, clean column alignment
- **Source Sans 3** — most complete numeral feature set of any free font
- **Fira Code** — where you need actual monospace for IDs, timestamps, forensic strings

The font should **disappear** — zero typographic friction means the data, not the font, is what the user sees.

---

### Information Density: The Tufte Threshold

**Maximize data-ink ratio:** The proportion of graphic ink that represents actual data. Erase everything that doesn't carry data. Non-data ink (grid lines, decorative elements) is either removed or made as faint as possible.

**Sparklines over full charts for streaming data.** A 200px-wide sparkline communicates trend, direction, and relative magnitude at a glance without requiring axis interpretation. Full chart panels are reserved for the deep-drill layer.

**Whitespace as structure, not decoration:**
- Palantir's documented design system specifies 30–40% of screen as whitespace
- Whitespace *inside* panels: minimized (high data-ink ratio)
- Whitespace *between* panels: generous (clear structural separation between streams)

Developer dashboards do the opposite — cramped panels with decorative gradients inside, minimal separation between them.

---

### Motion: The Most Abused and Most Powerful Layer

**Core rule:** Every animation must answer — what changed, and how much?

An animation that plays the same way whether a value changed by 0.01% or 10% is not carrying information — it's decoration.

**Professional motion vocabulary:**
- **Value change** (counters, bars): 200–300ms, ease-in-out. Fast enough to not feel slow; slow enough to track direction
- **State transitions** (status changes): 150–250ms, subtle enough for peripheral detection without demanding foveal attention
- **New data entry** (new row in live feed): 300–500ms slide-in from logical origin direction, brief highlight pulse on entry
- **Critical alerts**: the only motion that breaks ambient calm — sustained pulse or color flash that *demands* foveal attention

**The Bloomberg approach to live updates (separate two signals):**
- The price changes instantly (no interpolation — accuracy over aesthetics)
- The background cell briefly flashes green/red, then fades to neutral over 500ms

These are separated because they serve different cognitive functions. The flash carries direction; the instant change carries accurate value.

**Motion must never:**
- Cause layout shifts — panels never resize or reflow in response to data updates
- Animate simultaneously across all streams — stagger by 50–100ms across panels
- Play looping ambient animations — creates adaptation fatigue within minutes

---

### The $10M vs. $50K Difference

| Decision | $50K tool | $10M tool |
|----------|-----------|-----------|
| Numeral rendering | Proportional figures, layout jitter | Tabular figures, stable columns |
| Color grammar | Red/green used decoratively | Red/green reserved exclusively for status |
| Alert model | Everything is red until fixed | Default green; red reserved for critical unacknowledged state |
| Panel count | 15–20 widgets, everything visible | 6–8 components, progressive disclosure for depth |
| Background | Pure black or white | Dark navy/charcoal; elevated surfaces for depth |
| Motion purpose | Decorative; plays same regardless of magnitude | Encodes direction and magnitude; staggered by stream |
| Whitespace | Minimal inside panels, none between | Dense inside panels, generous between |
| Update behavior | Price flashes; layout reflows | Price changes instantly; only cell background flashes |
| Design axis | What data can I show? | What decision does the operator need to make? |

**The real answer:** The $10M product was designed by someone who started with the operator's decision — and worked backward to determine which streams, at which density, with which update cadence, would minimize the time between a state change and the right person taking the right action. The $50K product was designed by someone who started with the data.

---

## RESPONSE 2 — Live Progress Display

### The Core Rule: Theatrical vs. Substantive
**Every visual element must carry information that would change if the work changed.**
A spinner conveys nothing. "Evaluating source 7 of 12 — resolving conflict with source 3" carries epistemic content.
Test: if the AI did worse work — read fewer sources, skipped verification, resolved contradictions arbitrarily — would this display element look different? If no, it's decoration.

| Signal | Theatrical | Substantive |
|--------|-----------|-------------|
| Progress bar 0–100% | yes — always looks the same | — |
| "Searching..." spinner | yes | — |
| Named source with domain + date + fetch status | — | yes |
| Conflict detection event with both source names | — | yes |
| Sub-question coverage map with open gaps marked | — | yes |
| Task queue with time-in-state per sub-task | — | yes |
| True chain-of-thought with reconsiderations visible | — | yes |
| Epistemic tag (KNOWN / INFERRED / GUESSED) per claim | — | yes |

---

### Pattern 1: Semantic Status Stream
Instead of generic "thinking..." — stream a live, human-readable log of exactly what the agent is doing at this precise moment. Named, specific, time-stamped.

**Shallow:** "Searching the web..."
**Deep:** "Reading source 7/12 — reuters.com/2026/04 — extracting claims on Fed rate posture — conflict detected with source 3"

The second version proves work is happening because the *content* is unique to this query at this moment. It couldn't be templated.

The U.S. National Laboratory's Querying Agent shows exact search strings at the bottom of the interface: "ENTITY FUZZY SEARCH: [exact string]" — live state diagram highlights which sub-stage the system is in, collapsible to high-level or hidden entirely.

---

### Pattern 2: Collapsible Chain-of-Thought with Epistemic Tags
The agent's internal reasoning displayed in a collapsible panel — not a polished summary, but raw steps showing what it actually reasoned through.

**Critical distinction:**
- OpenAI "Reason" feature: shows a *summarized* chain-of-thought — a clean, post-hoc narrative
- DeepSeek R1: streams *true* chain-of-thought in real time — including dead ends, reconsiderations, self-corrections

With summarized chain-of-thought, you cannot trace back to where the model went wrong.
With true chain-of-thought, you can.

**Pro pattern:** Tag each reasoning step with epistemic status:
- **KNOWN** — verified against multiple sources
- **INFERRED** — derived from evidence but not directly stated
- **GUESSED** — single source or low confidence

This makes uncertainty *structural* rather than buried in hedging language.

---

### Pattern 3: Task Queue with Live State Transitions
A persistent panel showing every sub-task with its status:
`pending → running → completed → verified` (or `failed → retrying`)

Each task transitions state visibly with a timestamp for time spent in each state.
"running: 38s" communicates something different than "running: 2s" — both different than "failed → retrying."

**From Palantir Gotham:** Colored icons *pulse* as new data arrives. Analysts can drag a timeline slider to watch entity links light up in sequence. The pulsing is not cosmetic — each pulse represents an actual new data event. Live map of information flow, not a static picture.

---

### Pattern 4: Source Provenance Visualization
As sources are retrieved and read, they appear in a live panel with:
- Domain
- Publish date
- Credibility tier
- Small excerpt of the claim being extracted
- Verification status that updates in real time

**From Bloomberg Terminal:** Four simultaneous panels, each analyzing different data in real time. Every data point traces back to its origin. Key principle: **every number has a provenance, and the provenance is one click away at all times.**

**From legal research (Westlaw/Lexis):** Verification state displayed *at the point of claim* — colored flags inline with cited documents showing whether that case is still good law, has been overruled, or is under challenge. The signal lives where the claim lives.

**Trust vs. theatre:** A source card should only appear when the agent actually fetched that URL's full content — not when it merely saw the snippet in a search result.

---

### Pattern 5: Conflict Detection Flags
When the agent finds a claim that contradicts something already in working memory, a visible conflict event fires in the activity stream — naming both sources, surfacing the contradiction for the user to see, not resolving silently.

**Why this matters:** A system that shows no contradictions is almost always either not looking hard enough or hiding them. Real research involves genuine conflicts.

Example of a trust signal (not a problem):
"Conflict detected: Reuters (2026-03) reports 4.5% rate; Goldman analyst note (2026-04) projects 3.75% — resolution: using more recent primary source"

**From trading terminals:** Professional FX dashboards display real-time correlation matrices. When two assets move in unexpected lockstep — or decouple — the matrix highlights the anomaly visually. When two trusted sources disagree, the conflict matrix should light up, not silently pick one.

---

### Pattern 6: Coverage Map / Knowledge Gap Register
Live visualization of the research plan: which sub-questions are answered, partially answered, and still open — updated in real time.

The user sees the shape of what's known vs. unknown *before the final answer is delivered*. Equivalent to a data pipeline's "completeness score" — which schema fields have values vs. which are NULL.

**From Palantir Gotham:** Common Operating Picture shows analysts not just what's known but visibly marks gaps — locations without sensor coverage, time windows with no signal activity, entity nodes with only one connecting edge. **Gaps are first-class UI elements, not afterthoughts.**

---

### Pattern 7: Epistemic-State Streaming Output
Three distinct visual states must be distinguished at all times:
1. **Model is reasoning** — internal synthesis, not yet output
2. **Model is using a tool** — fetching, reading, verifying
3. **Model is generating response** — producing final output

These are qualitatively different types of work. Conflating them in a single "thinking..." spinner destroys the user's ability to evaluate what the system is actually doing.

Claims stream incrementally with inline epistemic tags that reflect verification state *at that moment*. Claims that are later verified get upgraded visually. Claims that fail verification are flagged or struck.

**From Google Dataflow:** Monitoring interface shows one time-series line per pipeline step — immediately visible which step is the bottleneck, where data flows cleanly, where it's backing up. AI research equivalent: one "line" per sub-question, showing progress independently.

---

### Pattern 8: Live Whiteboard Entity Graph
For research involving multiple entities, relationships, or claims — a live graph view builds visibly in real time. Nodes appear as entities are extracted. Edges appear as relationships are confirmed. Colors update as claims are verified or contradicted.

**Palantir Gotham's signature pattern:** Intelligence analysts watch entity relationships light up as the system processes data. Critical design decision: **every dot and every edge is backed by auditable data, not opaque inference.** Click any edge — see the source that established it.

AI research equivalent: a live citation graph or claim relationship map — not just "here are some sources" but *how the claims relate to each other*, where they converge, and where they pull in opposite directions.

---

### Key Takeaway for Aletheia's Torrent Display
The torrent columns are already on the right track — they show named sources, specific claims, and conflict events. The upgrades that would make it substantive vs. theatrical:
- Credibility tier visible per source (not just domain name)
- Epistemic tag per claim (KNOWN / INFERRED / GUESSED)
- Sub-question coverage map — which of the research sub-questions are answered vs. open
- Conflict detection events named with both sources, not just "contradiction found"
- True chain-of-thought in the reasoning column, including dead ends and reconsiderations

## RESPONSE 6 — Glass UI & Premium Dark Interface Design

### The Master Principle
**Premium dark interfaces are designed to recede.**
The surfaces, the typography, the motion — all of it is calibrated to disappear,
leaving only the data and the user's attention on it.
Interfaces that feel cheap do the opposite: they assert themselves visually when they should be getting out of the way.

### Visual Reference: Glass Morphism Anatomy
The reference image shows the anatomy of a production-quality glass panel:

**What makes the glass read as premium (not cheap):**
- **The panel is not opaque.** You see through it to dimensional objects behind.
  The translucency is the depth signal — without something behind it, glass is just gray.
- **The background has physical objects, not a flat color.**
  3D metallic/chrome blobs behind the panel give the blur something to work with.
  Frosted glass blurring a flat `#111` background looks like a gray rectangle.
  Frosted glass blurring depth with light sources looks like glass.
- **Rounded corners are generous but not extreme.** ~12–16px radius.
  Too tight: looks like an old UI. Too large: looks like a toy card.
- **The border is a light edge, not a solid line.**
  `1px solid rgba(255,255,255,0.08–0.12)` — visible at the right viewing angle,
  disappears in dark areas. Mimics how real glass edges catch light.
- **There is no drop shadow in the traditional sense.**
  Premium glass uses a combination of inner highlight (top edge slightly lighter)
  and ambient shadow (diffuse, large radius, low opacity) rather than a hard drop shadow.
- **Text hierarchy is radically compressed.**
  The difference between heading and body is mostly weight and opacity, not size.
  Large size differences feel cheap. Subtle weight + opacity differences feel refined.
- **macOS traffic light buttons** are the only high-saturation color elements.
  Everything else is near-neutral. This is intentional — single pops of color
  in an otherwise monochromatic palette read as expensive.

### CSS Implementation (Production-Quality Glass)

```css
/* The glass panel itself */
.glass-panel {
  background: rgba(20, 20, 28, 0.55);        /* Dark but translucent */
  backdrop-filter: blur(24px) saturate(1.4); /* The blur + slight saturation boost */
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.09); /* Ghost edge */
  border-radius: 14px;
  box-shadow:
    0 0 0 0.5px rgba(255,255,255,0.04) inset, /* Inner top highlight */
    0 32px 64px rgba(0,0,0,0.45),              /* Ambient shadow */
    0 8px 24px rgba(0,0,0,0.3);                /* Close shadow */
}

/* The background that gives glass something to blur */
/* Needs depth: gradient + noise + ambient light sources */
.glass-backdrop {
  background:
    radial-gradient(ellipse at 20% 50%, rgba(96,165,250,0.08) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(168,85,247,0.06) 0%, transparent 50%),
    hsl(225, 15%, 8%);
}
```

### What Perplexity's Response Confirmed
The full response generated the reference image above as its primary output —
a working glass morphism mockup showing the correct depth, translucency, and
typography hierarchy. The key architectural rules:

1. **Glass needs depth behind it** — flat backdrops kill the effect entirely
2. **Blur radius sweet spot: 20–28px** — below 12px reads as frosted but thin; above 32px becomes opaque
3. **Saturation boost (1.2–1.5x)** on the blur makes colors behind the glass pop slightly — keeps it from feeling gray
4. **Background: never pure black.** `hsl(225,15%,8%)` — barely perceptible blue-black — gives ambient life
5. **Text on glass: never pure white.** `rgba(255,255,255,0.88)` max for headings; `rgba(255,255,255,0.45)` for secondary
6. **The panel recedes. The content leads.** If you notice the glass more than what's on it, the opacity is too low or the blur is too aggressive.

### For Aletheia / IIVO Glass
The existing prototype is already on the right track with the black background and blue accents.
The upgrade path to make it feel like a $10M product:
- Add ambient light sources behind the torrent columns (subtle radial gradients, not bright)
- Apply `backdrop-filter: blur()` to the zone header bars so they read as glass over the content below
- Compress the border between zones from a hard line to a `1px rgba(255,255,255,0.06)` ghost
- The Aletheia chip (top right) should be a glass pill — translucent background, ghost border, not a solid element
- Phase status text should be the most visible thing on screen, not competing with the chrome

---

## RESPONSE 3 — Contradiction & Confidence

### The Core Problem: Most Tools Collapse Uncertainty
Standard failure modes when conflicting information is found:
1. Silently pick the most recent or most prominent source
2. Average the claims into mush
3. Produce a hedge-filled paragraph that communicates nothing actionable

**The honest option — surfacing contradiction as a first-class finding — is almost never the default.**

If an AI's output shows no contradictions, no tensions, and perfect coherence across all sources, that's a **hallucination signal, not a quality signal.** Real sources conflict; real facts change over time. An AI that presents no friction is almost certainly fabricating a clean narrative.

---

### The Four Types of Contradiction (treat differently)

1. **Temporal conflicts** — Source A from 2023 says X, Source B from 2026 says Y.
   Resolution: usually mechanical — use more recent primary source, flag older number as stale.

2. **Methodological conflicts** — Two credible sources used different measurement approaches.
   Neither is wrong; the conflict is definitional. **Never silently resolve these.**

3. **Source authority conflicts** — Peer-reviewed study says X; industry whitepaper says Y.
   Resolution involves credibility weighting, not just recency.

4. **Genuine expert disagreement** — Multiple high-credibility sources, same methodology,
   similar dates, opposing conclusions. **Unresolvable. Must be presented as open question.**

Applying the same resolution logic to all four categories is the core design error.
Temporal conflicts should be auto-resolved with a timestamp flag.
Genuine expert disagreement should **never** be auto-resolved — escalate to user with both sides intact.

---

### How Contradictions Should Be Flagged: Inline at the Point of Claim

**Westlaw's KeyCite** is the gold standard — every case citation carries a colored flag *next to the citation itself*:
- Red flag — overturned, no longer valid
- Yellow flag — received negative treatment but not overruled; citable with caution
- Striped blue flag — currently under appeal; status is live and changing

**Critical design decision:** the flag lives at the *point of citation*, not in a separate "issues" panel. The attorney never has to remember to check — the validity signal is structurally impossible to miss.

AI research equivalent: every number, every finding, every date that has a conflicting source should carry a visual signal *at the point it appears in the output* — not in a footnote.

---

### Calibrated Confidence: The Intelligence Community Standard

**Words of Estimative Probability (WEP)** — developed by the U.S. Intelligence Community because verbal probabilities mean quantitatively different things without explicit mapping.

| Language | Approximate probability |
|----------|------------------------|
| Almost certain | ~93% (±6%) |
| Probable / Likely | ~75% (±12%) |
| Chances about even | ~50% (±10%) |
| Probably not / Unlikely | ~30% (±10%) |
| Almost certainly not | ~7% (±5%) |

**Key insight:** The community uses verbal probabilities, not percentages.
A bare number like "73%" carries false precision and no context.
"Probable" carries intuitive meaning calibrated through training.
Research found "probable" consistently reads as 65–75% likelihood across analysts,
while "possible" reads anywhere from 20–80% — making it close to useless.

**For AI research tools:** Use calibrated language with explicit ranges, not percentages.
"We assess with high confidence that X" is more trustworthy than "87% confident" —
because the latter implies a precision that no current AI can actually deliver.

---

### The Three-Axis Model (likelihood vs. confidence — not the same thing)

Mature intelligence analysis separates two axes AI tools routinely conflate:

1. **Likelihood** — how probable is the claim itself? (*probably, likely, almost certainly*)
2. **Confidence** — how good is the underlying evidence? (*high confidence, moderate confidence, low confidence*)

These are **independent.**
- High confidence in a low-probability claim: lots of solid evidence that something is unlikely
- Low confidence in a high-probability claim: limited evidence pointing toward something probable

A research tool that displays both axes gives users something actionable:
*"We assess with **moderate confidence** (limited sources) that the regulation will **likely** pass (consistent signals from 3 of 4 analyst reports reviewed)."*

---

### Visual Patterns That Work

**1. Color-coded inline signals (traffic light, mapped to conflict type — not severity)**
- Green — verified across 3+ independent sources
- Yellow — single source only, or temporal conflict detected
- Red — active contradiction with equally credible source
- Gray — unverifiable, no corroborating source found

**Critical rule:** avoid false precision. "99.73% confidence" is worse than "high confidence."
Show ranges, not points.

**2. Uncertainty bands, not point estimates**
"Q4 GDP growth: 2.1% — sources range 1.8% to 2.6%" communicates more than "2.1%" alone.
Bloomberg Terminal displays economic data with confidence intervals alongside point estimates.

**3. Contradiction cards**
When an unresolvable conflict is found, surface it as a distinct UI component:

> **Conflicting claims found:**
> — Reuters (Apr 2026): "Fed holds rates at 4.5% through Q3"
> — Goldman Sachs (May 2026): "Rate cut of 50bps expected in June"
> *Conflict type: Temporal + methodological. Both sources credible. Resolution requires user judgment.*

Gaps and conflicts are **first-class UI elements**, not footnotes.

**4. Epistemic status tags on every claim**
- **Verified** — corroborated by 3+ independent primary sources
- **Supported** — 1–2 sources, credible but not cross-validated
- **Inferred** — not directly stated; derived from evidence
- **Contested** — actively contradicted by another credible source
- **Outdated** — sourced from pre-[date] data; may have changed

---

### The Language Layer

**Say this:**
- "Sources conflict on this point. Two credible reports (2025, 2026) reach opposing conclusions."
- "We assess with moderate confidence — based on 2 sources — that X is probable."
- "This figure is from a 2023 report. More recent data may differ."
- "Expert consensus leans toward X, but a significant minority view holds Y."
- "This is an inference, not a directly stated finding."

**Never say this:**
- "X is the case." (no qualifier, no source — sounds authoritative, proves nothing)
- "It seems that X." (vague hedging, no information about confidence level)
- "X (87.3% confidence)" (false precision that misleads more than it informs)
- "Sources generally agree that X." (no conflict acknowledgment, no source count)
- Anything that smooths over a contradiction to create a cleaner narrative

**The anti-pattern: Fluent Certainty**
The most dangerous failure mode — language that sounds authoritative but has no confidence calibration beneath it. A system that says "The regulation will pass in Q3 2026" with no qualifier, no source count, and no competing view has communicated confidence that it doesn't have.

Westlaw addressed this with KeyCite flags.
Bloomberg addressed this with confidence intervals.
Most AI research tools have not addressed it at all.

---

### The Design Principle
Calibrated uncertainty is not a weakness to minimize — **it is the primary trust signal.**

A research tool that shows no contradictions, expresses no uncertainty, and delivers perfectly confident summaries is telling you it isn't looking hard enough. The tools that earn trust — Westlaw, Bloomberg, Palantir — are trusted precisely because they surface what they *don't* know with the same rigor as what they do.

The contradiction, the gap, the contested claim: that's where the real work is, and that's what the user needs to see.

## RESPONSE 7 — Tech Stack for Premium Real-Time Data Visualization

### The Rendering Decision Tree
Four rendering paths. Different performance ceilings and quality trade-offs.

| Technology | Safe element budget at 60fps | When to use |
|------------|------------------------------|-------------|
| SVG | ~1,500 | Small static charts, axis labels, UI chrome |
| Canvas 2D | ~10,000 | Medium-density streams, bar/line charts |
| WebGL | ~1,000,000+ (without text) | High-frequency tick data, particle systems, dense point clouds |
| WebGL + WASM | 10M+ datapoints in 25ms | Trading-grade real-time at any scale |

**WebGL's Achilles heel is text.** Bitmap-based text rendering in WebGL causes significant FPS drops. SciChart built a custom native text rendering engine inside their WebGL/WASM pipeline specifically to solve this. For a torrent-style display with lots of text lines, this is the critical constraint.

---

### What Professional Tools Actually Use

**Bloomberg Terminal:**
- UI shell: web-based React-like component system
- Chart rendering: proprietary GPU-accelerated Canvas (never SVG)
- Axes rendered as DOM text for accessibility
- Four-panel layout managed by a custom windowing system, not the browser layout engine

**Palantir:**
- UI shell: **Blueprint** (open-source React toolkit "optimized for complex, data-dense web interfaces for desktop applications") — npm installable
- Geospatial/graph visualization: **deck.gl** (WebGL-powered, maintained by Uber/Vis.gl) for map layers
- Entity relationship graphs: D3-based or proprietary WebGL
- Real-time map: "WebGL, updating in real time, running at 60fps in browser"

**Production Trading Terminal (documented stack):**
- Frontend: React + TypeScript
- Web Workers: handle ALL data stream processing (main thread reserved for rendering only)
- Data streams: RxJS for composing async streams; Socket.IO for WebSocket events
- State: TanStack Query for REST; RxJS for streams
- Charting: Canvas-based (TradingView Lightweight Charts or custom Canvas)
- Backend: NestJS orchestrating 100+ concurrent data jobs; Redis pub/sub + caching; TimescaleDB for time-series

---

### Chart Library Decision

**SciChart.js** — ceiling benchmark for web-based financial charting
- 10 million datapoints in ~25ms
- Written in C++, compiled to WebAssembly + WebGL
- Not a JavaScript library with WebGL — a native rendering engine wrapped with a JS API
- Text rendering solved at the engine level (implemented native text rendering in WASM because WebGL text was the primary bottleneck)
- Used in: medical visualization, Formula One telemetry, trading systems

**D3FC** — open-source path to WebGL charting via D3
- Moves scaling logic into GPU shaders — "40x faster than Canvas equivalent at same data scale"
- Renders 1M+ points
- Free, composable with D3's data model

**PixiJS** — right for anything that isn't a conventional chart
- Custom geometric primitives, animated entity graphs, particle systems, arbitrary WebGL effects
- Production-confirmed for candlestick charts and real-time stream displays
- The tool for the torrent visual — custom geometry, glow effects, animated lines

---

### For Maximum Render Quality: Native Path

**Tauri + Rust backend + WebGL frontend:**
- Uses OS native webview (WKWebView on macOS, WebView2 on Windows) — not bundled Chromium
- Bundle: ~5MB vs. Electron's ~100MB
- Memory: ~30MB vs. Electron's ~300MB
- Rust backend handles all data processing, serialization, stream management
- Frontend only receives pre-processed values ready for rendering
- Eliminates the single biggest performance threat: JavaScript garbage collection pauses on main thread

**egui (immediate mode Rust GUI, renders via OpenGL/wgpu):**
- Used in production by Rerun.io for "big complex visualizations"
- Being adopted by trading firms exploring Rust desktop UIs
- Redraws every frame regardless — same mental model as game engines
- No retained DOM, no virtual DOM, no event propagation
- Startup: ~116ms. Input lag: 1–2 frames
- Trade-off: no HTML, no CSS, no web component ecosystem — everything drawn manually

---

### Font Rendering for Monospace at Small Sizes

Core problem: at 11–13px, monospace fonts rendered in a browser with antialiasing look blurry. The fix is platform-specific:

- **Electron on macOS:** Full Chromium rendering with Core Text — crisp
- **Tauri on macOS:** WKWebView uses Core Text — indistinguishable from native app rendering
- **Tauri on Windows:** WebView2 may not honor ClearType — Electron may be preferable for critical monospace legibility at 11px

**CSS configuration for crisp monospace on dark backgrounds:**
```css
.monospace-data {
  font-family: "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace;
  font-variant-numeric: tabular-nums slashed-zero;
  -webkit-font-smoothing: antialiased; /* grayscale AA — sharper on dark bg */
  font-size: 12px;
  line-height: 1.4;
  letter-spacing: 0.02em;
}
```

`antialiased` is counterintuitively correct for dark backgrounds — uses grayscale antialiasing instead of subpixel. Subpixel fringing is more visible on dark surfaces. Bloomberg's terminal-style text uses this exact configuration.

---

### The 60fps Architecture Pattern

```
Main Thread (UI / Render ONLY)
  React + PixiJS/SciChart canvas panels
  No data processing. Only: receive → render.
         ↑
    postMessage (pre-formatted data)
         ↑
Web Workers — one per stream
  RxJS stream composition
  Data normalization, window management
  Debounce/throttle to display framerate (16ms / 60fps)
         ↑
    WebSocket / IPC
         ↑
Backend (Rust / Node)
  TimescaleDB / Redis pub-sub
  Stream normalization
```

**The rule:** Web Workers receive raw stream events, normalize them, and throttle output to 16ms intervals. The main thread never processes data — only receives formatted values and passes to renderer. This is what makes 60fps reliable even under high-frequency event bursts.

---

### Quality vs. Ease Trade-Off Map

| Decision | Easiest Path | Highest Render Quality |
|----------|-------------|----------------------|
| Charting | Chart.js / Recharts (SVG) | SciChart.js (WASM + WebGL) or custom PixiJS |
| Desktop shell | Electron | Tauri + Rust backend |
| Stream management | useState + useEffect | Web Workers + RxJS |
| Text rendering | Default browser AA | `antialiased` on dark + tabular-nums + Berkeley Mono |
| Animation | CSS transitions | Spring physics (Framer Motion / custom RAF loop) |
| Layout | CSS Grid | Custom panel compositor (Allotment or custom) |
| Data → Render path | Direct state update | Worker → postMessage → requestAnimationFrame |
| Native ceiling | Electron + JS | Tauri + egui (Rust full-native) |

**The hardest quality upgrade:** Moving from CSS-based charting to WebGL-based charting. Requires relearning how to think about drawing, replaces all familiar abstractions, forces explicit text rendering handling. But it's also the one that makes the largest visible difference — frame stability and render density of a WebGL chart vs. Canvas chart are immediately distinguishable to professional users.

### For Aletheia's Current Prototype → Production Path
**Prototype (now):** Canvas 2D + custom LiveLog renderer — correct foundation, right approach
**Production v1:** Electron + React + PixiJS for torrent columns + Web Workers for stream management
**Production v2 (premium):** Tauri + Rust backend + PixiJS/SciChart frontend + Berkeley Mono + `antialiased`
**Glass overlay:** CSS `backdrop-filter: blur(24px)` works in both Electron and Tauri/WKWebView — no rendering change needed for the glass effect itself

---

## RESPONSE 4 — Output Format for Complex Research

### The Design Problem Every Format Solves
The person who reads research and the person who acts on it need different things.
- The **reader** needs enough context to trust the conclusion
- The **actor** needs the conclusion first, before the context
- The **auditor** needs the full chain of evidence

One linear document can't serve all three — so the best formats layer them deliberately.

The second problem: **how to show trade-offs without collapsing into "on one hand, on the other hand" mush.** The answer, almost universally: commit to a recommendation while making the conditions under which you'd reverse it explicit.

---

### Format 1: BLUF + Pyramid (Military / Intelligence / McKinsey)
**Origin:** U.S. military intelligence reporting. CIA, DIA, NSA finished intelligence products. McKinsey's Pyramid Principle.

**Structure:**
- **B — Bottom Line Up Front** (1–2 sentences): The recommendation and its confidence level, stated as an action. Nothing else.
- **L — Logical Argument** (3–5 bullets): The independent reasons the bottom line is true. Each is a complete thought, not a heading.
- **U — Useful information** (expandable): The evidence tier — data, sources, analysis. Reached only if reader needs it.
- **F — Further reading** (optional): Background context, methodology, dissenting views.

**McKinsey Pyramid Principle refinement:** Every item at each level answers the question posed by the level above it. Sibling items are MECE — Mutually Exclusive, Collectively Exhaustive. No overlap, no gap.

**Why it works:** Busy decision-makers read the first sentence and stop if they agree. They read further only if they disagree or need to defend the conclusion to others. The structure respects this reading behavior rather than fighting it.

**Trade-off display:** Trade-offs live one level *down* from the recommendation — positioned under the case for X, not alongside it as equal-weight alternatives. Signals analyst judgment while preserving the reader's ability to locate and evaluate the counter-case.

---

### Format 2: NIE Key Judgments (Intelligence Community)
**Origin:** National Intelligence Estimate — highest-confidence U.S. Intelligence Community product, delivered to the President and NSC.

**Structure:**
- **Key Judgment 1:** Complete analytical conclusion with confidence level and estimative probability — "We assess with high confidence that..."
- **Key Judgment 2:** Second independent conclusion — "We judge it is likely that..."
- **[After Key Judgments]:** Full analysis with sourcing, dissenting views, methodology
- **[Separate volume]:** Supporting analysis — raw evidence, source quality ratings, data tables

**Critical design features:**
Every Key Judgment has **two** attached confidence markers — the **likelihood** of the claim AND the **confidence** in the evidence — expressed in standardized language (WEP vocabulary). Never percentages.

**Dissenting views are published in the document itself, attributed to the dissenting agency by name.** This is not a weakness — it's a trust signal. It tells the reader the majority assessment *survived challenge* from a credible dissenter, which is different from an assessment that was never challenged.

**What separates this from a summary:** A summary says "here is what we found." Key Judgments say "here is what we *assess to be true*, with this confidence, and here is where we disagree with ourselves."

---

### Format 3: Policy Option Memo (Harvard / DC Format)
**Origin:** Standard format for policy research memos at Harvard Kennedy School. Used in federal agencies, think tanks, and legislative staff work.

**Structure:**
```
BLUF (2 sentences) — bottom line + urgency signal
BACKGROUND (3–5 sentences max) — only facts the decision requires
ANALYSIS — the live causal claim: if X then Y because Z. Evidence + limitations.
OPTIONS (table)
  Option A: [name] | pros | cons | second-order effects
  Option B: [name] | pros | cons | second-order effects
RECOMMENDATION
  Option [X], because [reason].
  This recommendation would change if [explicit condition].
NEXT STEPS — who does what, by when
```

**Key design decision:** Options presented as a table, not prose paragraphs. Prose options create decision paralysis — the reader must hold multiple narratives in memory and compare them. A table forces the same criteria evaluated across all options simultaneously.

**The "what would change it" clause** is the most important line in the memo and the most often omitted. It converts a recommendation from an assertion into a conditional — which is what a recommendation actually is. More trustworthy and more actionable than a bare "Do X."

---

### Format 4: Amazon Six-Pager (Narrative Memo)
**Origin:** Jeff Bezos banned PowerPoint at Amazon executive meetings. Every major decision requires a written six-page narrative, read silently for 20–30 minutes before any discussion.

**Structure:**
1. Introduction — The problem, stated as a press release if it's a product
2. Goals — Specific, measurable. Not "improve experience" — "reduce abandonment from 18% to 9%"
3. Tenets — 3–4 principles governing decisions under this proposal (makes trade-offs legible)
4. State of the business — Current reality, with data. No spin.
5. Lessons learned — What was tried and why it did or didn't work
6. Strategic priorities / path forward — The recommendation with the full reasoning chain

**Why narrative instead of slides:** PowerPoint allows the *appearance* of reasoning without requiring it. Bullets hide logical connectives. Narrative forces: "satisfaction is down *because* cart abandonment increased *therefore* we should remove Step 3" — the reader can evaluate each link. Attendees read the full memo *before speaking*. Questions on page 2 are often answered on page 4.

---

### Format 5: RFC / ADR (Engineering / Product Strategy)
**Origin:** IETF Request for Comments process, adapted by Google, Facebook, Stripe, Uber for internal technical and product decisions.

**Structure:**
```
STATUS: Draft | Proposed | Accepted | Superseded
TL;DR (3 sentences)
CONTEXT AND PROBLEM STATEMENT — what is broken or newly possible
PROPOSAL — the specific change being recommended
ALTERNATIVES CONSIDERED
  Option A: [what it is] — why rejected: [specific reason]
  Option B: [what it is] — why rejected: [specific reason]
CONSEQUENCES — what this enables, forecloses, makes harder
REVISIT WHEN — the explicit trigger that would reopen this decision
```

**The defining feature:** Alternatives Considered is a *required section*. Alternatives shown with a specific, honest reason for rejection — "requires 6 months of migration work we can't absorb in Q3" is legitimate. "Less good" is not.

**Revisit When clause:** Converts a decision from permanent to *conditionally durable* — more honest and useful because it tells future readers exactly when the decision is no longer valid.

**Why it works for complex research:** Assumes the reader wants to *audit the decision*, not just receive it. A promise: we looked at other paths, and we can show you why we didn't take them.

---

### Format 6: SCQA (McKinsey / Consulting Opening)
**Origin:** Barbara Minto's Pyramid Principle, operationalized by McKinsey. Used to open every client presentation that requires the reader to accept a conclusion they didn't already hold.

**Structure:**
- **Situation** — What is true now, that the reader already agrees with
- **Complication** — What has changed that creates tension with the Situation
- **Question** — The decision that follows from the tension
- **Answer** — The recommendation, stated as a governing thought

**Why it works:** Situation earns agreement before asking for anything. Complication establishes why status quo is not an option. Question focuses the document on a single decision. Answer tells the reader exactly what they're being asked to evaluate.

**Limitation:** SCQA doesn't natively surface options — it's a persuasion structure, not a decision structure. Best consulting documents use SCQA to open, drop into an Options table for analysis, then return to the SCQA Answer reinforced by evidence.

---

### The Winning Combination
**Most decision-grade outputs combine two formats:**
SCQA or BLUF as the *opening structure* to earn attention.
Options Memo or RFC as the *body structure* to surface trade-offs and earn trust.

The recommendation is stated **twice** — once at the top to orient, once at the end to close — with full evidence and alternatives between them.

That sandwich structure is simultaneously:
- Scannable for the executive who trusts you
- Auditable for the one who doesn't

| Format | Best Use Case | Shows Trade-offs? |
|--------|--------------|-------------------|
| BLUF + Pyramid | Time-critical, single recommendation | Buried in evidence layer |
| NIE Key Judgments | High-stakes, contested, multiple scenarios | Yes — with attributed dissents |
| Policy Option Memo | Policy, strategy, regulatory decisions | Yes — explicit options table |
| Amazon Six-Pager | Product, business unit, strategic decisions | Yes — through Tenets + State of Business |
| RFC / ADR | Technical and product decisions | Yes — Alternatives Considered required |
| SCQA | Any output needing narrative persuasion | No — opening structure only |

---

## RESPONSE 8 — What Makes a Data Product Look Like It Cost Millions

### The Foundational Premise
The gap between premium and well-executed isn't a single decision — it's a compounding of ~40 small decisions where the cheap version chose the first reasonable option and the premium version chose the *correct* one. Most differences are imperceptible in isolation. Collectively they create a gestalt users describe as "it just feels different" without being able to explain why.

---

### Rendering Stability: The First Visible Signal

**Zero Cumulative Layout Shift (CLS)**
The most immediately legible sign of a cheap data product: content that shifts as it loads. A number column that widens when real data replaces a skeleton, a chart that reflows when legend loads, a panel that jumps height when an API call completes — these communicate "amateur" before the user has consciously registered anything.

Premium products maintain CLS ≤ 0.1 by **reserving exact dimensions for every element before data arrives:**
- Skeleton shapes precisely the same height/width as real content
- Table rows with fixed `row-height` set in CSS before population
- Chart containers with `aspect-ratio` defined in layout

The loaded state doesn't *replace* the skeleton — it *fills it in without moving anything.*

**Tabular numbers everywhere** — `font-variant-numeric: tabular-nums` + `slashed-zero` on any column where numbers update or vary in digit count. Single CSS property. The fact that most products omit it is purely oversight.

---

### Loading States: Signal, Not Decoration

**Skeletons must match reality exactly.**
A skeleton with 3 line-shapes followed by a loaded state with 7 items creates a visual jolt. Skeleton design is a data architecture problem, not a visual one — requires knowing the data structure before it arrives.

**When to use what:**
- Sub-400ms: inline spinner
- 400ms–10s with predictable layout: skeleton
- 10–30s: error state with explanation

A full-page spinner is never correct for a data product — it communicates "I don't know what's coming."

**Optimistic UI as default mental model:**
Every action that can reasonably succeed executes instantly in the UI and reconciles afterward.
Mental model: "Update UI immediately → send request in background → on failure, revert and explain."

The Vercel/Linear pattern: the UI responds in **0ms** — not 50ms, not on next animation frame — immediately on pointer-down. The request is in flight before the user has finished clicking. A product that waits for server confirmation before updating communicates latency on every interaction.

---

### Typography: Where 80% of the Premium Signal Lives

**Letter-spacing contract — applied to every type size:**
- Display / 48px+: `-3.0px` to `-4.0px`
- H1 / 32px: `-1.5px`
- H2 / 24px: `-0.8px`
- Labels / 12–14px: `-0.05px` to `-0.15px`
- Data values / 11–13px: `+0.02em` to `+0.04em` (slightly opened for legibility)

Most products apply letter-spacing to headings and ignore labels, small caps, and data fields — exactly where it's most visible in a dense data interface.

**Line heights as multiples of 4px** — aligned to a 4px baseline grid.
- Body 16px → 24px line-height (4×6)
- Heading 32px → 40px (4×10)

Invisible when correct. Mildly wrong-feeling when broken — tables feel "off," dense text panels feel cramped.

**Weight reduction in dark mode:**
Light text on dark backgrounds appears optically heavier due to irradiation. Compensate by reducing font-weight by 50–100 units:
- Light mode `font-weight: 600` → Dark mode `font-weight: 500`

One-line CSS change. Most products never make it.

---

### Spacing: The 4px Sub-Grid Under the 8px Grid

Primary scale: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`

The fact that `12` exists (not just 8 or 16) is the tell. Premium products use `12` for icon-label gaps, badge padding, and tight button padding because `16` is too loose and `8` is too tight — and they have token names for these values.

**The grouping rule — internal spacing ≤ external spacing:**
- Icon → label gap: `4–8px`
- Label → adjacent cell: `12–16px`
- Card group separation: `24–32px`

These three levels encode grouping logic spatially. Related elements are tight; distinct elements are spaced. This is the invisible grid that makes layouts feel "designed."

---

### Interaction Precision (Vercel's Published Guidelines)

- **Keyboard works everywhere** — all flows keyboard-operable, WAI-ARIA patterns
- **Deep-link everything** — filters, tabs, pagination, expanded panels addressable by URL
- **No dead zones** — if part of a control looks interactive, it is interactive
- **Hit targets ≥ 24px** even when visual target is smaller (mobile: ≥ 44px)
- **Scroll positions persist** — back/forward navigation restores prior scroll
- **Tooltip timing** — first tooltip has delay; subsequent siblings have zero delay (mousing across a toolbar reads instantly)
- **Focus rings only on keyboard focus** (`focus-visible`), not on mouse click — brand color at 2px with offset so it doesn't overlap the component border

Most products fail on at least 4 of these. Vercel documents them because they are the result of deliberate decisions, not defaults.

---

### Empty States: Wasted by Everyone Except the Best

| Tier | What they do |
|------|-------------|
| Cheap | Nothing — blank panel with a heading |
| Average | Illustration + "No data yet" text |
| Good | Illustration + message + CTA to add first item |
| Premium | One specific action, explains what will appear, uses it as product education |
| Linear-tier | Pre-fills with contextual sample data or guided path to first value |

**The deeper principle:** Show one action, not five. "You can create projects, invite team members, set up integrations, or import data" is four empty states masquerading as one. The right empty state shows the single next action that unlocks value — everything else appears after that action is taken.

The empty state is usually the first thing a new user sees. Most teams treat it as a residual state to handle later. Premium teams treat it as the product's first impression.

---

### Motion: What "Expensive Motion" Actually Means

**The choreography rule:**
Premium motion treats the whole screen as a stage, not a collection of independent elements. When a panel expands, adjacent panels contract — one coordinated movement, not two independent ones. When a table loads new rows, they enter from the direction they logically came from.

**The spring spec by interaction type:**
- Hover surface lift: `background-color 150ms ease-out` — nothing slower
- Panel expansion: `spring { stiffness: 250, damping: 25 }` — overshoots slightly, settles naturally
- Data value update: value changes instantly; background cell flashes green/red over `500ms ease-out`, returns to neutral
- Modal entrance: `opacity 0→1` + `translateY 8→0` over `300ms ease-out` (the 8px rise gives it gravitational presence)
- Scale on press: `scale: 0.97` on pointerdown, spring back to `1.0` on release (the "physical button" feel)

**Universal rule:** Exits are always faster than entrances. Things leave at `200ms`; things arrive at `300ms`. Objects accelerate away; they decelerate in.

**Never in premium motion:**
- Bouncing icons with no data payload
- Infinite looping ambient animations
- Element entrances that reflow the layout (always `transform`/`opacity`, never `height` or `margin`)
- Simultaneous animation of everything on screen (stagger by 40–80ms per element)

---

### The Engineering Decisions That Show

These are system decisions that produce the *feel* of design decisions:

**Fonts are preloaded.** `<link rel="preload" as="font">` on the primary typeface. No FOUT (Flash of Unstyled Text). Every time a font flashes in after load, it's a team that didn't preload their type.

**Tables have fixed column widths.** Numeric columns have explicit `width` set before data arrives. Content-derived widths cause layout shift on every data load — the single most common layout instability in data products.

**All animation uses `transform` and `opacity` only.** Any animation touching `height`, `width`, `top`, `left`, `margin`, or `padding` forces a layout recalculation every frame. Transform and opacity run on the compositor thread — they're free.

**Focus rings are branded, not default.** 2px offset ring in brand color, visible on keyboard focus only.

**Error states are contextual, not modal.** Never a full-page error for a partial data failure. Error appears inline, adjacent to the failed content, with a retry action. Rest of the interface remains functional.

---

### The Actual Pattern

Every premium product in this tier — Linear, Figma, Vercel, Palantir's Blueprint layer — has one organizational property in common: **the team had someone whose job it was to notice and fix the gap between "it works" and "it's correct."**

That role doesn't exist on most teams. The result: most products have 80% of decisions right and 20% at "first reasonable option." That 20% is what users feel without being able to articulate. The list above is that 20%.

---

## SYNTHESIS — What This Means for Aletheia

### Phase 5 Delivery Architecture (based on all four responses)

The Perplexity research points to a clear winner for Aletheia's Phase 5:

**SCQA opening → Key Judgments → Options Scorecard → Revisit When**

In practice, this means Phase 5 surfaces:

**1. The SCQA frame (2–3 seconds, already visible)**
The question at top is the Situation + implicit Complication. Aletheia's delivery starts from there.

**2. Key Judgments (3–5, each with two confidence markers)**
Not a summary — concrete analytical conclusions with:
- Likelihood: "We assess it is likely that..."
- Confidence: "...with moderate confidence (4 independent sources)"
- Epistemic tag: Verified / Supported / Inferred / Contested

**3. Options Scorecard (2–4 distinct paths)**
Each path in a card: name, 1-line description, timeline, risk level, confidence.
Not "here are things I found" — genuine distinct routes with trade-offs visible.
The recommendation card is marked, but the others are fully visible so the user can disagree.

**4. The "What Would Change This" clause**
One line. The condition under which the recommendation reverses. This is what makes it trustworthy rather than just confident.

**5. Contradiction register (surfaced, not buried)**
Any unresolved expert disagreements surface as Contradiction Cards — both sides visible, conflict type labeled, reason it can't be auto-resolved stated plainly.

**6. Audit trail (collapsed by default)**
Source count, loop count, claims verified vs. hedged, hallucination risk flags. Available — not forced.

### The Torrent Columns — What Should Actually Flow Through Them

Based on all four responses, here is the upgrade path for each column at each phase:

**LEFT (raw process):** Should show named, specific actions — not generic status.
"FETCH reuters.com/2026 — 312ms" not "searching..."
"CLAIM EXTRACTED: [text] — type: primary data" not "reading source"
"CITATION CHECK: doi:10.1234 — verified" not "verifying"

**MIDDLE (analysis layer):** Should show epistemic status per claim — not just the claim.
"claim: [text] | SUPPORTED (2 sources) | temporal: 2025"
"CONFLICT: source 3 vs. source 7 — type: methodological"
"sub-question 4: ANSWERED | sub-question 6: GAP DETECTED"

**RIGHT (reasoning/synthesis):** Should show the reasoning structure being built — not just conclusions.
"evidence weight: 5 sources converge on X | 1 outlier"
"contradiction: resolved via recency — source 7 (2026) > source 3 (2024)"
"confidence: MODERATE — single source for key income claim"
"loop 2 of 3: re-searching for corroboration on timeline claim"
