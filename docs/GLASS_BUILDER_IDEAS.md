# IIVO Glass — Builder Feature Ideas

## Builder Strip — Panels (tabs that open a drawer)
1. **Prompt Library** ✅ Built — full CRUD, localStorage
2. **API Key Manager** ✅ Built — full CRUD, safeStorage encrypted
3. **Power Prompt Generator** ✅ Built — intent + target + mode → expert prompt, editable context, save to library
3. **Cold Start Eliminator** — When you return to a project, surfaces a brief: what was broken last session, what was in progress, what was next. Like a standup with yourself.
4. **Error Memory** — Sees terminal/console errors and checks your personal history. If you've solved this class of error before, shows your previous fix alongside the AI suggestion. Stop solving the same problem twice.
5. **.env Vault (project-aware)** — Extend API key manager to understand projects. Tag a key to a project; when Glass sees you open that directory in terminal, surfaces the relevant vars. Can scaffold a new .env file.
6. **Doc Surfacer** — Watches what you're building and proactively surfaces relevant documentation. Calling an ElevenLabs endpoint? Shows the right docs. No searching, no new tab.
7. **Vibe Code Companion (persona: new builder)** — When something breaks, narrates what went wrong in plain English and gives a "what to do next" without requiring technical vocabulary. Bridges the skill gap.
8. **Workflow Recorder** — Glass watches you do a repeating multi-step workflow and offers to save it as a named playbook. Next time: say "deploy project" and Glass walks you through it.
9. **AI Output Reviewer** — When you paste AI-generated code into your editor, proactively flags security holes, missing error handling, deprecated APIs. The rubber duck that actually checks your work.
10. **Context Handoff** — When you switch between AI tools (Claude → ChatGPT → Cursor AI), Glass maintains what you're working on and can inject it into whichever tool you switch to. Eliminates the "re-explain where I am" tax.

