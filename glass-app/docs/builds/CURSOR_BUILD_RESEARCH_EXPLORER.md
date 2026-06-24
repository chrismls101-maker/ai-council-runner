# CURSOR BUILD — Glass Research Explorer

> **Design principle (from Perplexity's founder):**
> "The interface is less about conversations and more about exploration — when the decision making is more subjective vibe space you don't need an objective answer engine."
>
> When you book a flight you use Google, not ChatGPT. Because you want to see the options. You want to explore. The interface is the insight.
>
> This is what we are building. Just like Glass Coder turns the overlay into an IDE when it runs, the Research Agent turns the overlay into a **Research Explorer** — a live, navigable, multi-angle exploration interface, not a single answer dump.

---

## What We Are Building

Three interconnected pieces:

1. **Research Agent system prompt** — multi-angle decomposition, source quality awareness, Aletheia narration hooks, structured output format
2. **Research Explorer UI** — when the Research Agent runs, the Glass overlay transforms into a research exploration panel (source cards, angle threads, live progress)
3. **Live narration** — Aletheia speaks as she searches, just like she narrates Glass Coder's build loop

---

## Part 1 — Research Agent System Prompt

**File:** `src/main/agents/definitions.ts`

Replace the `research` entry in `AGENT_SYSTEM_PROMPTS` with:

```typescript
research: `You are the Glass Research Agent running inside IIVO Glass, a macOS AI overlay. Your companion Aletheia speaks your narration lines aloud to the user in real time.

## Your job
Research the user's topic from multiple angles. Do not write one synthesized answer — surface distinct perspectives, findings, and threads so the user can explore. The user decides what to follow.

## Phase 1 — Plan (silent, no narration)
Before searching, decompose the topic into 3–4 research angles. Each angle is a distinct lens:
- The mainstream / consensus view
- A dissenting or contrarian view
- Data, numbers, or evidence angle
- A "what does this mean for me / practical implications" angle

Choose the angles that fit the topic. You do not need to narrate the plan — just execute it.

## Phase 2 — Search (narrate each angle)
For each angle:
1. Run 2–3 web_search calls targeting that specific angle
2. Extract the most credible, specific findings — quotes, numbers, names, dates
3. Assess source quality: prioritize primary sources, official data, named experts over SEO content
4. Discard vague or unsourced claims

Source quality signals (use these to filter):
- Strong: .gov, .edu, peer-reviewed, named expert with credentials, official company blog, primary data
- Medium: established news outlets, well-sourced long-form journalism
- Weak: listicles, anonymous SEO content, "AI-generated" summaries, undated pages

## Phase 3 — Synthesize and write
Write a structured markdown report using this exact format:

\`\`\`
## [Topic]

### Overview
2–3 sentence orientation. What is this about and why does it matter right now.

### Angle 1: [Angle name]
2–4 paragraphs. Specific findings, quotes, data points. Every factual claim inline-cited [1][2].

### Angle 2: [Angle name]
Same structure.

### Angle 3: [Angle name]
Same structure.

### Angle 4: [Angle name] (if warranted)
Same structure.

### What this means
2–3 sentences on practical implications or decision points for the user.

### Sources
Numbered list. [1] Title — domain.com — date if known
\`\`\`

Save using write_file with a descriptive kebab-case filename.

## Narration lines (Aletheia speaks these — keep them under 8 words)
The system will automatically narrate tool calls. In addition, emit these as write_file description fields or inline in your thinking for Aletheia to speak:
- When starting a new angle: captured in the search query itself (e.g. "Searching the contrarian angle…")
- When synthesis begins: your write_file description should be "Synthesizing findings across all angles."
- When done: "Research complete — check the panel."

## Rules
- Never fabricate sources. If you cannot find credible information on an angle, say so in that section.
- Every factual claim must be tied to a source you actually retrieved.
- Do not pad. A tight 600-word report from 4 strong sources is better than a 2,000-word report from weak ones.
- If the user's prompt is steerable ("go deeper on angle 2", "what about the regulatory side") — follow the redirect and continue from where you are. Do not restart.
- Do not say "As an AI" or mention Glass internals.`,
```

---

## Part 2 — Research Narration Strings

**File:** `src/shared/agentNarration.ts`

Add to the `narrateToolStart` switch, improving the `web_search` case and adding research-specific cues:

```typescript
case "web_search": {
  const query = String(input.query ?? input.search_query ?? input.q ?? "").trim();
  if (!query) return "Searching the web…";
  
  // Research-angle detection — give richer narration for research agent searches
  const lower = query.toLowerCase();
  if (lower.includes("contrarian") || lower.includes("against") || lower.includes("criticism"))
    return truncateNarration(`Looking at the other side…`);
  if (lower.includes("data") || lower.includes("statistics") || lower.includes("numbers"))
    return truncateNarration(`Looking for the numbers…`);
  if (lower.includes("implication") || lower.includes("practical") || lower.includes("what does"))
    return truncateNarration(`Looking at what this means…`);
  
  return truncateNarration(`Searching — ${query}`);
}
```

Also update `narrateAgentDone` to be research-aware:

```typescript
export function narrateAgentDone(agentId?: GlassAgentId): string {
  if (agentId === "research") return "Research complete — check the panel.";
  if (agentId === "writing") return "Done. Your document is saved.";
  if (agentId === "code") return "Analysis saved. Check the report.";
  return "Done. Check the answer panel.";
}
```

Update all callers of `narrateAgentDone()` to pass `agentId`:
- In `agentRunner.ts` line ~952: `emitNarrate(onEvent, runId, agentId, narrateAgentDone(agentId));`

---

## Part 3 — IPC State (Research Explorer mode)

**File:** `src/shared/ipc.ts`

### 3a — Add ResearchSource and ResearchAngle types

```typescript
export interface ResearchSource {
  id: string;           // unique, e.g. "src-1"
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  quality: "strong" | "medium" | "weak";
  angle?: string;       // which angle this source belongs to
  foundAt: number;      // timestamp — for live appearance ordering
}

export interface ResearchAngle {
  id: string;           // "angle-1", "angle-2" etc.
  label: string;        // "The contrarian view", "The data angle"
  status: "pending" | "searching" | "done";
  sourceCount: number;
}

export interface ResearchExplorerState {
  active: boolean;
  runId?: string;
  topic?: string;
  sources: ResearchSource[];
  angles: ResearchAngle[];
  currentAngle?: string;
  phase: "planning" | "searching" | "synthesizing" | "done" | "idle";
  reportPath?: string;
}
```

### 3b — Add to GlassState

```typescript
researchExplorer: ResearchExplorerState;
```

Initial value:
```typescript
researchExplorer: {
  active: false,
  sources: [],
  angles: [],
  phase: "idle",
},
```

### 3c — Add IPC commands

```typescript
| { type: "research-explorer-open" }
| { type: "research-explorer-close" }
```

### 3d — Add to preload exposure

In `src/preload/index.ts`, expose `researchExplorer` from glass state (already happens via `useGlassState` if it's in state).

---

## Part 4 — Main process: Research Explorer activation

**File:** `src/main/index.ts`

### 4a — Reset and activate on research agent start

In the `agentRun` handler, after `agentId === "coder"` block, add:

```typescript
if (agentId === "research") {
  state.researchExplorer = {
    active: true,
    runId,
    topic: prompt.slice(0, 120),
    sources: [],
    angles: [],
    phase: "planning",
  };
}
```

### 4b — Parse sources from tool results

In `relayAgentEvent`, handle `tool-done` for `web_search` to extract sources:

```typescript
if (ev.kind === "tool-done" && ev.toolName === "web_search" && ev.agentId === "research") {
  // toolResult is a string — parse out URLs and titles from the search results
  const result = typeof ev.toolResult === "string" ? ev.toolResult : "";
  const sources = parseResearchSources(result, state.researchExplorer.sources.length);
  if (sources.length > 0) {
    state.researchExplorer = {
      ...state.researchExplorer,
      sources: [...state.researchExplorer.sources, ...sources],
      phase: "searching",
    };
    shouldPush = true;
  }
}
```

### 4c — Detect synthesis phase

```typescript
if (ev.kind === "tool-start" && ev.toolName === "write_file" && ev.agentId === "research") {
  state.researchExplorer = { ...state.researchExplorer, phase: "synthesizing" };
  shouldPush = true;
}

if (ev.kind === "tool-done" && ev.toolName === "write_file" && ev.agentId === "research") {
  const result = typeof ev.toolResult === "string" ? ev.toolResult : "";
  state.researchExplorer = {
    ...state.researchExplorer,
    phase: "done",
    reportPath: result.trim() || undefined,
  };
  shouldPush = true;
}
```

### 4d — Clear on agent stop/cancel/error

```typescript
if ((ev.kind === "done" || ev.kind === "cancelled" || ev.kind === "error") && ev.agentId === "research") {
  state.researchExplorer = {
    ...state.researchExplorer,
    active: false,
    phase: ev.kind === "done" ? "done" : "idle",
  };
  shouldPush = true;
}
```

### 4e — parseResearchSources helper

Add in `index.ts` or a new `src/main/researchExplorerParse.ts`:

```typescript
function parseResearchSources(
  toolResult: string,
  existingCount: number,
): ResearchSource[] {
  // toolResult from web_search contains URLs and titles
  // Parse out [title](url) markdown links or bare URLs
  const sources: ResearchSource[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  const urlPattern = /https?:\/\/[^\s,)>"]+/g;

  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(toolResult)) !== null) {
    const [, title, url] = match;
    if (seen.has(url)) continue;
    seen.add(url);
    const domain = new URL(url).hostname.replace(/^www\./, "");
    sources.push({
      id: `src-${existingCount + sources.length + 1}`,
      title: title.slice(0, 100),
      url,
      domain,
      quality: sourceQuality(domain),
      foundAt: Date.now(),
    });
  }

  // Fallback: bare URLs if no markdown links found
  if (sources.length === 0) {
    while ((match = urlPattern.exec(toolResult)) !== null) {
      const url = match[0];
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        sources.push({
          id: `src-${existingCount + sources.length + 1}`,
          title: domain,
          url,
          domain,
          quality: sourceQuality(domain),
          foundAt: Date.now(),
        });
      } catch { /* invalid URL */ }
    }
  }

  return sources.slice(0, 8); // max 8 per search call
}

