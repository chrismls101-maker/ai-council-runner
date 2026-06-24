# Glass Architecture — The Pyramid

> **This document is the source of truth for how Glass is organized.**
> Before adding any new feature, agent, or integration — find where it belongs in this pyramid first.
> If it does not fit cleanly into an existing tier, that is a signal to discuss the architecture before building.

---

## What Glass Is

Glass is a macOS AI overlay that lives on top of everything the user does. It is not an app you switch to. It is not a chatbot. It is an intelligence layer embedded in the user's workflow — watching, listening, researching, building, and speaking — without ever pulling them out of what they are doing.

The difference between Glass and every other AI tool:
- **Context**: Glass knows what is on your screen, what you are saying, what you are building
- **Continuity**: Glass does not reset between tasks. Memory, session history, and agent state persist
- **Chaining**: Glass agents can trigger each other. Research feeds Writing. Coder triggers Research. No manual hand-off
- **Presence**: Aletheia is always there, always narrating, always aware — not waiting to be opened

---

## The Pyramid

Six tiers. Each tier has a specific job. Higher tiers decide. Lower tiers execute. No tier should reach up past the one above it.

```
         ┌─────────────────────────────────────┐
  Tier 0 │         ORCHESTRATORS               │  ← Who decides what happens
         └─────────────────────────────────────┘
         ┌─────────────────────────────────────┐
  Tier 1 │     KNOWLEDGE & AWARENESS           │  ← Real-time intelligence feeds
         └─────────────────────────────────────┘
         ┌─────────────────────────────────────┐
  Tier 2 │         AGENT WORKERS               │  ← Execution — the doers
         └─────────────────────────────────────┘
         ┌─────────────────────────────────────┐
  Tier 3 │      SESSION INTELLIGENCE           │  ← Ambient, continuous, passive
         └─────────────────────────────────────┘
         ┌─────────────────────────────────────┐
  Tier 4 │         DELIVERY LAYER              │  ← How output reaches the user
         └─────────────────────────────────────┘
         ┌─────────────────────────────────────┐
  Tier 5 │         INFRASTRUCTURE              │  ← The plumbing
         └─────────────────────────────────────┘
```

---

## Tier 0 — Orchestrators

**Job:** Decide what the user needs, route the request to the right agent or knowledge feed, and coordinate the response. Orchestrators are the only tier that can talk directly to every tier below them.

### Aletheia
The intelligence and voice of Glass. Aletheia narrates every agent action, speaks findings aloud, and serves as the consistent identity the user interacts with regardless of which agent is running underneath. She is the face. Everything else is infrastructure.

- Lives in: `src/shared/agentNarration.ts`, `src/main/glassElevenLabsTts.ts`, `src/main/ideAletheiaAdvisory.ts`
- Speaks via: ElevenLabs TTS
- Status: **Live**

### IIVO Council (ai-council-runner)
Multi-model deliberation for complex decisions. When a single model is not enough, the Council runs a structured reasoning chain:

```
Strategy (GPT-4o) → Critic (Claude Sonnet) → Research (Perplexity Sonar) → Final Judge (GPT-4o)
```

Each model plays a different role. Strategy proposes. Critic challenges. Research grounds it in real-world evidence. Judge decides. The user gets the output of the whole chain, not just one model's opinion.

- Lives in: `ai-council-runner/`
- Status: **Live** — not yet connected to Glass agents (this is the next major wiring)

### Glass Context Engine ⚠ NEEDS WIRING
The missing piece at the top. The Context Engine is what decides, in real time, what the user needs — before they ask. It reads screen context (OmniParser), listens to audio (STT), watches agent state (Glass State Bus), and routes intent to the right orchestrator or agent automatically.

Without this, Glass is reactive. With it, Glass is proactive.

- Lives in: `src/shared/glassContextEngine.ts` (partial)
- Status: **Needs wiring** — exists as a concept, not fully connected

---

## Tier 1 — Knowledge & Awareness

