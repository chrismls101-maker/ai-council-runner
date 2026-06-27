# IIVO Glass — Cursor Context

> Paste this into a new Cursor or Claude chat to restore full project context.

---

## Aletheia Companion — ALL PHASES COMPLETE (P0–B8)

**Status:** Shipped on `main`. Phases 0 through 8 are done. Do not re-implement unless fixing a bug or extending scope.

| Phase | Scope | Shipped | Key modules |
|-------|--------|---------|-------------|
| **P0** | Action execution engine — intent, confirmation, ledger, orchestrator | ✅ | `aletheiaExecution.ts`, `aletheiaActionOrchestrator.ts`, `aletheiaActionLedgerStore.ts` |
| **B1** | Observation plane, activation, ambient synthesis | ✅ | `aletheiaObservationPlane.ts`, `aletheiaActivationPolicy.ts`, `aletheiaAmbientSynthesis.ts` |
| **B2** | Pending advice, action confirmation, bounded terminal loop | ✅ | `aletheiaPendingAdvice.ts`, `aletheiaActionConfirmation.ts`, `aletheiaBoundedAutonomy.ts` |
| **B3** | Agent coordinator, delegated presence/loop, research conversation | ✅ | `aletheiaAgentCoordinator.ts`, `aletheiaDelegatedPresence.ts`, `aletheiaResearchConversation.ts` |
| **B4** | Persona behavior, session notes, attention recovery | ✅ | `aletheiaPersonaBehavior.ts`, `aletheiaNotes.ts`, `aletheiaAttentionRecovery.ts` |
| **B5** | Relationship thread, multi-display awareness, surface doctrine | ✅ | `aletheiaRelationshipThread.ts`, `aletheiaDisplayAwareness.ts`, `aletheiaSurfaceDoctrine.ts` |
| **B6** | Trust & activity — human-legible audit trail | ✅ | `aletheiaTrustLedger.ts`, dashboard Trust panel |
| **B7** | Security hive — Watcher, Verifier, Containment, Key Guardian | ✅ `ccd4153` | `aletheiaSecurityHive.ts`, `aletheiaSecurityHivePlane.ts` |
| **B8** | Founder Command Tier — explicit Deployed Execution (founder only) | ✅ `92424de` | `aletheiaFounderCommandTier.ts`, dashboard + strip markers |

**Recent commits (glass-app):**
- `92424de` — B8 Founder Command Tier (Deployed Execution invoke/deactivate)
- `ccd4153` — B7 Security hive + containment dismiss + E2E G8
- `d308265` — B6 Trust activity panel
- `a1a1b48` / `3138699` — B5 display awareness + surface doctrine

**Architecture laws (always enforce):**
- **Glass** = infra (keys, spend, memory admin, delete). **Aletheia** = session/control via `dispatchAletheiaCommand()`.
- `deleteAletheiaSessionHistory` only in `dashboardIpc.ts` — never Aletheia dashboard IPC.
- `snapshot()` must expose every Aletheia field on `GlassState` in `ipc.ts`.
- Aletheia dashboard buttons use `dispatchAletheiaCommand()` — not raw `send()` (allowlist in `aletheiaAuthority.ts`, 23 commands).
- B8: `isFounderAccount` = `role === "founder"` only. Deployed Execution is **explicit session state**, not passive account identity. Non-founders never see `aletheiaDeployedExecution` in snapshot.

**E2E:** `glass-app/tests/e2e/glass-companion.spec.ts` — G1 allowlist, G2–G6 gates, G7 IPC boundaries, G8 security hive, G9 Deployed Execution (52 tests).

**Unit tests:** `npm run test` includes `src/test/aletheia*.test.ts` (260+ tests). Run from `glass-app/`.

**Local WIP (not part of Aletheia phases):** Root `src/components/glass-landing/` cinematic intro — separate from companion build; uncommitted.

---

## Folder Structure

