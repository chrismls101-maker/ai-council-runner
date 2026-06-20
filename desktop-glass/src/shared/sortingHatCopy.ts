import type { GlassUiLocale } from "./glassLocale.ts";

export type PersonaId = "developer" | "sales" | "operator" | "writer" | "general";

export interface SortingHatCopy {
  welcomeLine: string;
  glassIntroLine: string;
  nameQuestionLine: string;
  q1Line: string;
  q1HelpLine: string;
  q1Disclaimer: string;
  qaGateLine: string;
  qaNudgeLine: string;
  builderPaletteIntroLine: string;
  personaRevealFallbacks: Record<PersonaId, string>;
  personaPowerStackFallbacks: Record<PersonaId, string>;
  niceToMeetYou: (firstName: string) => string;
  continueButton: string;
  skipButton: string;
  skipAriaLabel: string;
  inputAriaLabel: string;
  placeholderName: string;
  placeholderQa: string;
  placeholderAnswer: string;
  paletteTitle: string;
  paletteSubtitle: string;
  paletteRevealTitle: string;
  paletteRevealTagline: string;
  paletteEnterGlass: string;
  paletteComingSoon: string;
  voiceListeningHint: string;
}

const EN_COPY: SortingHatCopy = {
  welcomeLine: "Welcome. Your ambient intelligence layer is now active.",
  glassIntroLine:
    "Glass works at the OS level — with your permission, it sees what you see, thinks alongside you, and shapes itself to how you work.",
  nameQuestionLine: "Before we go further — what should I call you?",
  q1Line:
    "Describe what you do and what you're working on — Glass uses this to load your power stack, the tools built for your kind of work. The more honest you are, the better your fit.",
  q1HelpLine:
    "Take your time. And if you're not sure where you land, just ask — I can help you figure it out. I'll be right here.",
  q1Disclaimer: "Not sure where you fit? Ask me — I'll help you find your place.",
  qaGateLine:
    "Before we move on — is there anything you'd like to know about Glass? I can walk you through what it does, what your power stack means, anything really. Or just type 'continue' when you're ready for your reveal.",
  qaNudgeLine: "Anything else, or shall we move on to your reveal?",
  builderPaletteIntroLine:
    "Here's your power stack — everything Glass built for builders like you. Take a look, then enter when you're ready.",
  personaRevealFallbacks: {
    developer: "You are a Builder. You think in systems, move in code.",
    sales: "You are a Closer. You read rooms, move people, make things happen.",
    operator: "You are an Operator. You build the systems others rely on.",
    writer: "You are a Creator. You shape ideas into words that move the world.",
    general:
      "You are an Explorer. Glass is active — your power stack will sharpen as more paths open.",
  },
  personaPowerStackFallbacks: {
    developer:
      "Your power stack is built for builders — live context on your code, terminal, and designs; agents that understand your repo without pasted files; and tools that move at the speed of a shipping engineer. Glass stays out of the way until you need it, then meets you inside the work.",
    sales:
      "Your power stack reads the room with you — live meeting intelligence, deal context from what's on your screen, and prompts tuned for pipeline, conversations, and follow-through. Glass catches what you might miss in a call and helps you respond while the moment is still live.",
    operator:
      "Your power stack is for running systems — cross-app context on decisions in flight, meeting and project intelligence, and proactive nudges when something on screen needs a call. Glass holds the operational picture so you can execute without juggling twelve tabs in your head.",
    writer:
      "Your power stack is tuned for creators — research from what's open, drafting support in context, and intelligence that follows your ideas across docs, notes, and references. Glass reduces the friction between thinking and getting words out the door.",
    general:
      "Your power stack starts broad — screen-aware assistance, listening modes, and tools that adapt as Glass learns how you actually work. The more time you spend with it, the sharper and more specific your stack becomes.",
  },
  niceToMeetYou: (firstName) => `Nice to meet you, ${firstName}.`,
  continueButton: "Continue",
  skipButton: "Skip",
  skipAriaLabel: "Skip onboarding",
  inputAriaLabel: "Your answer to IIVO",
  placeholderName: "Your name…",
  placeholderQa: "Ask me anything, or type 'continue' when you're ready…",
  placeholderAnswer: "Type your answer…",
  paletteTitle: "Power Stack Palette",
  paletteSubtitle: "G L A S S",
  paletteRevealTitle: "You are a Builder.",
  paletteRevealTagline: "You think in systems, move in code.",
  paletteEnterGlass: "E N T E R   G L A S S",
  paletteComingSoon: "Coming soon",
  voiceListeningHint: "Listening — speak your answer",
};

