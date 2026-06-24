# IIVO Glass — Wingman Mode Build Plan

**Status:** In progress  
**Version target:** v0.4.0  
**Primary user:** Solo developers and indie builders using AI coding tools (Cursor, Replit, Lovable, Claude Code)  
**Contract section:** §20  

---

## The One-Line Product Brief

Wingman stays beside the developer while they work — sees the screen when asked, understands the task, catches when something looks wrong, and turns the session into a structured report that tells the developer exactly what to verify before trusting the result.

---

## What Wingman Replaces

| Old | New | Why |
|-----|-----|-----|
| Work Mode | Wingman | Work was too vague — no distinct behavior |
| Fix Mode | Wingman | Fix was too narrow — implied broken-only |

Both are absorbed. The user sees one mode: **Wingman**.

---

## The 11 Powers (V1 Buildable)

### Power 1 — Task-Aware Screen Reading
**What it does:** Visual ask already exists. Wingman wraps it with full session context — the task goal, last 3 app snapshots, prior inspection responses. Same screenshot, dramatically better answer.  
**Signal:** Screenshot + task + session history → specific actionable diagnosis  
**How it's built:** Existing `glassVisualAskCapture` + session-context-injected prompt in `wingman-inspect` handler  

### Power 2 — The "Did It Actually Do It?" Check
**What it does:** Developer asks Cursor to fix something. Cursor says done. Developer hits Inspect. Wingman reads what's visible and compares it to the stated task. Surfaces what it cannot confirm.  
**Signal:** "The task was X. I observe Y on screen. I cannot confirm Z from what's visible."  
**How it's built:** `wingman-inspect` prompt includes the original goal + instruction to compare claim vs. observation  
**Key rule:** Never say "verified." Always say "observed" or "appears to."  

### Power 3 — Session Memory Within a Session
**What it does:** Every inspection is stored. By inspection 4, Wingman knows the full history of this session. Responses reference earlier findings.  
**Signal:** "Earlier you saw a 401 on auth. This payment service error uses the same token logic."  
**How it's built:** `WingmanSession.inspections[]` fed into every subsequent prompt  

### Power 4 — Passive App Timeline
**What it does:** No screenshots. Window title + app name tracked every 30 seconds. Produces a real session timeline without any privacy risk.  
**Signal:** `9:02 Cursor (auth.ts) → 9:18 Terminal → 9:31 Cursor (auth.ts) → 9:44 GitHub`  
**How it's built:** 30s interval polling `getActiveWindowContext()`, deduplicating same app+title within 60s  

### Power 5 — One Concrete Next Step
**What it does:** From current screen + task + session history, Wingman generates exactly one next step. Not a list. A decision.  
**Signal:** "The build is passing. Your next step is to test the empty state you mentioned at the start."  
**How it's built:** Report prompt instructs model to produce one `nextStep` string, not a list  

### Power 6 — Risk Flagging by Scope Drift
**What it does:** Task was "UI change." Inspection shows files outside that scope. Wingman warns.  
**Signal:** "You described this as UI-only. I see references to `stripe.config.js` — verify nothing changed in billing logic."  
**How it's built:** `detectScopeDrift(goal, inspectionResponse)` keyword + heuristic matching in `wingmanSession.ts`  

### Power 7 — Verification Checklist on Demand
**What it does:** At any point, user can request a checklist. Wingman generates specific items based on the task and what it observed — not a generic template.  
**Signal:** `☐ Test login flow ☐ Verify redirect on mobile ☐ Confirm test covers empty state`  
**How it's built:** `buildVerificationChecklist(session)` in `wingmanSession.ts`  

### Power 8 — Session Report with "Not Verified" Section
**What it does:** End-of-session structured report. Goal, timeline, key findings, warnings, and — critically — what Wingman observed but cannot verify. The honest section no other AI tool produces.  
**Signal:** `"Observed but could not verify: Tests appeared to pass — manual run recommended"`  
**How it's built:** `buildWingmanReport()` + AI summary via `askIivoGlass(buildWingmanReportPrompt(session))`  

### Power 9 — Instant Screen Explanation
**What it does:** "What am I looking at?" — zero friction. Glass sees the screen, Wingman answers in the context of the current task. Same Docker error means something different in a deploy session vs. a dev session.  
**Signal:** Task-contextualised explanation of any visible screen  
**How it's built:** Existing visual ask + task context in `wingman-inspect` prompt  

### Power 10 — Simple Loop Detection
**What it does:** Two inspections with similar error output close in time = "This looks like the same issue. The previous fix may not have worked."  
**Signal:** Loop warning notice surfaced to user + flagged in report  
**How it's built:** Compare last 2 inspection responses for shared error keywords in `wingman-add-note` / `wingman-inspect` handler. Not diff analysis — semantic keyword comparison.  