```
/Users/newuser/Desktop/iivo-workspace/        ← full project root (was: ai-council-runner)
└── glass-app/                                ← Electron macOS app (was: desktop-glass)
    ├── src/
    │   ├── main/          ← Node/Electron main process
    │   ├── renderer/      ← React UI (all windows)
    │   ├── shared/        ← Types, IPC contracts, shared logic
    │   └── preload/       ← Electron preload scripts
    ├── docs/
    │   ├── architecture/  ← GLASS_ARCHITECTURE.md + design docs
    │   ├── builds/        ← CURSOR_BUILD_* prompts
    │   ├── reviews/       ← CURSOR_REVIEW_* prompts
    │   ├── reports/       ← QA, status, snapshots
    │   └── planning/      ← Changelogs, WIP, task tracking
    ├── electron.vite.config.ts
    ├── package.json       ← name: "iivo-glass"
    └── GLASS_ARCHITECTURE.md  ← READ THIS before adding anything
```

---

## What This Project Is

IIVO Glass is a macOS AI overlay (Electron + React + Vite). It floats on top of everything the user does — no switching apps. Aletheia is the voice and intelligence identity. Agents run underneath her.

**Run it:** `npm run dev` from `glass-app/`

---

## Architecture — 6 Tiers (read GLASS_ARCHITECTURE.md for full detail)

| Tier | Name | Key files |
|------|------|-----------|
| 0 | Orchestrators | Aletheia, IIVO Council (`ai-council-runner/`), Glass Context Engine |
| 1 | Knowledge & Awareness | Perplexity Sonar Pro, OmniParser, STT, IIVO Memory |
| 2 | Agent Workers | Glass Coder, Research Agent, Writing Agent, Code Analyst |
| 3 | Session Intelligence | Listen Mode, Copilot, Companion, Live Translate |
| 4 | Delivery Layer | Glass Overlay, Glass IDE, Research Explorer, Aletheia Voice |
| 5 | Infrastructure | Glass State Bus (`push()`), Electron/macOS, API Key Store |

**Rule:** Higher tiers call lower tiers. Never the reverse. All state goes through `push()`.

---

## Key Files to Know

### Main Process
- `src/main/index.ts` — app entry, Glass State Bus (`state` object + `push()` function)
- `src/main/agentRunner.ts` — runs all agents; Research Agent uses Perplexity (not Anthropic)
- `src/main/agents/definitions.ts` — system prompts and tool definitions per agent
- `src/main/glassElevenLabsTts.ts` — Aletheia's voice
- `src/main/apiKeyStore.ts` — all API key resolution (Anthropic, Perplexity, OpenAI, ElevenLabs, Deepgram)
- `src/main/coderBuildLoop.ts` — Glass Coder build loop

### Renderer — Research Explorer (active focus)
- `src/renderer/research/ResearchExplorer.tsx` — main component
- `src/renderer/research/ResearchExplorer.css` — CSS-only Apple Liquid Glass backgrounds (NO Three.js blobs)
- `src/renderer/research/TorrentColumn.tsx` — streaming column component
- `src/renderer/research/delivery/Phase5Deliver.tsx` — structured delivery card
- `src/renderer/research/delivery/Phase5Deliver.css`
- `src/renderer/research/phaseContent.ts` — Phase5DataShape type source of truth

### Renderer — Glass IDE (Coder)
- `src/renderer/overlay/GlassIdeShell.tsx` — IDE shell
- `src/renderer/overlay/GlassIdeStream.tsx` — live streaming transcript
- `src/renderer/overlay/GlassIdeEditorWorkspace.tsx` — Monaco editor workspace
- `src/renderer/overlay/GlassIdeReviewShelf.tsx` — approval gate for file changes

### Renderer — Overlay
- `src/renderer/overlay/Overlay.tsx` — root overlay, mounts all panels
- `src/renderer/builder/BuilderStrip.tsx` — bottom builder strip
- `src/renderer/command/CommandBar.tsx` — command bar

### Shared Types
- `src/shared/ipc.ts` — ALL IPC channel names and types (AgentEvent, GlassState, GlassAgentId)
- `src/shared/agentNarration.ts` — Aletheia narration lines per event