const ES_COPY: SortingHatCopy = {
  welcomeLine: "Bienvenido. Tu capa de inteligencia ambiental ya está activa.",
  glassIntroLine:
    "Glass funciona a nivel del sistema operativo — con tu permiso, ve lo que ves, piensa contigo y se adapta a tu forma de trabajar.",
  nameQuestionLine: "Antes de continuar — ¿cómo debería llamarte?",
  q1Line:
    "Describe lo que haces y en qué estás trabajando — Glass usa esto para cargar tu power stack, las herramientas creadas para tu tipo de trabajo. Cuanto más honesto seas, mejor será tu ajuste.",
  q1HelpLine:
    "Tómate tu tiempo. Y si no estás seguro de dónde encajas, solo pregúntame — puedo ayudarte a descubrirlo. Estaré aquí.",
  q1Disclaimer: "¿No sabes dónde encajas? Pregúntame — te ayudo a encontrar tu lugar.",
  qaGateLine:
    "Antes de seguir — ¿hay algo que quieras saber sobre Glass? Puedo explicarte qué hace, qué significa tu power stack, lo que necesites. O escribe 'continuar' cuando estés listo para tu revelación.",
  qaNudgeLine: "¿Algo más, o pasamos a tu revelación?",
  builderPaletteIntroLine:
    "Aquí está tu power stack — todo lo que Glass construyó para builders como tú. Échale un vistazo y entra cuando estés listo.",
  personaRevealFallbacks: {
    developer: "Eres un Builder. Piensas en sistemas, te mueves en código.",
    sales: "Eres un Closer. Lees el ambiente, mueves a las personas, haces que las cosas pasen.",
    operator: "Eres un Operator. Construyes los sistemas de los que otros dependen.",
    writer: "Eres un Creator. Transformas ideas en palabras que mueven al mundo.",
    general:
      "Eres un Explorer. Glass está activo — tu power stack se afilará a medida que se abran más caminos.",
  },
  personaPowerStackFallbacks: {
    developer:
      "Tu power stack está hecho para builders — contexto en vivo sobre tu código, terminal y diseños; agentes que entienden tu repo sin pegar archivos; y herramientas que van al ritmo de un ingeniero que entrega. Glass se mantiene fuera del camino hasta que lo necesitas, y entonces se encuentra contigo dentro del trabajo.",
    sales:
      "Tu power stack lee la sala contigo — inteligencia de reuniones en vivo, contexto de negocios desde lo que tienes en pantalla y prompts afinados para pipeline, conversaciones y seguimiento. Glass detecta lo que podrías perder en una llamada y te ayuda a responder mientras el momento sigue vivo.",
    operator:
      "Tu power stack es para operar sistemas — contexto entre apps sobre decisiones en curso, inteligencia de reuniones y proyectos, y avisos proactivos cuando algo en pantalla necesita una decisión. Glass sostiene el panorama operativo para que ejecutes sin hacer malabarismos con doce pestañas en la cabeza.",
    writer:
      "Tu power stack está afinado para creadores — investigación desde lo que tienes abierto, apoyo de redacción en contexto e inteligencia que sigue tus ideas entre documentos, notas y referencias. Glass reduce la fricción entre pensar y sacar las palabras.",
    general:
      "Tu power stack empieza amplio — asistencia consciente de la pantalla, modos de escucha y herramientas que se adaptan mientras Glass aprende cómo trabajas. Cuanto más tiempo pases con él, más específico se vuelve tu stack.",
  },
  niceToMeetYou: (firstName) => `Mucho gusto, ${firstName}.`,
  continueButton: "Continuar",
  skipButton: "Omitir",
  skipAriaLabel: "Omitir onboarding",
  inputAriaLabel: "Tu respuesta para IIVO",
  placeholderName: "Tu nombre…",
  placeholderQa: "Pregúntame lo que quieras, o escribe 'continuar' cuando estés listo…",
  placeholderAnswer: "Escribe tu respuesta…",
  paletteTitle: "Paleta Power Stack",
  paletteSubtitle: "G L A S S",
  paletteRevealTitle: "Eres un Builder.",
  paletteRevealTagline: "Piensas en sistemas, te mueves en código.",
  paletteEnterGlass: "E N T R A R   A   G L A S S",
  paletteComingSoon: "Próximamente",
  voiceListeningHint: "Escuchando — di tu respuesta",
};

