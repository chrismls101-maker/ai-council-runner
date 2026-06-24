# IIVO Glass — Vision, Strategy & Feature Index

> Living document. Updated as we build and discuss.
> If an idea was discussed but not yet built, it lives here so nothing gets lost.

---

## What Glass Is

An OS-level ambient intelligence layer that sits transparently over your entire Mac.
Not a chat app. Not a Claude wrapper. The layer between you and your computer that makes everything smarter.

**The core promise:** Glass already knows what you're looking at. You don't explain context — you just ask.

---

## Who It's For

**Primary — developers and builders.**
People who live inside their computer all day. Who have a code editor, a terminal, a browser, and a design file open simultaneously. Who lose 10 minutes an hour switching to AI tools and explaining their situation.

**Secondary — knowledge workers, operators, analysts.**
Anyone who multitasks across apps and loses flow switching to AI.

**The entry wedge:** developers. They adopt early, evangelize hard, pay for tools that save time, and influence everyone around them.

---

## The Magic Moments (what makes people tell their friends)

1. **The context moment** — you hit one key, Glass sees your screen, you ask one sentence, answer appears in 2 seconds. You never left your work. No context explaining. Just flow.

2. **The terminal moment** — you run a command, it fails, Glass reads the error and says "here's why, here's the fix" with one click to run it. Developers post this on X. It goes viral.

3. **The memory moment** — weeks later, working on something similar. Glass says "you solved something like this on March 12th — here's what you did." Nobody else has this.

---

## The Moat (what makes Glass defensible)

**Context accumulation.** Glass sees everything you do, across every session. Over time it builds a model of you — your workflows, your projects, your decisions, your code style, your clients. This doesn't exist anywhere else. It lives on your machine, gets richer every day, and becomes irreplaceable.

Anthropic has the model. They don't have your context. That's Glass's.

---

## Competitive Landscape

| Product | Angle | Limitation |
|---|---|---|
| Cluely | "Cheat on everything" — meeting/interview overlay | Banned by enterprises, controversial premise |
| Shadow | Screen + voice, keyboard shortcut triggered | Meeting/voice focused, not full OS layer |
| Highlight AI | Screen reading AI ($40M Series A) | Meeting focused, no memory layer |
| Screenpipe | Open source local recorder | Tool, not a product |
| Microsoft Copilot | Windows-embedded | Checkbox feature, not a vision |
| Apple Intelligence | iOS/Mac built-in | Siri-level shallow, App Store politics limit depth |
| **Glass** | Full OS layer, memory, terminal, zero context-switching | — |

---

## Model Strategy

Glass routes to the right model per task — pay more only when the task demands it.

| Model | Use in Glass | Speed | Cost |
|---|---|---|---|
| Haiku 4.5 | Quick ambient tasks — clipboard detection, simple responses | Fastest | Cheapest |
| Sonnet 4.6 | Standard interactions, coding help, overlay answers | Fast | Mid |
| Opus 4.8 | Deep reasoning, complex multi-step tasks | Slower | Higher |
| Fable 5 | Frontier tasks — complex builds, long context, hard problems | Slower | Highest |
| Mythos 5 | Not publicly available (Project Glasswing invite-only) | — | — |

**Current:** Glass uses Sonnet 4.6 for everything. Near-term upgrade: route by task complexity.

---

## Feature Index

### Built ✅

- **Glass Terminal** — real PTY terminal in dock drop-down (node-pty + xterm.js)
- **Awareness Strip** — ambient notification bar above command bar
- **"Do This" Power** — clipboard → Glass acts on it → types back or saves to file
- **Ambient Screen Intelligence** — passive digest loop, reads screen context
- **Perception Layer** — clipboard monitoring + app-switch event tracking
- **Memory Layer** — cross-session context persistence, searchable history
- **Action Execution Engine** — shell commands, file write, keystroke injection
- **Meeting Intelligence** — live moment capture, classification, debrief reports
- **Wingman Mode** — session-aware work tracker with git diff + verification
- **Agent Proxy** — intercepts AI agent API calls for awareness + logging
- **Live Terminal Feed** — real-time terminal output in overlay widget

---

### In Progress / Next 🔨

