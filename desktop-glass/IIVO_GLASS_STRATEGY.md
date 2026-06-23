# IIVO Glass — Product Strategy
**Updated:** 2026-06-17  
**Status:** Active direction. Supersedes the prior AE-focused analysis.

---

## What IIVO Glass Actually Is

Every AI tool today has the same structural problem: it lives inside something. A browser tab. An IDE. A chat window. An app. The moment you leave that app, the AI loses you. Context drops. You start over.

IIVO Glass is different at the architecture level. It's a transparent intelligent layer that sits above your entire screen — above every app, every window, every tool you use. It can't be closed by switching apps because it doesn't live inside any app. It lives at the OS level, above all of them.

The command bar is always at the bottom. Glass already sees what you're looking at before you type a word. You don't describe your situation — Glass is already in it.

**What no other tool can do:**  
See Figma and your code editor and your terminal simultaneously, in real time, without you switching windows, copying anything, or explaining context. Every AI tool that exists today sees one of those things. Glass sees all of them at once.

---

## The Category

This is not "AI assistant." That phrase is dead.

IIVO Glass is the **OS-level ambient intelligence layer for people who are building things.**

Not a tool you open. Not a feature. A layer that's always present, always in context, and gets smarter the longer someone uses it. The closest analogy: what if your computer itself understood what you were working on?

---

## Who This Is For

AI has changed who builds. The traditional definition of "developer" is too narrow. A new category of builder has emerged — people who are shipping real products using Cursor, Claude Code, Bolt, Vercel, Figma, and AI-assisted workflows. Some write code professionally. Some are designers who ship. Some are founders who vibe-code their own products. Some are non-technical people building serious things with AI tools.

What they share: they are actively creating, they live across multiple tools simultaneously, and every existing AI product forces them to context-switch to use it.

**The IIVO Glass user** has Figma open. And their editor open. And their terminal running. And Claude or ChatGPT in a browser tab. They're switching between all of these constantly, losing context every time they have to switch to AI to ask something.

Glass ends that. One key. Glass sees all four. Ask one sentence. Keep building.

**This is not a narrow developer tool.** The target is the entire and rapidly expanding population of people building things with AI — the category that Cursor, Claude Code, and the vibe coding movement are collectively creating. That population doubles roughly every 18 months. Glass builds for where it's going, not where it's been.

---

## The Three Magic Moments

These are the experiences that make someone tell a friend.

**The builder moment**  
You run a command. It fails. Before you've finished reading the error, Glass has already read it and surfaced the fix. One click to apply. You never broke flow. Developers post this on X. Indie hackers post this on Product Hunt. It spreads.

**The context moment**  
You're deep in a component. Something doesn't make sense. You hit the Glass hotkey. It already sees your Figma mockup on the left, your code in the middle, the error in your terminal at the bottom. You ask one sentence with no context, no pasting. Glass answers with awareness of your full workspace. People call this "it read my mind."

**The design-to-code moment**  
You screenshot a design — from Figma, from a reference site, from anything. Glass generates the component. It matches your codebase conventions because it already read your code. The gap between what something looks like and what it is in code collapses to seconds.

---

## The Unfair Advantage

**Screen-aware across the full workspace.** Cursor is editor-only. Claude Code is terminal-only. ChatGPT requires you to describe reality. Glass sees the whole screen — every visible app, every open window — simultaneously. That's not a feature advantage. It's a structural advantage that can't be replicated from inside any single platform.

**Ambient, not invoked.** Most AI tools wait to be summoned. Glass is always present. The intelligence compounds over a session — Glass knows what you've been building, what errors you hit, what you fixed. It builds context passively so you never have to re-explain.

**The longer you use it, the better it knows you.** Workflow patterns, codebase conventions, project history — these accumulate in Glass's memory layer. After a month of use, Glass understands how you build. After six months, it's irreplaceable. No tool that lives inside one app can replicate this.

---

## What's Already Built

Every major feature in the current build was built for this audience and this strategy:

**Diff preview (#161)** — Before any AI code change lands on disk, the builder sees exactly what's changing. Trust layer for AI-assisted code edits.

**Build output monitoring (#162)** — Glass watches terminal output during builds, detects failures, surfaces fixes. The first magic moment, automated.

**Design-to-code (#163)** — Screenshot a design. Glass generates the component, matching your codebase's conventions. The bridge between Figma and your editor.

**Import-aware context (#164)** — Glass reads your file's imports and includes them as context. AI responses match your actual codebase, not generic patterns.

**Custom slash commands (#165)** — Users define their own Glass powers. Fully extensible, hot-reloaded from a local config file.

**Wingman mode** — Passive session tracking for active build work. Glass watches what you build, catches what broke, generates a structured progress report.

**Context snapshot (⌘⇧G)** — One hotkey fires a screenshot, reads editor content via Accessibility API, grabs terminal buffer. Packages into one prompt. Sends to the model. Answer in the overlay in 2–3 seconds.

---

## Competitive Position

**Cursor** — Editor-only. Deep, excellent in its lane. Cannot see Figma. Cannot see the browser. Cannot see anything outside VS Code. Glass is not competing for the IDE — it sits above it.

**Claude Code** — Terminal and filesystem. Excellent for agent tasks. Blind to anything visual. No overlay. No ambient presence during active work.

**ChatGPT / Claude** — Require you to go to them, describe your context, wait. Glass eliminates the describe step entirely. These are tools you switch to. Glass is already there.

**Cluely** — Screen-aware overlay. Built for interview cheating, not building. No codebase awareness, no design-to-code, no terminal integration. Different product and a reputationally poisoned category that Glass deliberately avoids.

**What Glass owns:** The whole-workspace moment. The experience of having AI that sees everything on your screen simultaneously — your design, your code, your errors, your browser — and answers without you explaining any of it.

---

## Business Model

**Who pays:** Builders who use AI tools daily. This is not enterprise. It's prosumer — people who expense $20-$100/month on tools without a procurement process, the same way they pay for Cursor or Figma.

**Pricing direction:**
- Individual: ~$25–$50/month
- Teams: seat-based, unlocks shared command libraries and workspace sync

**Acquisition:** Bottoms-up. Developers and builders share tools they love. One viral demo of the build monitoring moment or the design-to-code bridge spreads in dev communities faster than any paid ad. Communities to be in: Hacker News, indie hackers, Product Hunt, dev Twitter/X, Cursor Discord, Claude Discord.

**The expansion path:** Nail the developer + design-engineer persona first. The same architecture then applies to any creator using AI tools to ship — content creators with complex multi-tool workflows, data analysts moving between notebooks and dashboards, researchers across papers and code. Each expansion is the same product, different workspace context.

---

## What Glass Should Never Become

A general-purpose AI chat interface. A meeting recorder. A CRM. A "do everything" platform. A tool that requires you to explain your context before it helps you.

The identity is the ambient layer. The layer that's already in context when you hit the hotkey. Everything that erodes that identity is a mistake, regardless of how useful it sounds.

---

## The North Star

The builder in 2028 opens their computer and Glass is just there — part of the environment, like a second monitor that happens to understand everything on the first one. It's not a tool they go to. It's the layer that makes every tool they use smarter.

That's the product. Build toward it.
