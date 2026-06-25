/**
 * Local Glass error FAQ — instant answers for known Glass error messages.
 *
 * When a user copies an error card and pastes it into the command bar, this
 * module intercepts it before the server round-trip and returns a specific,
 * actionable explanation.
 *
 * Detection works in two ways:
 *  1. The copy button appends "Paste this into the Glass command bar to get help."
 *     so we strip that suffix and match the extracted error text.
 *  2. Raw error text typed directly is also matched.
 */

export interface GlassErrorAnswer {
  /** Short title for the answer card. */
  title: string;
  /** Full explanation and fix steps. */
  body: string;
}

/** Sentinel appended by the error card copy button. */
export const GLASS_ERROR_COPY_SUFFIX = "Paste this into the Glass command bar to get help.";

interface GlassFAQEntry {
  pattern: RegExp;
  answer: GlassErrorAnswer;
}

const FAQ: GlassFAQEntry[] = [
  // ─── Glass terminal (PTY) ──────────────────────────────────────────────────
  {
    pattern: /posix_spawnp failed|glass terminal could not start|glass terminal failed to start/i,
    answer: {
      title: "Glass terminal could not start",
      body: `The built-in dock terminal could not spawn your shell.

**Most common fix (macOS):** node-pty's \`spawn-helper\` binary lost its executable permission during install.

1. Run: \`npm run postinstall --prefix glass-app\`
2. Restart Glass (\`npm run glass:dev\`)
3. Open the dock terminal again (\`>_\`)

**If that doesn't work:**
- Confirm your shell exists: \`echo $SHELL\` (usually \`/bin/zsh\`)
- Quit and reopen Glass completely
- Reinstall deps: \`npm install\` from the repo root`,
    },
  },

  // ─── System audio: no signal ───────────────────────────────────────────────
  {
    pattern: /no system.audio signal detected|no.*system.audio.*signal|blackhole.*loopback.*audio is playing/i,
    answer: {
      title: "No system audio signal",
      body: `Glass isn't receiving any audio from your computer's output.

**Why it happens:** Glass uses a virtual audio device (BlackHole or Loopback) to capture what your Mac is playing. If nothing is routed through that device, Glass sees silence.

**How to fix it:**
1. Open **Audio MIDI Setup** (Applications → Utilities).
2. Create or select a **Multi-Output Device** that includes both your speakers/headphones and BlackHole 2ch.
3. Set that Multi-Output Device as your Mac's **Sound Output** (System Settings → Sound → Output).
4. Make sure something is actually playing — Glass needs audio in the stream.
5. In Glass Settings → STT, confirm the system audio source is set to BlackHole.

If you have Loopback instead of BlackHole, create a virtual device there that passes your Mac audio through.`,
    },
  },

  // ─── Microphone: no signal ─────────────────────────────────────────────────
  {
    pattern: /no microphone signal detected|microphone signal.*check your input/i,
    answer: {
      title: "No microphone signal",
      body: `Glass received a silent chunk from your microphone.

**Why it happens:** Either your mic isn't being picked up or you weren't speaking during the recording window.

**How to fix it:**
1. Check **System Settings → Privacy & Security → Microphone** — make sure IIVO Glass is listed and allowed.
2. Open **System Settings → Sound → Input** and confirm your microphone is selected and the input level moves when you speak.
3. Speak clearly during the listening window — Glass processes audio in chunks, so short silences between chunks are fine but the whole chunk shouldn't be empty.
4. If using an external mic, check that it's plugged in and selected as the default input.`,
    },
  },

  // ─── STT not configured ────────────────────────────────────────────────────
  {
    pattern: /transcription is not configured|openai transcription is not configured|IIVO_GLASS_OPENAI_API_KEY|set.*openai.*key/i,
    answer: {
      title: "STT not configured",
      body: `Glass captured audio but has no transcription provider set up.

**Why it happens:** Glass uses OpenAI Whisper (or an IIVO server) to transcribe audio. No API key is configured.

**How to fix it (direct OpenAI):**
1. Get an API key from platform.openai.com/api-keys.
2. Open the \`glass-app/.env\` file (create it if it doesn't exist).
3. Add: \`IIVO_GLASS_OPENAI_API_KEY=sk-...\`
4. Restart Glass.

**How to fix it (IIVO server):**
1. Make sure your IIVO server is running (\`npm run dev\` in the server project).
2. Set \`IIVO_API_URL=http://127.0.0.1:3001\` in your \`.env\`.
3. Restart Glass.`,
    },
  },

  // ─── STT server unavailable ────────────────────────────────────────────────
  {
    pattern: /iivo transcription server unavailable|transcription server unavailable|start npm run dev/i,
    answer: {
      title: "IIVO transcription server unavailable",
      body: `Glass is configured to use the IIVO server for transcription, but can't reach it.

**Why it happens:** The IIVO backend isn't running, or the URL is wrong.

**How to fix it:**
1. Start your IIVO server: \`npm run dev\` in the server directory.
2. Check that \`IIVO_API_URL\` in \`glass-app/.env\` points to the correct address (default: \`http://127.0.0.1:3001\`).
3. Alternatively, bypass the server entirely by setting a direct OpenAI key:
   \`IIVO_GLASS_OPENAI_API_KEY=sk-...\` in \`glass-app/.env\`, then restart.`,
    },
  },

  // ─── Transcription failed (system audio) ───────────────────────────────────
  {
    pattern: /system audio captured audio but transcription failed|system audio.*transcription failed/i,
    answer: {
      title: "System audio transcription failed",
      body: `Glass captured system audio but the transcription step failed.

**Common causes and fixes:**

**Invalid or expired OpenAI key:**
Check \`IIVO_GLASS_OPENAI_API_KEY\` in \`glass-app/.env\`. Visit platform.openai.com to verify the key is active.

**Rate limit (429):**
Your OpenAI account has hit its usage limit. Add billing at platform.openai.com or wait for the limit to reset.

**Audio too short or corrupted:**
If the audio chunk is less than a few hundred milliseconds, Whisper rejects it. This can happen if the audio device connects slowly. Try clicking Translate again after the video is already playing.

**No credit on OpenAI account:**
Check your usage at platform.openai.com/usage — you may need to add a payment method.`,
    },
  },

  // ─── Transcription failed (microphone) ────────────────────────────────────
  {
    pattern: /microphone captured audio but transcription failed|microphone.*transcription failed/i,
    answer: {
      title: "Microphone transcription failed",
      body: `Glass captured microphone audio but the transcription step failed.

**Common causes and fixes:**

**Invalid or expired OpenAI key:**
Check \`IIVO_GLASS_OPENAI_API_KEY\` in \`glass-app/.env\`. Visit platform.openai.com to verify the key is active and has credit.

**Rate limit (429):**
Your OpenAI account has hit its usage limit. Add billing at platform.openai.com or wait for the limit to reset.

**Microphone permissions revoked mid-session:**
Check **System Settings → Privacy & Security → Microphone** and re-grant access to Glass, then restart.`,
    },
  },

  // ─── Screen capture failed / permissions ──────────────────────────────────
  {
    pattern: /screen capture|screen recording permission|empty image|permission.*screen/i,
    answer: {
      title: "Screen capture permission",
      body: `Glass can't capture your screen.

**How to fix it:**
1. Open **System Settings → Privacy & Security → Screen Recording**.
2. Make sure IIVO Glass is listed and enabled. If it's not listed, click the + button and add it.
3. If it was already enabled, toggle it off and back on, then restart Glass.
4. macOS sometimes requires a full restart after granting screen recording permissions.`,
    },
  },

  // ─── Send to IIVO / Open in IIVO failed ───────────────────────────────────
  {
    pattern: /send to iivo failed|open in iivo failed|iivo.*failed/i,
    answer: {
      title: "IIVO connection failed",
      body: `Glass couldn't connect to the IIVO server to send data.

**How to fix it:**
1. Make sure your IIVO server is running (\`npm run dev\`).
2. Check \`IIVO_API_URL\` in \`glass-app/.env\` — it should match your server address (e.g. \`http://127.0.0.1:3001\`).
3. Check \`GLASS_API_SECRET\` matches on both the Glass desktop app and the server.
4. Try restarting both the IIVO server and Glass.`,
    },
  },

  // ─── Context Bridge upload failed ─────────────────────────────────────────
  {
    pattern: /context bridge upload failed/i,
    answer: {
      title: "Context Bridge upload failed",
      body: `Glass couldn't upload your context to the IIVO server.

**How to fix it:**
1. Make sure your IIVO server is running and reachable.
2. Check your network connection.
3. If the file is very large, try capturing a smaller region of your screen.
4. Restart Glass and try again.`,
    },
  },

  // ─── No transcript to send ────────────────────────────────────────────────
  {
    pattern: /no transcript text to send/i,
    answer: {
      title: "No transcript to send",
      body: `Glass tried to send a transcript but nothing has been transcribed yet.

**How to fix it:**
1. Start listening first (microphone or system audio) and get at least a few words transcribed.
2. Then use Send to IIVO — it includes the recent transcript in the session context.
3. If you just started a session, speak a few words or play audio so Glass has something to work with.`,
    },
  },

  // ─── Session / send session failed ────────────────────────────────────────
  {
    pattern: /send session failed|session.*failed.*sync/i,
    answer: {
      title: "Session sync failed",
      body: `Glass couldn't sync your session to the IIVO server.

**How to fix it:**
1. Check that your IIVO server is running.
2. Verify \`IIVO_API_URL\` and \`GLASS_API_SECRET\` are set correctly in \`glass-app/.env\`.
3. Try pausing the session, waiting a few seconds, then resuming — Glass will retry.
4. If the session data is important, it's saved locally and will retry automatically on next startup.`,
    },
  },

  // ─── Analysis failed ──────────────────────────────────────────────────────
  {
    pattern: /analysis.*failed|failed.*analysis|debrief.*failed|insight.*failed/i,
    answer: {
      title: "AI analysis failed",
      body: `Glass couldn't complete the AI analysis (debrief/insights).

**Common causes:**
- The IIVO server is down or unreachable.
- Your session was too short or had no transcript for the AI to work with.
- A temporary API rate limit on the server side.

**How to fix it:**
1. Make sure your IIVO server is running and the API keys on the server are valid.
2. Try again in a moment — if it was a rate limit, it clears quickly.
3. If the session was short, add more context (transcript, captures) before asking for analysis.`,
    },
  },
];