function sourceQuality(domain: string): ResearchSource["quality"] {
  if (/\.(gov|edu)$/.test(domain)) return "strong";
  const strongDomains = ["nature.com", "pubmed.ncbi.nlm.nih.gov", "scholar.google.com",
    "reuters.com", "apnews.com", "bbc.com", "nytimes.com", "wsj.com", "ft.com",
    "economist.com", "hbr.org", "mckinsey.com", "statista.com", "ourworldindata.org"];
  if (strongDomains.some(d => domain.includes(d))) return "strong";
  const weakSignals = ["listverse", "buzzfeed", "medium.com", "substack.com"];
  if (weakSignals.some(d => domain.includes(d))) return "weak";
  return "medium";
}
```

---

## Part 5 — Research Explorer UI

### Layout — full screen, edge to edge

The Research Explorer is **not a floating card**. When the Research Agent activates, it takes over the full overlay — edge to edge, top to bottom, sitting flush against the right edge of the builder strip. Same presence as Glass Coder's IDE view. The overlay background dims slightly and the Explorer fills the remaining screen space to the left of the strip.

**When the Response Panel opens** (user clicks "Open Report"):
- The Response Panel slides in from the right at its standard width
- The Research Explorer compresses its right edge to give the Response Panel its space — both remain visible simultaneously
- Explorer: sources and angles on the left. Response Panel: the full report on the right.
- When Response Panel is closed, Explorer expands back to full width.

**Persistence:**
- The Explorer stays open after research finishes. User can exit and come back — it is still there with all sources and angles intact.
- A **Start New** button in the header clears state and begins a new research session.

---

### Visual anatomy (top to bottom, left to right)

```
┌─────────────────────────────────────────────────────────────┐  ← top of screen
│ Research Explorer          [Planning|Searching|Done]  [New] [✕] │  ← header bar
├─────────────────────────────────────────────────────────────┤
│ Topic: "What's driving the shift to local AI models?"        │  ← topic line
├──────────────────────────────────────────────────────────────┤
│ [Mainstream ●]  [Contrarian ○]  [The Data ○]  [Practical ○] │  ← angle tabs
├──────────────────┬───────────────────────────────────────────┤
│ SOURCES (12)     │  [active angle content area]              │
│                  │                                           │
│ ● reuters.com    │  Aletheia is searching this angle...      │
│ ● nature.edu     │  (sources appear here as she finds them) │
│ ○ medium.com     │                                           │
│ ● ft.com         │                                           │
│ ...              │                                           │
│                  │                                           │
├──────────────────┴───────────────────────────────────────────┤
│ Aletheia · Searching the contrarian view…   [Redirect…    ] │  ← bottom strip
└─────────────────────────────────────────────────────────────┘  ← strip edge
```

**Header bar** — thin, dark. Label left. Phase chip center. New button + close X right.

**Topic line** — the user's research prompt, truncated to one line.

**Angle tabs** — horizontal row. One tab per angle (3–4). Each tab shows the angle label. Dot indicator: filled = active or done, empty = pending. Clicking a tab switches the content area to show that angle's sources. The active angle's tab has a subtle highlight.

**Left column — Sources** — all sources across all angles. Each card: quality dot (green/yellow/red), title (2-line clamp), domain. Clickable — opens URL in browser. Cards animate in as she finds them.

**Right content area** — shows sources specific to the selected angle tab, plus a brief status line for that angle ("3 sources found", "Searching…", "Done").

**Bottom strip** — one line: Aletheia's current narration on the left. Text input on the right — placeholder "Redirect research…" — user types here to steer mid-run. When done: **Open Report** button appears left of the input.

---

### What goes in the Response Panel vs the Explorer

| Content | Where |
|---------|-------|
| Full written report with all angles | Response Panel |
| Inline citations [1][2] in report text | Response Panel |
| Source cards (title, domain, quality) | Explorer |
| Angle tabs and per-angle source view | Explorer |
| Aletheia's live narration | Explorer bottom strip |
| Redirect / steer input | Explorer bottom strip |
| "Open Report" / "Start New" buttons | Explorer |

---

### 5a — New file: `src/renderer/research/ResearchExplorer.tsx`

```tsx
import { useState } from "react";
import { useGlassState, send } from "../useGlassState.ts";
import type { ResearchSource, ResearchAngle } from "../../shared/ipc.ts";

