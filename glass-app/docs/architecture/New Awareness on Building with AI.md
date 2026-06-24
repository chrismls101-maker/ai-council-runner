# New Awareness on Building with AI

*Notes from a conversation while building IIVO Glass*

---

## The big surprise: it's mostly just code

The tools that look like magic — Cursor, Devin, Replit Agent, Perplexity — are almost all the same stack:

- Anthropic or OpenAI API
- A file system layer (read/write files)
- A UI framework (React, Electron, web)
- A lot of iteration on prompts and UX

No special hardware. No secret technology. The models are hosted by Anthropic or OpenAI, so you're just making API calls from a MacBook. Cursor is a React + Electron app at its core — the same stack as IIVO Glass.

**The hardware barrier is at the foundation layer (training the model), not the product layer (building on top of it).** Everyone building products is essentially making API calls.

---

## What separates good products from bad ones at this layer

- How tight is the prompt
- How good is the error handling
- How fast does the UI respond
- How much you iterate based on real usage

That's it. Not secret infrastructure. Not a bigger team. Time, polish, and distribution.

---

## Three levels of working with AI models

### 1. Building on top (what we're doing)
Make API calls to hosted models. No training required. This is how Cursor, Replit Agent, Perplexity, and thousands of other products work. Costs: API usage fees per token.

### 2. Fine-tuning
Take an existing model and train it further on your own data to specialize it. Much cheaper than training from scratch — thousands of dollars, not millions. Done on cloud GPU services like Replicate, Modal, or AWS. Use when:
- You need extreme behavioral consistency at high volume
- You're running a small/cheap model and want to punch above its weight class
- Your use case is genuinely domain-specific in a way general prompting can't solve

For most products, fine-tuning is rarely necessary. The frontier models are so capable that good system prompts get you most of the way there.

### 3. Training from scratch
This is what Anthropic, OpenAI, Google, and Meta do. Requires thousands of H100 GPUs running for months. Costs tens to hundreds of millions of dollars. Needs a dedicated research team, massive datasets, and infrastructure engineering as its own discipline. Completely out of reach for independent developers or most startups. This is not a path for building products — it's for building the foundation that products sit on.

---

## Can you match Cursor in Glass?

### What you can match (right now)
The core agent loop — read files, propose edits, show diffs, apply with approval — is equivalent to what Cursor's Agent mode does. Glass Coder has:
- The same read/write/edit tool set
- The same approval/skip flow
- Streaming answer panel
- Project sandbox with path safety

That's the product. The agent loop is the product.

### Where Cursor pulls ahead: the index
Cursor constantly indexes your entire codebase into embeddings so when you ask "fix the auth bug," it already knows which 12 files are relevant without having to grep and read everything. Building that in Glass means:
- Running a local embedding model (e.g. `nomic-embed-text` via Ollama)
- Maintaining a vector store that updates as files change
- Querying it at agent start to find the most relevant files

Doable. Real engineering work. Not magic.

### What Glass can't do (by design)
**Tab completion** — the inline grey ghost text in editors. That requires intercepting keystrokes inside a specific editor (VS Code, etc.). Glass would need a VS Code extension for that surface. Separate product decision.

---

## Local models — the other option

Instead of API calls, you can run models on-device with tools like **Ollama**. No API cost, no internet required, instantaneous responses. Quality isn't Opus-level, but for quick summarization, code hints, and lightweight tasks it's good enough. This is the realistic "training adjacent" decision for a desktop app — not training your own model, but choosing to run an existing one locally.

---

## The reality of "big" AI products

**Cursor** — forked VS Code (open source). Small team for most of its life. Raised at a huge valuation but the core product was built fast by a few engineers with a good model + good UX instincts.

**Perplexity** — essentially a search wrapper with a streaming UI and fast iteration. Good product sense, not proprietary technology.

**Replit Agent, Devin** — add a sandboxed Linux environment (Docker container) where the agent can run shell commands and see output. That's the meaningful addition over a file-only agent. The loop itself is the same pattern.

---

## What actually takes serious resources

Training the foundation models. That's where the compute lives. Everything else — the products, the agents, the UX — is built on top of that foundation with regular engineering. The path from "idea" to "shipping product" doesn't go through GPU clusters. It goes through good prompts, clean code, and real users.

---

*Written during the IIVO Glass v0.7.0 agents build, June 2026*