/**
 * Check if a command bar prompt is a pasted Glass error (from our copy button)
 * and return a local answer if we recognise it. Returns null for unknown prompts.
 */
export function lookupGlassErrorAnswer(rawPrompt: string): GlassErrorAnswer | null {
  const text = rawPrompt.trim();

  // Strip our copy-button suffix to get the bare error text.
  const bareError = text.endsWith(GLASS_ERROR_COPY_SUFFIX)
    ? text.slice(0, text.lastIndexOf(GLASS_ERROR_COPY_SUFFIX)).replace(/\n+$/, "").trim()
    : text;

  // Only attempt FAQ matching when the prompt looks like a Glass error copy.
  // (Either it had the suffix, or it starts with "Error:" — direct paste of title+message.)
  const looksLikeGlassError =
    text.includes(GLASS_ERROR_COPY_SUFFIX) ||
    /^Error:/i.test(bareError);

  if (!looksLikeGlassError) return null;

  for (const entry of FAQ) {
    if (entry.pattern.test(bareError)) {
      return entry.answer;
    }
  }

  // Fallback for unrecognised Glass errors: give generic diagnostic guidance.
  return {
    title: "Glass error",
    body: `Here are the most common places to check for Glass errors:

**STT / Transcription issues:**
- Verify \`IIVO_GLASS_OPENAI_API_KEY\` in \`glass-app/.env\` is set and valid (platform.openai.com/api-keys).
- Make sure the IIVO server is running if you're using server-side STT.

**System audio issues:**
- Confirm BlackHole or Loopback is installed and your Mac output is routed through it.
- Open Audio MIDI Setup and check your Multi-Output Device.

**Permissions:**
- System Settings → Privacy & Security → Microphone / Screen Recording — ensure Glass has access.

**Server connection:**
- \`IIVO_API_URL\` and \`GLASS_API_SECRET\` must match between \`glass-app/.env\` and your server.

Restart Glass after any .env changes.`,
  };
}