### Styles
- `src/renderer/styles/glass.css` — global Glass design system (CSS variables, components)
- `src/renderer/styles/glassButtonDepth.css` — button depth effects
- `src/renderer/styles/glassPresenceGlow.css` — glow/presence effects

---

## Research Agent — How It Works

**Entry point:** User types question in ResearchExplorer intro screen → fires `glass:run-agent` IPC with `agentId: "research"`

**Backend:** `agentRunner.ts` → `runResearchWithPerplexity()` — uses Perplexity Sonar Pro (`sonar-pro`, `search_context_size: "high"`, streaming SSE)

**Event flow (renderer routing):**
- `tool-start` web_search → Left column: "Searching: [query]"
- `tool-done` web_search → Left column: all citations; Mid column: cross-ref lines
- `text-delta` → Right column (buffered, streamed live)
- `tool-start` write_file → captures `ev.toolInput.content` as report
- `done` → extract HTML block → render `HtmlDeliverPanel`; fallback to Phase5Deliver (JSON); fallback to plain markdown

**Delivery format:** AI generates HTML inside `---ALETHEIA_HTML_START---` / `---ALETHEIA_HTML_END---` markers. Format is question-adaptive (tables, timelines, comparison grids, step guides). CSS design system injected via system prompt (`.al-table`, `.al-card`, `.al-tag`, `.al-metric`, `.al-step`, `.al-timeline`, `.al-pros-cons`).

**Three columns:**
- Left = Sources (web_search citations)
- Mid = Analysis (cross-referencing, synthesis lines)
- Right = Report (streaming write_file content)

---

## Glass Coder — How It Works

**Entry point:** `glass:run-agent` IPC with `agentId: "coder"` + project path

**Tools:** `read_file`, `list_directory`, `search_files`, `edit_file`, `create_file`, `delete_file`, `run_project_command`

**Approval gate:** Every `edit_file` / `create_file` / `delete_file` requires user approval before writing. Shown in `GlassIdeReviewShelf`.

**State flow:** `agentRunner.ts` → emits `AgentEvent` → IPC → `glass:agent-event` → `Overlay.tsx` listener → routes to appropriate IDE panel

---

## IPC Pattern

```typescript
// Main → Renderer
win.webContents.send('glass:agent-event', event: AgentEvent)

// Renderer listens
window.glass.onAgentEvent((ev: AgentEvent) => { ... })

// State updates
push({ key: value })  // broadcasts to all windows via useGlassState hook
```

---

## Perplexity Integration

```typescript
// src/main/agentRunner.ts
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"
const PERPLEXITY_MODEL   = "sonar-pro"

// Key resolved from apiKeyStore — label/service must contain "perplexity" or "pplx"
// Falls back to process.env.PERPLEXITY_API_KEY
```

---

## ResearchExplorer Backgrounds

CSS-only, no Three.js. Two themes in `ResearchExplorer.css`:

```css
.research-explorer--light  /* frosted glass, slight see-through */
.research-explorer--dark   /* solid charcoal/black */
```

Global CSS variables live in `src/renderer/styles/glass.css`:
- `--glass-bg: rgba(8, 10, 16, 0.88)`
- `--glass-bg-strong: rgba(6, 8, 14, 0.94)`
- `--glass-border`, `--glass-text`, `--glass-text-dim`
- `--cyan: #38e1ff`, `--purple: #a780ff`

---

## Two Missing Pieces (not yet built)

1. **Glass Context Engine** (Tier 0) — reads screen + audio + agent state, routes intent proactively without user asking. Partial: `src/shared/glassContextEngine.ts`
2. **Agent Event Bus** (Tier 2) — lets agents trigger each other (Coder → Research → Writing chains). Not yet built.

---

## What NOT to Do

- Never move `package.json`, `tsconfig.json`, vite/electron-builder configs, or HTML entry point files
- Never reach up the tier pyramid (agents don't call orchestrators)
- Never bypass the approval gate in Glass Coder
- Never use Three.js blobs in ResearchExplorer — CSS only
- Always read `GLASS_ARCHITECTURE.md` before adding a new feature