## Builder Strip — Quick Actions (one-click, no panel)
11. **Snap to AI** — One click captures screen and opens a Glass query pre-loaded with the screenshot. Zero context switching. Already exists as captureLens but not surface-accessible.
12. **Copy Context** — Copies current working context (project, active file, recent error, what Glass thinks you're doing) as a prompt-ready string. Paste into any AI tool to instantly resume.
13. **Fix This** — When a terminal error is visible, one click triggers "fix this error" without opening command bar. Glass reads the error, generates the fix, returns to you.
14. **Quick Note** — Click, type a thought, Enter. Saves to session memory in under 2 seconds. Never lose an idea mid-flow.
15. **Git Status** — Shows current branch + time since last commit in the strip. Click to see uncommitted diff summary. Replaces constant terminal switching just to check state.
16. **Deploy** — One-click shortcut that runs a configured command (npm run deploy, vercel --prod, etc.) in the background. Shows success/fail in the strip.
17. **Explain This** — One click asks Glass to explain whatever is currently visible or selected on screen. No command bar, no context switching, no re-typing what you're looking at.
18. **Pomodoro** — Focus timer built into the strip. Shows remaining time. Rings via Glass audio when the session ends. Simple, always visible, no app switching.
19. **Snippet Insert** — Saved code snippets that paste directly into the frontmost app on click. Replaces the clipboard dance when you have boilerplate you use constantly.
20. **Live Build Status** — Watches your terminal for build/compile output and shows a green/red indicator in the strip. Click for the last N lines of output. Always know if your build is clean without touching the terminal.

## Builder Strip — Additional Panel Ideas
21. **Snippets** — Saved code blocks you paste into your editor with one click. Different from prompts — these are boilerplate you type 20 times a day: useEffect shell, try/catch wrapper, standard API fetch pattern, Tailwind card template. Click the snippet, it injects directly into the frontmost app.
22. **Notes** — A scratchpad that persists to session memory. Click open, type a thought, close. Never lose an idea because you didn't want to break flow to open a notes app.
23. **History** — Last 10 things Glass answered or fixed, with a one-click "re-run this" or "copy this response." Asked Glass to explain something 20 minutes ago and forgot the answer — it's right here.

## Builder Strip — Additional Quick Action Ideas
24. **Snap** — Captures the screen and opens a Glass query pre-loaded with it. Replaces: hotkey → switch window → paste screenshot → type question. One button.
25. **Fix This** (standalone button) — When a terminal error is visible, clicking this triggers "fix this error" immediately. Glass reads the error, no command bar needed.
26. **Explain** (standalone button) — One click asks Glass to explain whatever is currently selected or visible. Works on any app, any content. No re-typing, no context switching.
27. **Git** (status indicator) — Shows current branch + commit age in the strip itself. Amber if nothing committed in an hour, red if nothing in 3. Click for a diff summary. Eliminates the 10 "git status" checks per session.
28. **Deploy** (standalone button) — Runs a configured command once set (vercel --prod, npm run build, etc.) and shows green/red in the strip. No terminal trip for something you do 5 times a day.
29. **Build Light** — Watches terminal output for build/compile results and keeps a live green/amber/red dot in the strip. Always know your build state without looking away from what you're doing.
30. **Context Copy** — One click that assembles your current context (project, file, last error, branch, what Glass thinks you're doing) into a clean prompt-ready string and copies it. Paste into any AI tool and pick up exactly where you are.

## Ambient Intelligence — Background Behaviors (require no user input)

**31. PR Description Writer**
- **The friction it kills** — Writing PR descriptions is slow, often skipped, and always painful after a long build session. Nobody wants to context-switch back into "what did I just do" mode.
- **How Glass uniquely enables it** — Glass reads the terminal live. When it sees `git diff` or `git log`, it already has the full diff output and the project context. No copy-paste, no switching to the browser. The button appears only when relevant.
- **Strip format** — Quick action button (surfaces contextually when terminal shows git activity; otherwise hidden)
- **Build complexity** — Medium

**32. Clipboard Vault**
- **The friction it kills** — You copy something, then copy something else, then realize you needed the first thing. Gone forever. Rebuilders lose 10–20 minutes a day redoing copy operations.
- **How Glass uniquely enables it** — Glass already monitors the clipboard every 2 seconds (it's in the existing state). No other productivity tool can watch the clipboard across every app simultaneously at the OS level.
- **Strip format** — Quick action button → opens compact dropdown of last 10 clipboard items, one-click to re-paste any of them
- **Build complexity** — Low (clipboard monitoring already exists in state)

**33. Test Failure Decoder**
- **The friction it kills** — Parsing Jest/Pytest/Vitest failure output to understand what actually broke. The signal is buried in 40 lines of red text. Every developer has lost 5 minutes staring at a test output that could be summarized in one sentence.
- **How Glass uniquely enables it** — Glass reads the terminal feed live and already parses output. When it detects a test failure pattern, it can automatically run "explain what broke and where" without the user doing anything. The fix surfaces before they've even finished reading the error.
- **Strip format** — Background behavior → compact card in strip when failures detected; click to expand the full decoder
- **Build complexity** — Medium (uses live terminal feed + pattern detection + AI parse)

**34. Focus Drift Guard**
- **The friction it kills** — Distraction is the silent enemy of build sessions. A 2-minute YouTube break becomes 25 minutes. No tool catches this because no tool can see across all apps.
- **How Glass uniquely enables it** — Glass already tracks which app is in front and for how long (activeApp + timestamps). When it detects a drift to a non-work app (YouTube, Twitter, news) during an active session, it shows a gentle non-blocking nudge: "Still building [X]?" — then disappears. Never intrusive. Always aware.
- **Strip format** — Background behavior → subtle overlay notification, auto-dismisses after 5 seconds
- **Build complexity** — Low (Glass already tracks activeApp with session state)

**35. Stack Card**
- **The friction it kills** — Cold start tax when opening a project you haven't touched in two days. First 15 minutes: what's the dev command? Which port? What's the database called? Where did I leave off?
- **How Glass uniquely enables it** — When Glass sees a `cd` into a new directory in the terminal, it reads the key manifest files (package.json, requirements.txt, Cargo.toml, .env.example) and surfaces a "Stack Card" immediately: tech stack, start command, env vars needed, last known working status. Everything in one glance.
- **Strip format** — Status indicator → collapsible "Stack" card appears in strip automatically on project switch
- **Build complexity** — Medium (terminal CD detection + file reads + summarization)

**36. AI Spend Tracker**
- **The friction it kills** — No visibility into how much you're actually spending across 5 different AI tools in a day. Developers using Claude API + Cursor + ChatGPT Plus + Midjourney have no idea where the money goes until the invoice hits.
- **How Glass uniquely enables it** — Glass sees every app in use and can monitor network traffic (with user consent) to detect API calls to known AI providers. It tracks approximate token spend by correlating call patterns to known pricing. Only an OS-layer tool sees ALL the AI usage across every app simultaneously.
- **Strip format** — Status indicator in strip (running $ total, glows amber near a configured budget threshold)
- **Build complexity** — High (requires network monitoring + provider recognition + usage estimation)

**37. Repeat Error Detector**
- **The friction it kills** — Error repetition: solving the same class of error from scratch every time across projects. CORS, TypeScript type mismatches, missing env vars, rate limit 429s — every developer has fixed the same 5 errors 50 times.
- **How Glass uniquely enables it** — Glass has cross-session memory of terminal errors. When a new error appears in the terminal, Glass checks its error vault silently. If it's seen this pattern before, it instantly shows "You've solved this before" with the previous fix — before you even open a browser tab.
- **Strip format** — Background behavior → surfaces on terminal error detection; shows "seen before" badge with one-click "show previous fix"
- **Build complexity** — High (error classification + cross-session memory vault lookup + pattern matching)

**38. Live Dependency Watcher**
- **The friction it kills** — Installing packages from AI suggestions or StackOverflow without checking security. A compromised npm package can end a project or expose users — and nobody checks every install.
- **How Glass uniquely enables it** — Glass reads every terminal command passively. When it sees `npm install`, `pip install`, or `bun add`, it silently checks the package name against known vulnerability databases. An amber dot appears in the strip if something risky lands. No setup, no pre-commit hook, no plugin — just always watching.
- **Strip format** — Status indicator → amber/red dot appears on risky install detection; click to see CVE details
- **Build complexity** — High (terminal command parsing + vulnerability DB integration)

**39. Multi-AI Response Comparator**
- **The friction it kills** — Experienced builders know that different AI models give radically different answers to the same prompt — especially for architecture decisions, debugging hard problems, or writing critical code. But switching between Claude, GPT-4, and Gemini manually is a multi-tab nightmare.
- **How Glass uniquely enables it** — Power Prompt Generator is already built. This extends it: after generating a prompt, one click sends it to multiple models simultaneously (via their APIs in the API Key Manager) and shows the responses side by side in the panel. Glass already has the keys, the prompt, and the context.
- **Strip format** — Panel tab (extends Power Prompt Generator panel with a "Compare" mode toggle)
- **Build complexity** — Medium (uses existing API Key Manager + promptGenerate IPC + parallel calls)

**40. Silent Session Debrief**
- **The friction it kills** — Cold start tax the next day. You come back to a project after 16 hours and spend 20 minutes remembering what was broken, what you were trying, and what's next. A 3-minute debrief at the end of a session would save that time — but nobody does it because it means stopping to write it.
- **How Glass uniquely enables it** — Glass already records session events, terminal errors, AI exchanges, and clipboard activity throughout a build session. When the user closes their laptop or goes idle for 30 minutes, Glass automatically generates a debrief from everything it saw — what was worked on, what broke, what was fixed, what's unfinished. Ready to read the next morning.
- **Strip format** — Background behavior → generates automatically on session end; shows as a "Resume" card the next time the strip opens
- **Build complexity** — Medium (uses existing session recording + summarization via IIVO API)