export function ResearchExplorer(): JSX.Element | null {
  const state = useGlassState();
  const re = state.researchExplorer;
  const [activeAngleId, setActiveAngleId] = useState<string | null>(null);
  const [redirectInput, setRedirectInput] = useState("");

  if (!re.active && re.phase === "idle") return null;

  const currentAngle = activeAngleId ?? re.currentAngle ?? re.angles[0]?.id ?? null;
  const sourcesForAngle = currentAngle
    ? re.sources.filter((s) => s.angle === currentAngle)
    : re.sources;

  const handleRedirect = (): void => {
    const text = redirectInput.trim();
    if (!text) return;
    // Send as a new companion transcript targeting the running research agent
    send({ type: "submit-command", text });
    setRedirectInput("");
  };

  return (
    <div
      className={`research-explorer${state.glassResponsePanelOpen ? " research-explorer--compressed" : ""}`}
      data-testid="glass-research-explorer"
    >
      {/* Header */}
      <div className="research-explorer__header">
        <span className="research-explorer__label">Research Explorer</span>
        <ResearchPhaseChip phase={re.phase} />
        <button
          className="research-explorer__action-btn"
          onClick={() => send({ type: "research-explorer-new" })}
          title="Start new research"
        >New</button>
        <button
          className="research-explorer__close"
          onClick={() => send({ type: "research-explorer-close" })}
          title="Close explorer"
        >✕</button>
      </div>

      {/* Topic */}
      {re.topic && (
        <div className="research-explorer__topic">{re.topic}</div>
      )}

      {/* Angle tabs */}
      {re.angles.length > 0 && (
        <div className="research-explorer__angles">
          {re.angles.map((angle) => (
            <AngleTab
              key={angle.id}
              angle={angle}
              active={currentAngle === angle.id}
              onClick={() => setActiveAngleId(angle.id)}
            />
          ))}
        </div>
      )}

      {/* Body: sources left, content right */}
      <div className="research-explorer__body">
        {/* All sources — left column */}
        <div className="research-explorer__sources-col">
          <p className="research-explorer__col-label">
            Sources <span className="research-explorer__count">{re.sources.length}</span>
          </p>
          {re.sources.length === 0 && (
            <p className="research-explorer__empty">
              {re.phase === "planning" ? "Planning angles…" : "Searching…"}
            </p>
          )}
          {re.sources.map((src) => (
            <SourceCard key={src.id} source={src} />
          ))}
        </div>

        {/* Active angle content — right */}
        <div className="research-explorer__content">
          {currentAngle && re.angles.length > 0 ? (
            <AngleContent
              angle={re.angles.find((a) => a.id === currentAngle) ?? re.angles[0]}
              sources={sourcesForAngle}
              phase={re.phase}
            />
          ) : (
            <p className="research-explorer__empty">
              {re.phase === "planning" ? "Decomposing your topic into research angles…" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Bottom strip */}
      <div className="research-explorer__footer">
        <span className="research-explorer__narration">
          {state.companionNarration ?? `Aletheia · ${re.phase === "done" ? "Complete" : "Researching"}`}
        </span>
        <div className="research-explorer__footer-actions">
          {re.phase === "done" && (
            <button
              className="research-explorer__action-btn research-explorer__action-btn--primary"
              onClick={() => send({ type: "research-explorer-open-report" })}
            >Open Report</button>
          )}
          <input
            className="research-explorer__redirect"
            placeholder="Redirect research…"
            value={redirectInput}
            onChange={(e) => setRedirectInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRedirect(); }}
          />
        </div>
      </div>
    </div>
  );
}

function AngleTab({ angle, active, onClick }: {
  angle: ResearchAngle;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      className={`research-angle-tab${active ? " research-angle-tab--active" : ""}`}
      onClick={onClick}
    >
      <span className={`research-angle-tab__dot research-angle-tab__dot--${angle.status}`} />
      <span className="research-angle-tab__label">{angle.label}</span>
      {angle.sourceCount > 0 && (
        <span className="research-angle-tab__count">{angle.sourceCount}</span>
      )}
    </button>
  );
}

function AngleContent({ angle, sources, phase }: {
  angle: ResearchAngle;
  sources: ResearchSource[];
  phase: string;
}): JSX.Element {
  return (
    <div className="research-angle-content">
      <p className="research-angle-content__label">{angle.label}</p>
      <p className="research-angle-content__status">
        {angle.status === "searching" ? "Searching…"
          : angle.status === "done" ? `${sources.length} source${sources.length !== 1 ? "s" : ""} found`
          : "Pending"}
      </p>
      <div className="research-angle-content__sources">
        {sources.map((src) => (
          <SourceCard key={src.id} source={src} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: ResearchSource }): JSX.Element {
  const qualityColor = {
    strong: "rgba(34, 197, 94, 0.85)",
    medium: "rgba(234, 179, 8, 0.85)",
    weak:   "rgba(239, 68, 68, 0.65)",
  }[source.quality];

  return (
    <a
      className="research-source-card"
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span
        className="research-source-card__quality"
        style={{ background: qualityColor }}
        title={`Source quality: ${source.quality}`}
      />
      <span className="research-source-card__title">{source.title}</span>
      <span className="research-source-card__domain">{source.domain}</span>
    </a>
  );
}

function ResearchPhaseChip({ phase }: { phase: string }): JSX.Element {
  const labels: Record<string, string> = {
    planning: "Planning", searching: "Searching",
    synthesizing: "Synthesizing", done: "Complete", idle: "",
  };
  return (
    <span className={`research-phase-chip research-phase-chip--${phase}`}>
      {labels[phase] ?? phase}
    </span>
  );
}
```

### 5b — CSS: `src/renderer/research/ResearchExplorer.css`

```css
/* ── Full-screen Research Explorer ─────────────────────────── */
.research-explorer {
  position: fixed;
  /* Sits flush against the right edge of the builder strip.
     Adjust right value to match strip width (typically 48–56px). */
  top: 0;
  left: 0;
  right: var(--glass-strip-width, 52px);
  bottom: 0;
  background: rgba(8, 8, 12, 0.96);
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 8000;
  pointer-events: auto;
  font-family: var(--font-sans, system-ui);
  transition: right 0.25s ease;
}

/* When Response Panel is open — compress to give it space */
.research-explorer--compressed {
  right: calc(var(--glass-strip-width, 52px) + var(--glass-response-panel-width, 420px));
}

/* ── Header ─────────────────────────────────────────────────── */
.research-explorer__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.research-explorer__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  flex: 1;
}

.research-explorer__action-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.research-explorer__action-btn:hover { background: rgba(255, 255, 255, 0.1); }
.research-explorer__action-btn--primary {
  background: rgba(96, 165, 250, 0.15);
  border-color: rgba(96, 165, 250, 0.35);
  color: rgba(96, 165, 250, 0.9);
}
.research-explorer__action-btn--primary:hover { background: rgba(96, 165, 250, 0.25); }

.research-explorer__close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  font-size: 15px;
  padding: 2px 6px;
  line-height: 1;
}
.research-explorer__close:hover { color: rgba(255, 255, 255, 0.6); }

/* ── Topic line ─────────────────────────────────────────────── */
.research-explorer__topic {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

/* ── Angle tabs ─────────────────────────────────────────────── */
.research-explorer__angles {
  display: flex;
  gap: 2px;
  padding: 8px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.research-angle-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}
.research-angle-tab:hover { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.65); }
.research-angle-tab--active {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
}

.research-angle-tab__dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}
.research-angle-tab__dot--searching { background: rgba(96, 165, 250, 0.9); }
.research-angle-tab__dot--done      { background: rgba(34, 197, 94, 0.85); }

.research-angle-tab__label { white-space: nowrap; }
.research-angle-tab__count {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.06);
  padding: 0 5px;
  border-radius: 999px;
}

