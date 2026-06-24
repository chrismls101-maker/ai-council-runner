/** Lightweight FAQ for the activation key-wait manifestation — no agents, no screen context. */

const ANSWERS: Array<{ match: RegExp; answer: string }> = [
  {
    match: /paste|where.*(key|paste)|find.*key|copy/i,
    answer:
      "In Anthropic's console, click Create Key, copy the full string starting with sk-ant-, then press I'm ready and paste it into the field.",
  },
  {
    match: /charge|bill|cost|pay|price|markup/i,
    answer:
      "Glass doesn't charge you for API usage. Anthropic bills your account directly for the Claude requests Glass makes.",
  },
  {
    match: /what.*(api\s*key|key)|api\s*key.*what/i,
    answer:
      "An API key is a private password that lets Glass talk to Claude on your behalf. You create it in your Anthropic account and keep it secret.",
  },
  {
    match: /how\s*long|minutes|time/i,
    answer:
      "Creating a key usually takes about two minutes — sign in to Anthropic, create a key, and copy it.",
  },
  {
    match: /anthropic|console|browser|website/i,
    answer:
      "Anthropic's console is where you manage API keys for Claude. I opened it in your default browser when you clicked Get a key.",
  },
  {
    match: /safe|secure|trust|privacy/i,
    answer:
      "Your key is stored encrypted on this Mac. Glass never sends it to us — only to Anthropic when you ask Glass to use Claude.",
  },
  {
    match: /openai|groq|other\s*provider/i,
    answer:
      "You only need Anthropic to get started. You can add OpenAI, Groq, and other providers later in Settings.",
  },
];

const FALLBACK =
  "Create a key at console.anthropic.com, copy the sk-ant- string, press I'm ready, and paste it here. Anthropic bills you directly — Glass doesn't mark it up.";

export function answerActivationHelp(question: string): string {
  const trimmed = question.trim();
  if (!trimmed) return FALLBACK;
  for (const { match, answer } of ANSWERS) {
    if (match.test(trimmed)) return answer;
  }
  return FALLBACK;
}