**Job:** Provide real-time intelligence to anything above. Tier 1 does not decide — it feeds. Orchestrators and agents call into Tier 1 to get what they need. Nothing in Tier 1 initiates on its own.

### Perplexity Sonar Pro
Real-time web knowledge with citations. The research engine. Currently powers the Research Agent directly. The bigger vision: any agent or orchestrator can call Perplexity as a knowledge feed — Coder can ask it about an API, Writing can ask it for current facts, Council can use it for evidence in a deliberation.

- Model: `sonar-pro` with `search_context_size: "high"`
- Returns: Streaming text + citations array
- Lives in: `src/main/agentRunner.ts` (`runResearchWithPerplexity`)
- Status: **Live** (Research Agent), **Tier 1 integration pending** (not yet callable by other agents)

### OmniParser / Screen Context
Glass reads the user's screen. OmniParser identifies UI elements, text, and context from a live screenshot. This is what makes Glass context-aware — it knows you are reading a contract, looking at a competitor's website, or debugging a stack trace, without you saying a word.

- Lives in: `src/main/companionOmniParser.ts`, `src/main/glassScreenDigest.ts`, `src/main/screenContext.ts`
- Status: **Live** (Companion mode), **not yet triggering agents automatically**

### STT / Audio
Speech-to-text across multiple providers. Deepgram for high-accuracy streaming. OpenAI Whisper for fallback. Web Speech for lightweight use. Feeds voice input to any agent or to the Copilot/Listen layers.

- Lives in: `src/main/deepgramStreamingSTT.ts`, `src/main/sttOpenAI.ts`, `src/main/sttProvider.ts`
- Status: **Live**

### IIVO Memory
Persistent cross-session intelligence. Knows the user's history, preferences, past research, past builds. Any agent can query IIVO Memory to get relevant context without the user re-explaining.

- Lives in: `src/main/iivoAccountStore.ts`, `src/shared/iivoMemoryClient.ts`
- Status: **Partial** — exists, needs deeper agent integration

---

## Tier 2 — Agent Workers

**Job:** Execute specific tasks on behalf of the user. Agents receive a prompt, run to completion, and emit a result. They do not decide what to do — they are told by Tier 0 or by the user directly.

### Glass Coder
Full IDE in the overlay. Reads, edits, creates, and deletes files with user approval on every write. Runs project commands. The most sophisticated agent — it has its own build loop, approval gate, ghost suggestions, and transcript system.

- Lives in: `src/main/agentRunner.ts`, `src/main/coderBuildLoop.ts`, `src/renderer/overlay/GlassIde/`
- Status: **Live**

### Research Agent
Powered by Perplexity Sonar Pro. Opens the ResearchExplorer full-screen UI. Three torrent columns stream sources, analysis, and report in real time. Delivers a custom HTML intelligence card at the end — format chosen by the AI based on the question type.

- Lives in: `src/renderer/research/`, `src/main/agentRunner.ts` (`runResearchWithPerplexity`)
- Status: **Live**

### Writing Agent
Claude with optional web search. Produces documents, emails, posts. Saves via `write_file`.

- Lives in: `src/main/agentRunner.ts`, `src/main/agents/definitions.ts`
- Status: **Live** (basic), needs ResearchExplorer-style delivery UI

### Code Analyst Agent
Reads a codebase and produces a structured analysis report. Sister to Glass Coder — reads without writing.

- Lives in: `src/main/agentRunner.ts`, `src/main/agents/definitions.ts`
- Status: **Live** (basic)

### Agent Event Bus
The horizontal communication layer between agents. Agents are no longer silos — Coder can trigger Research, Research can trigger Writing, and the Context Engine can inject intent into any layer.

**This is separate from the Glass State Bus.** The State Bus is vertical (main process → renderer windows via `push()`). The Agent Event Bus is horizontal (agent ↔ agent within the main process). Never conflate them.

- Lives in: `src/main/agentEventBus.ts`
- Singleton export: `import { agentBus } from './agentEventBus'`
- Status: **Live**