export function getSortingHatCopy(locale: GlassUiLocale): SortingHatCopy {
  if (locale === "es") return ES_COPY;
  return EN_COPY;
}

export function looksLikeOnboardingDone(text: string, locale: GlassUiLocale): boolean {
  const t = text.trim().toLowerCase().replace(/[.!,]+$/, "");
  if (locale === "es") {
    return /^(continuar|continua|siguiente|listo|lista|no|nop|avanza|omitir|proceder|estoy bien|eso es todo|hecho|revelar|revelación|sí|si|claro|vale|ok|okay|nada|sin preguntas|no tengo preguntas|estoy listo|estoy lista|vamos|adelante|muéstrame|muestrame)$/.test(
      t,
    );
  }
  return /^(continue|let'?s go|go|ready|no|nope|nah|move on|skip|proceed|i'?m good|that'?s (all|it)|done|next|show me|reveal( it)?|yes( please)?|sure|all good|good|ok|okay|yep|yup|nothing|no (more )?questions?|i'?m (all )?set)$/i.test(
    t,
  );
}

export function extractOnboardingName(input: string, locale: GlassUiLocale): string {
  const t = input.trim().toLowerCase();
  const patterns =
    locale === "es"
      ? [
          /^(?:puedes\s+)?llamarme\s+/,
          /^me\s+llamo\s+/,
          /^soy\s+/,
          /^mi\s+nombre\s+(?:es\s+)?/,
          /^me\s+dicen\s+/,
        ]
      : [
          /^(?:you\s+can\s+)?(?:just\s+)?call\s+me\s+/,
          /^my\s+name(?:'?s|\s+is)?\s+/,
          /^i(?:'?m|\s+am)\s+/,
          /^i\s+go\s+by\s+/,
          /^(?:people|they|everyone)\s+call(?:s)?\s+me\s+/,
          /^(?:it'?s?|the\s+name(?:'?s|\s+is)?)\s+/,
        ];

  let stripped = t;
  for (const pattern of patterns) {
    stripped = stripped.replace(pattern, "");
  }
  stripped = stripped.trim();
  const word = stripped.split(/\s+/)[0]?.replace(/[^\w'-]/g, "") ?? "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function buildPersonaPrompt(answers: string[], locale: GlassUiLocale): string {
  const lines = answers.map((a, i) => `Answer ${i + 1}: ${a}`).join("\n");
  if (locale === "es") {
    return (
      `Eres un clasificador de persona para Glass — una capa de inteligencia ambiental a nivel de SO.\n` +
      `Un usuario describió lo que hace y en qué trabaja. Clasifica qué persona encaja mejor según su RESULTADO PRINCIPAL y su trabajo diario.\n\n` +
      `${lines}\n\n` +
      `Responde SOLO con JSON válido — sin markdown, sin explicación:\n` +
      `{ "persona": "developer" | "sales" | "operator" | "writer" | "general", "confidence": 0.0-1.0, "reveal": "<string>", "powerStack": "<string>" }\n\n` +
      `Definiciones:\n` +
      `  developer — ingenieros, coders, builders, fundadores técnicos. Resultado: software funcionando.\n` +
      `  sales — ventas, BD, cuentas, customer success. Resultado: deals cerrados, pipeline.\n` +
      `  operator — ops, producto, PM, fundadores que operan sistemas. Resultado: decisiones, ejecución.\n` +
      `  writer — escritores, creadores, investigadores, marketing. Resultado: palabras, ideas, contenido.\n` +
      `  general — mixto, poco claro, o no encaja en una sola categoría.\n\n` +
      `Reglas:\n` +
      `- Si el usuario dice explícitamente que es developer, ingeniero o coder, clasifica "developer" salvo contradicción clara.\n` +
      `- Con una respuesta y confidence < 0.60, haz UNA pregunta de seguimiento: confidence 0 y la pregunta en "reveal".\n` +
      `- Con dos respuestas, siempre clasifica — usa "general" si sigue poco claro.\n` +
      `- "reveal": frase dramática que empiece con "Eres" (en español), específica a sus palabras.\n` +
      `- "powerStack": 2-3 frases habladas sobre qué hará su power stack de Glass para ellos. Cálido, concreto, sin precios ni fechas.`
    );
  }
  return (
    `You are a persona classifier for Glass — an ambient OS-level intelligence layer.\n` +
    `A user described what they do and what they're currently working on. Classify which persona fits them best based on their PRIMARY output and day-to-day work.\n\n` +
    `${lines}\n\n` +
    `Respond ONLY with valid JSON — no markdown, no explanation, nothing else:\n` +
    `{ "persona": "developer" | "sales" | "operator" | "writer" | "general", "confidence": 0.0-1.0, "reveal": "<string>", "powerStack": "<string>" }\n\n` +
    `Persona definitions:\n` +
    `  developer — engineers, coders, builders, technical founders. Output: working software.\n` +
    `  sales     — sales, BD, account management, customer success. Output: closed deals, pipeline.\n` +
    `  operator  — ops, product, project management, founders running systems. Output: decisions, execution.\n` +
    `  writer    — writers, content creators, researchers, marketers. Output: words, ideas, content.\n` +
    `  general   — genuinely mixed, unclear, or doesn't fit a single category.\n\n` +
    `Rules:\n` +
    `- If the user explicitly says they are a developer, engineer, or coder, classify as "developer" unless their described output clearly contradicts it.\n` +
    `- If you have one answer and confidence < 0.60, ask one clarifying follow-up: set "confidence" to 0 and put the follow-up question in "reveal".\n` +
    `- If you have two answers, always classify — use "general" if still unclear, never ask another question.\n` +
    `- When classifying, write a short dramatic reveal sentence in "reveal" that starts with "You are" and is specific to their actual words.\n` +
    `- In "powerStack", write 2-3 spoken sentences explaining what their Glass power stack will do for them specifically.`
  );
}

export function inferPersonaFromAnswers(
  answers: string[],
  copy: SortingHatCopy,
): { persona: PersonaId; confidence: number; reveal: string; powerStack?: string } | null {
  const text = answers.join(" ").toLowerCase();
  const score: Record<PersonaId, number> = {
    developer: 0,
    sales: 0,
    operator: 0,
    writer: 0,
    general: 0,
  };

  const rules: Array<{ persona: PersonaId; patterns: RegExp[] }> = [
    {
      persona: "developer",
      patterns: [
        /\bdeveloper\b/,
        /\bengineer(?:ing)?\b/,
        /\bcoder\b/,
        /\bcoding\b/,
        /\bprogrammer\b/,
        /\bsoftware\b/,
        /\bfull[\s-]?stack\b/,
        /\bfrontend\b/,
        /\bbackend\b/,
        /\btypescript\b/,
        /\bjavascript\b/,
        /\breact\b/,
        /\bdevops\b/,
        /\bingenier[oa]\b/,
        /\bdesarrollador\b/,
        /\bprogramador\b/,
        /\bcódigo\b/,
        /\bcode\b/,
      ],
    },
    {
      persona: "sales",
      patterns: [
        /\bsales\b/,
        /\baccount exec/,
        /\bcloser\b/,
        /\bpipeline\b/,
        /\bventas\b/,
        /\bcomercial\b/,
      ],
    },
    {
      persona: "operator",
      patterns: [
        /\boperator\b/,
        /\bproduct manager\b/,
        /\bproject manager\b/,
        /\boperations\b/,
        /\boperaciones\b/,
        /\bproducto\b/,
      ],
    },
    {
      persona: "writer",
      patterns: [
        /\bwriter\b/,
        /\bwriting\b/,
        /\bcontent creator\b/,
        /\bcopywriter\b/,
        /\bescritor\b/,
        /\bcontenido\b/,
        /\bredactor\b/,
      ],
    },
  ];

  for (const { persona, patterns } of rules) {
    for (const pattern of patterns) {
      if (pattern.test(text)) score[persona] += 1;
    }
  }

  let best: PersonaId | null = null;
  let bestScore = 0;
  for (const persona of Object.keys(score) as PersonaId[]) {
    if (persona === "general") continue;
    if (score[persona] > bestScore) {
      bestScore = score[persona];
      best = persona;
    }
  }
  if (!best || bestScore === 0) return null;

  return {
    persona: best,
    confidence: Math.min(0.95, 0.72 + bestScore * 0.08),
    reveal: copy.personaRevealFallbacks[best],
    powerStack: copy.personaPowerStackFallbacks[best],
  };
}

export function powerStackSpeech(
  result: { persona: PersonaId; powerStack?: string },
  copy: SortingHatCopy,
): string {
  const custom = result.powerStack?.trim();
  if (custom) return custom;
  return copy.personaPowerStackFallbacks[result.persona];
}