### Power 11 — AI Agent Watch Mode
**What it does:** User opens Cursor Agent or Claude and lets it run. They activate Wingman with "Watch while Cursor fixes this." Each inspect captures the agent's current state. Wingman builds an account of what the agent did that the agent itself never produces.  
**Signal:** Human-readable account of what was observed during agent execution, with explicit gaps noted  
**How it's built:** Standard `wingman-inspect` flow with task goal set as "watching [agent]". Session memory stitches inspections into a coherent account.  

---

## Future Infrastructure Powers (Do Not Build Until V1 Ships)

### Future Power A — Cross-Session Memory
**What it does:** "You worked on something similar 3 days ago. Here's what you learned."  
**Requires:** Persistent session library (local SQLite or JSON), search by goal/app/date  
**Why it matters:** Makes Wingman part of the user's operating memory across sessions, not just within one  
**Dependency:** V1 session report model must be stable first  

### Future Power B — Git / File Diff Integration
**What it does:** During a Wingman session, actually track which files changed via `git diff` or filesystem watcher.  
**Requires:** Shell exec access from Glass (sandboxed), user-configured project root  
**Why it matters:** Scope drift detection becomes exact, not heuristic. "Agent said UI only — git shows 4 files changed including stripe.config.js" becomes a real assertion, not an inference from screen text.  
**Dependency:** Needs sandboxed shell execution + project root config  

### Future Power C — Agent API Interception Layer ⚡ (Highest long-term value)
**What it does:** Instead of watching the screen, intercept what AI agents are doing at the network/API level. See every tool call, every file read/write, every API hit — not just what's visible.  
**Requires:** Local proxy (mitmproxy-style), browser extension hook, or macOS network monitoring  
**Options to research:**
- Local HTTP proxy that Glass routes agent traffic through
- Native macOS `Network Extension` framework  
- Browser extension that intercepts XHR/fetch for web-based agents (Cursor, Replit, Lovable)
- Agent-specific APIs (Cursor has a local WebSocket server, Claude has tool_use in responses)
**Why it matters:** This is what turns Wingman from observer into supervisor. Instead of "I saw tests pass on screen" you get "I saw the test runner execute 4 tests covering these exact paths." This is the feature that makes Wingman a category of its own.  
**Timeline:** Research phase → prototype → V2 or V3  