#### The Typed Event Envelope

Every agent-to-agent message shares one envelope:

```typescript
interface BusEvent<T = unknown> {
  eventId: string;        // uuid — deduplicate on receipt
  runId: string;          // top-level task this belongs to
  sessionId: string;      // user session scope
  correlationId: string;  // CRITICAL — binds an entire chain together
  type: BusEventType;     // namespaced: "agent.coder.error", "knowledge.perplexity.ready"
  sourceAgentId: string;
  payload: T;
  timestamp: string;      // ISO 8601 UTC
  sequence: number;       // per-agent monotonic counter
}
```

The `correlationId` is the most important field. When Coder triggers Research which triggers Writing, all three events share the same `correlationId`. This is how you reconstruct a full chain in logs and debug non-deterministic LLM behavior.

#### Event Type Hierarchy

```
orchestrator.*          orchestrator.task.created, orchestrator.task.cancelled
knowledge.*             knowledge.perplexity.ready, knowledge.screen.ready, knowledge.audio.ready
agent.*                 agent.coder.started/complete/error
                        agent.research.started/complete/error
                        agent.writing.started/complete/error
context.*               context.intent.coding/research/writing/meeting
session.*               session.enriched
delivery.*              delivery.complete
bus.*                   bus.dlq.event, bus.circuit.open/closed  (infrastructure only)
```

#### How Agents Wire In

```typescript
import { agentBus, AgentBus } from './agentEventBus';

// Subscribe — fires when Coder hits an unresolved error
const unsub = agentBus.subscribe('agent.coder.error', 'research-agent', async (event) => {
  const { error } = event.payload as AgentErrorPayload;
  // Fire Research with the same correlationId — chain stays linked
  await runResearchWithPerplexity({ prompt: `Fix this error: ${error}`, ... });
  agentBus.publish('agent.research.started', { ... }, {
    runId: event.runId,
    sessionId: event.sessionId,
    correlationId: event.correlationId,  // ← same ID propagates
    sourceAgentId: 'research-agent',
  });
});

// Clean up when agent shuts down
unsub();
```

#### Agent Chains Enabled

| # | Trigger | Chain | Gate |
|---|---|---|---|
| 1 | `agent.coder.error` (recoverable) | → Research fires with error as query → findings injected into Coder context | always |
| 2 | `agent.research.complete` | → Writing drafts document from research findings | `draftAfter: true` |
| 3 | `delivery.complete` (agentId: "council") | → Writing drafts document from Judge's answer | `draftAfter: true` |

All three chains share the same `correlationId` envelope — an entire Coder → Research → Council → Writer workflow is traceable as a single chain via `agentBus.store.getChain(correlationId)`.

**Council pipeline** (`councilBusPipeline.ts`): Strategy → Critic → Judge, each publishing `session.enriched` on the bus. Runs locally via Anthropic SDK — no Railway. Opt into Writer follow-up with `{ draftAfter: true }` in `runLocalCouncilDeliberation()`.

**Inference** (`glassAskAnthropic.ts`): Glass ask calls Anthropic directly from the Electron main process. API key stored in macOS Keychain via `safeStorage`. No Railway hop on the per-question path.

#### Built-in Reliability

- **Circuit breaker per agent** — trips after 3 consecutive failures, prevents cascade
- **Dead Letter Queue** — failed events captured, inspectable via `agentBus.dlq.getAll()`
- **Event store** — last 1000 events in memory, replay any chain via `agentBus.store.getChain(correlationId)`
- **Health check** — `agentBus.healthCheck()` returns DLQ depth + open circuit breakers
- **Dev logging** — all events logged to console in development mode via wildcard observer

#### Infrastructure Rule

Tier 5 (Infrastructure) observes the bus via `agentBus.observe()` but **never publishes back**. The `bus.*` events are the only events infrastructure emits, and only the bus itself emits them — not external code.

---