/* ── Body: sources left + content right ─────────────────────── */
.research-explorer__body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.research-explorer__sources-col {
  width: 240px;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.research-explorer__col-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.25);
  margin-bottom: 6px;
}

.research-explorer__count { color: rgba(255, 255, 255, 0.45); margin-left: 4px; }

.research-explorer__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.research-explorer__empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.2);
  font-style: italic;
}

/* ── Angle content area ─────────────────────────────────────── */
.research-angle-content__label {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
}
.research-angle-content__status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
  margin-bottom: 14px;
}
.research-angle-content__sources { display: flex; flex-direction: column; gap: 7px; }

/* ── Source card ─────────────────────────────────────────────── */
.research-source-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.1s ease;
  position: relative;
}
.research-source-card:hover { background: rgba(255, 255, 255, 0.06); }

.research-source-card__quality {
  position: absolute;
  top: 9px; right: 9px;
  width: 6px; height: 6px;
  border-radius: 50%;
}

.research-source-card__title {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.35;
  padding-right: 16px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.research-source-card__domain {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.25);
}

/* ── Phase chip ─────────────────────────────────────────────── */
.research-phase-chip {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.35);
}
.research-phase-chip--planning    { color: rgba(251, 191, 36, 0.85); }
.research-phase-chip--searching   { color: rgba(96, 165, 250, 0.9); }
.research-phase-chip--synthesizing{ color: rgba(167, 139, 250, 0.9); }
.research-phase-chip--done        { color: rgba(34, 197, 94, 0.9); }