### Future Power D — True Claim Verification Engine
**What it does:** When an agent claims "done" — Glass actually runs the verification. Executes the test suite. Pings the endpoint. Checks the build.  
**Requires:** Shell execution capability, user-configured verification commands per project, result comparison  
**Dependency:** Agent API interception (#C) + cross-session memory (#A)  
**Why it matters:** Closes the loop completely. Not "I observed that tests appeared to pass" but "I ran the tests and 2 of 6 failed."  

---

## Session Data Model

```typescript
interface WingmanSession {
  id: string
  goal: string
  startedAt: number
  endedAt?: number
  // Passive tracking — title + app only, never screenshot
  appSnapshots: { app: string; title: string; timestamp: number }[]
  // User-triggered only — never autonomous in V1
  inspections: WingmanInspection[]
  notes: WingmanNote[]
  loopWarning: boolean
  report?: WingmanReport
}

interface WingmanInspection {
  id: string
  triggeredBy: "user"          // "proactive" reserved for V2
  timestamp: number
  screenshotRef: string        // path only, not base64
  prompt?: string              // user's question, if any
  response: string             // Wingman's answer
  type: "question" | "next-step" | "warning" | "debug"
  confidence: "observed" | "inferred"  // NEVER "verified"
  scopeDriftWarning?: string   // set by detectScopeDrift()
}

interface WingmanNote {
  id: string
  timestamp: number
  content: string
  source: "user" | "wingman"
}

interface WingmanReport {
  goal: string
  duration: number             // ms
  appsUsed: string[]           // derived from appSnapshots
  summary: string              // AI-generated narrative
  keyFindings: string[]        // from inspections, observed language
  warningsIssued: string[]     // scope drift + loop warnings
  observedOnly: string[]       // things seen but not confirmed
  notVerified: string[]        // things user must still check
  nextSteps: string[]          // max 3, concrete
  savedAt?: number
}

interface WingmanState {
  active: boolean
  session: WingmanSession | null
  inspecting: boolean          // true during screenshot + AI call
  report: WingmanReport | null
}
```

---

## Panel States

### State A — Inactive (no session running)
```
┌─────────────────────────────────┐
│  WINGMAN                        │
│  Active work companion          │
│                                 │
│  What are we working on?        │
│  ┌─────────────────────────┐   │
│  │ e.g. debug failing test  │   │
│  └─────────────────────────┘   │
│                                 │
│  Looks like you're in: Cursor   │  ← auto-detected
│                                 │
│  [ Start Wingman ]              │
└─────────────────────────────────┘
```

### State B — Active Session
```
┌─────────────────────────────────┐
│  ● WINGMAN ACTIVE               │
│  App titles tracked · Screen off│  ← privacy indicator
│                                 │
│  TASK                           │
│  Debug failing auth test        │
│                                 │
│  WHAT I SEE                     │
│  401 on /api/auth/token. The    │
│  error appears in middleware,   │
│  not the route handler.         │
│                                 │
│  NEXT STEP                      │
│  Check JWT_SECRET env var       │
│                                 │
│  ⚠ WARNINGS                    │
│  Same error observed twice      │
│                                 │
│  [ Inspect Screen ]             │
│  [ Add Note ]  [ End Session ]  │
└─────────────────────────────────┘
```

### State C — Report
```
┌─────────────────────────────────┐
│  SESSION REPORT                 │
│  Debug failing auth test        │
│  42 min · Cursor, Terminal      │
│                                 │
│  WHAT HAPPENED                  │
│  [AI narrative summary]         │
│                                 │
│  KEY FINDINGS                   │
│  • 401 observed in middleware   │
│  • Same error appeared twice    │
│                                 │
│  COULD NOT VERIFY               │
│  • Whether fix resolved root    │
│    cause — run test suite       │
│                                 │
│  NEXT STEPS                     │
│  1. Check JWT_SECRET in .env    │
│  2. Run auth test suite         │
│                                 │
│  [ Save to IIVO ] [ New Session]│
└─────────────────────────────────┘
```

---

## Prompt Rules (Non-Negotiable)

Every AI prompt in Wingman must follow these rules:

1. **Never use "verified", "confirmed", "tested", "proven"** — these are claims about execution that Glass cannot make from screen observation alone
2. **Always use "observed", "appears to", "based on what is visible"** — honest and defensible
3. **Every response must include what Wingman could NOT determine** — the "not verified" section is not optional
4. **One next step, not a list** — forces the model to have an opinion, makes the output more useful

---

## Privacy Contract

| What Glass tracks | When | Stored? |
|-------------------|------|---------|
| Active app name + window title | Every 30s during session | In session only |
| Screenshots | Only on user-triggered inspect | In session only |
| Session notes | When user adds a note | In session only |
| Session report | On session end | Only if user saves |

**What Glass never does:**
- Captures screenshots without user trigger
- Records audio in Wingman mode (no audio needed)
- Auto-saves session without user confirmation
- Trains on private session content

---

## Build Order (Task #43 → #60)

```
Phase 1 — Foundation (Tasks #43–#45)
  #43  WingmanSession types
  #44  IPC commands + GlassState
  #45  Fallback state

Phase 2 — Session Engine (Tasks #46–#49)
  #46  wingman-start + app snapshot accumulator
  #47  wingman-inspect (task-aware visual ask)
  #48  wingman-add-note + loop detection
  #49  wingman-end + report generation

Phase 3 — Intelligence (Tasks #50–#51)
  #50  Report prompt + verification checklist
  #51  Scope drift detection

Phase 4 — Mode (Task #52)
  #52  glassModePresets Work → Wingman

Phase 5 — UI (Tasks #53–#54)
  #53  WingmanPanel.tsx (3 states)
  #54  Wire into Panel.tsx + CSS

Phase 6 — Tests (Tasks #55–#56)
  #55  Unit tests (wingmanSession.test.ts)
  #56  Typecheck + full suite

Phase 7 — E2E + QA (Tasks #57–#58)
  #57  Playwright E2E spec
  #58  QA script

Phase 8 — Docs (Tasks #59–#60)
  #59  GLASS_CONTRACT.md §20
  #60  BASELINE_v0.4.0.md

Future Infrastructure (Tasks #61–#64 — do not build until V1 ships)
  #61  Cross-session memory
  #62  Git/file diff integration
  #63  Agent API interception ⚡
  #64  True claim verification engine
```

---

## Definition of Done for V1

- [ ] Wingman mode activates from the dock
- [ ] User can set a task goal
- [ ] App/window timeline tracks passively throughout session
- [ ] Inspect Screen captures screenshot and returns task-aware response
- [ ] Responses never use "verified" language
- [ ] Loop detection fires when same error appears twice
- [ ] Scope drift warning fires when inspection mentions out-of-scope areas
- [ ] Session ends with structured report including observedOnly + notVerified
- [ ] Panel shows session state — not a chat window
- [ ] Privacy indicator visible throughout session
- [ ] Work mode removed from user-facing UI
- [ ] All unit tests passing
- [ ] Playwright E2E spec passing
- [ ] Typecheck clean
- [ ] GLASS_CONTRACT.md §20 written
- [ ] BASELINE_v0.4.0.md written

---

## The Moment That Proves Wingman Works

A developer runs Cursor Agent to fix a failing test. Cursor reports success. The developer activates Wingman, sets the task as "verify Cursor fixed the auth test", hits Inspect.

Wingman responds:

> "Terminal shows 4 tests passing. I observe the test file is `auth.test.ts`. Based on what's visible, the passing tests cover token generation and expiry. I cannot confirm from this screen whether the specific failing case you started with (empty password field) is included in the test suite. You should verify that edge case is covered before closing this."

That response — specific, honest, task-aware, with an explicit gap — is the product. That is what no other tool produces. That is what Wingman is for.