## Tier 3 — Session Intelligence

**Job:** Run continuously in the background during a session. Not triggered by the user — always on, always accumulating. Session intelligence does not take actions; it builds context that Tier 0 can use.

### Listen Mode
Listens to meetings and conversations. Extracts moments, key decisions, action items, and insights in real time. Produces a session report. The intelligence layer for everything audio.

- Lives in: `src/shared/listenModeRuntime.ts`, `src/main/` (listen* files), `src/renderer/`
- Status: **Live**

### Copilot
Active meeting assistance. Real-time guidance during live conversations — what to say, what to ask, what to watch out for. Feeds from STT and IIVO Memory.

- Lives in: `src/shared/copilotEngine.ts`, `src/main/` (copilot* files)
- Status: **Live**

### Companion
Ambient screen awareness. Watches what is on screen, narrates context through Aletheia, proactively surfaces relevant information. The always-on layer that makes Glass feel alive even when no agent is running.

- Lives in: `src/main/companion*.ts`, `src/shared/glassCompanion.ts`
- Status: **Live**

### Live Translate
Real-time caption translation across languages. Feeds from STT.

- Lives in: `src/main/liveTranslateMain.ts`, `src/shared/liveTranslateEngine.ts`
- Status: **Live**

---

## Tier 4 — Delivery Layer

**Job:** Surface intelligence to the user. Every agent result, narration, and notification comes through here. The delivery layer does not think — it renders.

### Glass Overlay
The full-screen surface. Builder Strip, Dock, CommandBar. Everything visible in Glass lives here. The container for all other delivery surfaces.

- Lives in: `src/renderer/overlay/Overlay.tsx`, `src/renderer/builder/`, `src/renderer/dock/`, `src/renderer/command/`
- Status: **Live**

### Glass IDE
The coding workspace. Diff viewer, approval gate, transcript, ghost suggestions, run header. Only active when Glass Coder is running.

- Lives in: `src/renderer/overlay/GlassIde/`
- Status: **Live**

### Research Explorer
The research workspace. Three torrent columns (Sources / Analysis / Report) streaming live. Intro glass screen for input. HTML delivery card for output. Only active when Research Agent is running.

- Lives in: `src/renderer/research/`
- Status: **Live**

### Aletheia Voice
ElevenLabs TTS narrates every agent action, every phase transition, every key finding. The audio layer of the delivery surface. Makes Glass feel like a presence, not a tool.

- Lives in: `src/main/glassElevenLabsTts.ts`, `src/shared/agentNarration.ts`
- Status: **Live**

---

## Tier 5 — Infrastructure

**Job:** Make everything above possible. No logic, no decisions, no rendering. Pure plumbing.

### Glass State Bus
The central nervous system. All state lives in one object. Changes are broadcast via `push()` to every window simultaneously. Every renderer subscribes and re-renders on change. This is how agents, overlays, and the main process stay in sync.

- Lives in: `src/main/index.ts` (`state`, `push()`), `src/renderer/useGlassState.ts`
- Status: **Live**

### Electron / macOS
The overlay window, screen capture, system audio, display management. The OS-level plumbing that makes a floating intelligence layer possible.

- Lives in: `src/main/windows.ts`, `src/main/displayRegistry.ts`
- Status: **Live**

### API Key Store
Manages all provider keys — Anthropic, Perplexity, OpenAI, ElevenLabs, Deepgram, and others. Every agent and intelligence feed resolves its key here, not from hardcoded env vars.

- Lives in: `src/main/apiKeyStore.ts`
- Status: **Live**

### Session & Memory Stores
Agent history, spend tracking, session screenshots, output files, IIVO account state. The persistence layer.

- Lives in: `src/main/agentHistoryStore.ts`, `src/main/spendTracker.ts`, `src/main/sessionPersistence.ts`
- Status: **Live**

---

## The One Remaining Missing Piece

The Agent Event Bus is now live. One structural gap remains before Glass becomes a fully proactive intelligence system.