/* ── Footer strip ─────────────────────────────────────────────── */
.research-explorer__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.research-explorer__narration {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.research-explorer__footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.research-explorer__redirect {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  padding: 5px 10px;
  width: 180px;
  outline: none;
}
.research-explorer__redirect::placeholder { color: rgba(255, 255, 255, 0.2); }
.research-explorer__redirect:focus { border-color: rgba(255, 255, 255, 0.18); }
```

### 5c — Wire into Overlay

**File:** `src/renderer/overlay/Overlay.tsx`

```tsx
import { ResearchExplorer } from "../research/ResearchExplorer.tsx";

// In the main overlay return (full overlay path, not builder-strip-only):
<ResearchExplorer />
```

### 5d — New IPC commands to add to GlassCommand union

```typescript
| { type: "research-explorer-open" }
| { type: "research-explorer-close" }
| { type: "research-explorer-new" }
| { type: "research-explorer-open-report" }
```

Handle in `index.ts`:
- `research-explorer-close` — sets `researchExplorer.active = false`, push
- `research-explorer-new` — resets `researchExplorer` to idle state, push
- `research-explorer-open-report` — opens the saved report in the Glass Response Panel (same mechanism as agent done notification)

---

## Part 6 — Strip status for Research

**File:** `src/shared/glassCompanion.ts` or wherever `companionStatusLabel` is called.

Add a research-aware label when research is active:

```typescript
// In companionStatusLabel or wherever strip status is built:
if (state.researchExplorer?.active) {
  if (state.researchExplorer.phase === "searching") return "Aletheia · Researching";
  if (state.researchExplorer.phase === "synthesizing") return "Aletheia · Synthesizing";
}
```

---

## Part 7 — Companion toggle gates for research narration

**File:** `src/renderer/companion/GlassCompanionProvider.tsx`

Update the narration gate (same change as Code Analyst) to include `research`:

```typescript
if (!["coder", "code", "research"].includes(ev.agentId) && !companionActiveRef.current) return;
```

---

## Test cases

1. Run Research Agent with companion toggle OFF → Aletheia still narrates "Searching…" cues
2. Research Explorer panel appears when agent starts, source cards appear live as each search completes
3. Phase chip updates: Planning → Searching → Synthesizing → Complete
4. Quality dots: .gov/known-quality domains show green, unknown show yellow
5. Close button dismisses panel without stopping the agent
6. Report path shown when done
7. Panel clears on agent stop/cancel
8. Steerable: if user says "go deeper on the regulatory angle" mid-run, agent continues from that angle

---

## Files changed summary

| File | Change |
|------|--------|
| `src/main/agents/definitions.ts` | Research agent system prompt — multi-angle, structured output, source quality |
| `src/shared/agentNarration.ts` | Richer web_search narration, research-aware narrateAgentDone |
| `src/shared/ipc.ts` | ResearchSource, ResearchAngle, ResearchExplorerState types + GlassState field |
| `src/main/index.ts` | Activate/update/clear researchExplorer state on agent events |
| `src/renderer/research/ResearchExplorer.tsx` | New exploration UI component |
| `src/renderer/research/ResearchExplorer.css` | Styles |
| `src/renderer/overlay/Overlay.tsx` | Mount ResearchExplorer in overlay |
| `src/shared/glassCompanion.ts` | Research strip status labels |
| `src/renderer/companion/GlassCompanionProvider.tsx` | Allow research narration without companion toggle |

---

*Design reference: Perplexity's core insight — users who want discovery want to see the options, not just the answer. The interface is the product. Glass Research Explorer is that interface, ambient on your desktop, narrated by Aletheia.*