**Glass Coder 7→8 roadmap** — see [`CURSOR_BUILD_GLASS_CODER_7_TO_8.md`](CURSOR_BUILD_GLASS_CODER_7_TO_8.md) for locked scope: approval batching, git bootstrap, index defaults, QA polish, session continuity, ghost text, allowlisted shell, analyst→coder handoff.

**#154 — Terminal Auto-Fix**
Glass watches PTY output for non-zero exit codes. On failure: sends command + error to model, gets fix suggestion, shows inline card in overlay with "Fix it" button that types corrected command back into terminal.
*Why it matters: the developer viral moment. This gets posted on X.*

**#155 — Glass Powers Palette**
Global hotkey (⌘⇧G or similar) opens Raycast-style overlay listing all Glass powers, ranked by current context (clipboard content, active app). Makes every capability instantly discoverable.
*Why it matters: turns Glass from "thing I forget exists" to "thing I reach for instinctively."*

**#156 — Code-Aware Context Injection**
When active app is a code editor (Cursor, VS Code, Xcode), Glass reads file path + language from window title via Accessibility API, fetches code snippet, auto-injects into every Glass ask.
*Why it matters: "what does this do?" just works. No paste needed.*

**#157 — Multi-Window Context Assembler**
On Glass hotkey: fires full-screen screenshot (captures all visible windows) + pulls active file text via macOS Accessibility API (AXUIElement) + reads PTY terminal buffer. Assembles all three into one unified prompt. Answer in 2-3 seconds.
*Constraint: captures what's visible on screen. Works when all relevant windows are open simultaneously — which is the natural developer workflow.*

---

### Ideas Discussed — Not Yet Tasks 💡

These came up in conversation. Not prioritized yet, but don't lose them.

- **Model routing engine** — automatically pick Haiku/Sonnet/Fable based on task complexity. Fast answers stay fast. Hard answers get the best model.
- **Personal workflow graph** — learn HOW the user works over time. Patterns across apps, decisions, sequences. Gets smarter the longer someone uses Glass.
- **Privacy infrastructure** — end-to-end encrypted on-device context storage. Route sensitive tasks to local models (Ollama). Trust-first positioning vs. Cluely's "we scrape everything."
- **Fable 5 integration** — upgrade deep reasoning tasks to Fable 5 (released June 9, 2026). Noticeable quality jump on complex builds.
- **Accessibility API reader** — standalone AXUIElement module for reading app content without screenshots. Reads VS Code file + text, browser URL, Figma file name even when not frontmost.
- **Glass for builders positioning** — marketing/product angle: "build WITH Glass." The overlay that sees your Figma + your code + your terminal simultaneously. No other tool sits at that intersection.
- **Frictionless share** — one-click share of a Glass "moment" so developers can show others what it just did. Viral growth mechanism.
- **On-device local model fallback** — Ollama integration for privacy-sensitive tasks that shouldn't leave the device.

---

## The 5-Year Picture

**Year 1–2:** Power-user tool for Mac developers. 10k–50k users. Known as "the terminal + AI overlay that actually works."

**Year 3:** Glass has a personal context layer. It remembers everything you've worked on, every project, every decision. When you ask something, it knows your history. This is what Apple Intelligence promised and didn't deliver.

**Year 4:** Glass becomes the control layer for your entire computer. Multi-step cross-app workflows. "Glass, prepare the client report from the Notion doc, the Figma mockups, and the Slack thread."

**Year 5:** Glass is the intelligence layer between users and their OS. Model-agnostic — routes to the best AI for each task. Anthropic (or Apple, or someone) acquires or deeply partners because Glass has what they don't: the user context layer and the workflow graph, accumulated over years.

---

## What Glass Spends On (vs. Anthropic)

Anthropic spends billions on: GPU clusters, model training, inference compute, safety research.

Glass spends on:
- Context infrastructure — storing, indexing, querying user context efficiently
- Deep OS integration — Accessibility APIs, system hooks, cross-app automation  
- The personal model — AI that knows this specific user
- Privacy infrastructure — on-device processing, encrypted context
- UX and feel — the transparency, the aesthetic, the seamlessness

Glass doesn't compete on model quality. Glass builds the layer the model plugs into.

---

*Last updated: June 2026*