### Glass Context Engine (Tier 0) ⚠ NEEDS BUILDING
**What it does:** Reads screen context + audio + agent state in real time and decides, proactively, what the user needs. Routes intent to the right agent without the user asking.

**Why it matters:** Without it, Glass is reactive — the user has to know which agent to open. With it, Glass watches you read a contract and has a brief ready before you think to ask.

**Where it slots:** Tier 0, sitting above Aletheia. Injects `context.intent.*` events into the Agent Event Bus at the appropriate tier.

**How it routes:** The intent classifier maps detected context to a bus event type:
```
coding context    → context.intent.coding    → Agent Event Bus → Coder (Tier 2)
research context  → context.intent.research  → Agent Event Bus → Knowledge Feed (Tier 1)
writing context   → context.intent.writing   → Agent Event Bus → Writing Agent (Tier 2)
meeting active    → context.intent.meeting   → Agent Event Bus → Listen Mode (Tier 3)
```

**Capture strategy (macOS):**
- AXUIElement API first — reads semantic UI tree, zero pixel cost, sub-10ms
- `desktopCapturer` fallback — pixel capture for apps that don't expose AX tree
- STT audio buffer — last 10 seconds of transcript

**Status:** Partial — `src/shared/glassContextEngine.ts` exists. Needs AX capture + intent classifier + bus wiring.

---

## Rules for Future Additions

When adding anything new to Glass, ask these questions in order:

1. **What tier does it belong to?** If it decides or coordinates → Tier 0. If it feeds intelligence → Tier 1. If it executes a task → Tier 2. If it runs passively → Tier 3. If it renders output → Tier 4. If it is plumbing → Tier 5.

2. **Does it fit cleanly into one tier?** If yes, build it there. If it spans two tiers, it is probably two separate things — split it.

3. **Does it talk down the pyramid only?** Higher tiers call lower tiers. Lower tiers do not call up. An agent (Tier 2) can query Perplexity (Tier 1) but Perplexity does not decide what the agent does.

4. **Does it go through the State Bus?** Every state change that affects the UI goes through `push()`. No direct renderer communication from the main process except via IPC → state → push.

5. **Does Aletheia narrate it?** If it is a meaningful action the user should know about, it gets a narration line. Add to `agentNarration.ts`.

---

## What Makes Glass Different

This question comes up: if Glass uses Perplexity for research and Claude for coding, is it just a wrapper?

No. Here is why:

**The intelligence is in the connections, not the models.**
Any app can call Perplexity. Only Glass can read your screen, detect that you are reading a competitor's pricing page, fire a research call, and have a competitive brief ready before you alt-tab back to your deck — without you doing anything.

**The context is unique.**
Perplexity does not know what is on your screen. Claude does not know what you were building yesterday. OpenAI does not know what meeting you just came out of. Glass does. IIVO Memory, OmniParser, Listen Mode, and the Companion layer create a context no API provider has access to.

**The delivery is the product.**
Perplexity gives you a webpage. Glass gives you a glass intelligence card, narrated by Aletheia, surfaced in the overlay you are already in, formatted exactly for the question you asked, with the findings already handed to the next agent that needs them. The delivery experience is not a detail — it is the entire product.

**The chain is the moat.**
Once the Agent Event Bus is live, Glass can do things no single-model product can: self-healing code that researches its own errors, research that automatically becomes a document, meetings that automatically generate next-step briefs. These chains are Glass's IP. The models are just the engines.

---

*Last updated: June 23, 2026*
*Agent Event Bus: LIVE — `src/main/agentEventBus.ts`*
*Council Pipeline: LIVE — `src/main/councilBusPipeline.ts` (local, no Railway)*
*Boot + Activation: LIVE — `src/main/boot.ts` + `src/main/connectAnthropicApiKey.ts`*
*Glass Context Engine: PENDING — next major build*
*This document should be updated any time a new tier member is added, a missing piece is wired, or the hierarchy changes.*
