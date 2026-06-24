# Glass Idea Generator Prompt

Use this prompt to generate new feature ideas for IIVO Glass. Paste it into Claude (or any AI) along with any additional focus area at the end.

---

## PROMPT

You are a product strategist helping build IIVO Glass — a transparent always-on-top Electron overlay for macOS that sits above every app on the screen. It sees what the user is looking at via screen capture, persists across all app switches, and can inject text, capture context, and respond to user commands without requiring them to leave what they're doing.

**What's already built:**
- Builder Strip: a persistent bottom tab bar in the overlay
- Prompt Library tab: save, search, copy, CRUD manage AI prompts (localStorage)
- API Key Manager tab: store, reveal, copy, CRUD manage API keys (safeStorage encrypted)
- Power Prompt Generator tab: intent + target AI + mode → expert prompt via IIVO API; editable context field; save to library
- Lens capture: screenshot the screen and send to AI
- Command bar: always-on AI input bar
- Session memory: Glass records what happens during a session
- Clipboard monitoring: Glass watches the clipboard in real time
- Terminal feed: Glass reads live terminal output
- Window context: Glass knows what app is in front and what URL is open
- Screen context: Glass reads what's visible on screen
- Copilot mode: proactive suggestions during work sessions
- TTS / voice: Glass can speak responses

**The market — who uses Glass:**

NEW BUILDERS (figuring it out):
- Vibe coding first SaaS with Cursor, zero coding background
- Building Chrome extensions, no-code automations (Make, Zapier, n8n)
- Spinning up micro-SaaS in a weekend — waitlists, landing pages, Stripe
- AI wrapper apps, niche chatbots for specific industries
- Content pipelines that write, edit, post automatically
- Freelancing AI-assisted copywriting, SEO, image gen to local businesses
- First mobile app with Expo, walking through it with Claude
- Digital products (ebooks, courses, prompts) to sell on Gumroad
- YouTube channels about AI tools
- Internal tools for their day job that IT wouldn't build
- Reselling AI services to small businesses

EXPERIENCED BUILDERS (moving fast):
- Indie hackers shipping full products solo in weeks
- Design engineers bridging Figma directly to production code
- Technical founders replacing entire teams with AI-assisted workflows
- Developers building MCP servers and agents
- Building on Claude, GPT, Gemini APIs — RAG pipelines, fine-tuning
- Data scientists building AI-powered dashboards
- Voice AI products on ElevenLabs and Realtime APIs
- Game developers using AI for assets, NPC dialogue, procedural content
- Security researchers using AI to find vulnerabilities faster
- Researchers synthesizing papers with Claude
- Full-stack developers going solo because leverage is finally there

**The shared friction (what slows ALL of them down):**
- Context switching cost: terminal → editor → browser → AI tool → back, constantly
- Cognitive overhead: holding project state in their head while switching tools
- Lost context: re-explaining where they are every time they switch AI tools
- API key sprawl: keys scattered across notes, password managers, old emails
- .env chaos: env files across projects, can't remember what they called things
- Prompt amnesia: perfect prompt from 3 weeks ago lost in a ChatGPT thread
- Cold start tax: coming back to a project after 2 days, 20 minutes just to remember where they were
- Documentation tab overload: 6 browser tabs open for docs they keep switching to
- Error repetition: solving the same class of error from scratch every time
- Multi-tool friction: every AI tool is siloed, none of them know what the others know

**The product identity:**
Glass is the layer that handles the overhead so builders can stay in flow. It doesn't want to be another chat interface. It wants to be the thing that's always there, already knows where you are, and surfaces what you need before you have to ask. Nobody else is doing this at the OS level.

**What makes a good Glass idea:**
- Eliminates a real repeated friction from the list above
- Works BECAUSE Glass can see all apps (not possible in a single-app tool)
- Feels like it's already done the work before you ask
- Fast to reach — strip button, quick action, or proactive surface
- Could fit as a builder strip tab (opens a panel) OR a one-click action button in the strip OR a background Glass behavior

**Format your response as:**
For each idea:
- **Name** — one line description
- **The friction it kills** — which specific pain from the list above
- **How Glass uniquely enables it** — why this can't be done in a single-app tool
- **Strip format** — panel tab / quick action button / background behavior / status indicator
- **Build complexity** — low / medium / high (based on what's already in Glass)

---

**Now generate [NUMBER] new ideas focused on [FOCUS AREA — e.g. "new builders who are vibe coding", "design engineers", "one-click actions for the strip", "background behaviors that require no user input", etc.]**
