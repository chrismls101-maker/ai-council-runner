import type { GlassUiLocale } from "./glassLocale.ts";

export type PersonaId = "developer" | "sales" | "operator" | "writer" | "general";

export interface SortingHatCopy {
  welcomeLine: string;
  glassIntroLine: string;
  nameQuestionLine: string;
  q1Line: string;
  q1HelpLine: string;
  q1Disclaimer: string;
  niceToMeetYou: (firstName: string) => string;
  continueButton: string;
  skipButton: string;
  skipAriaLabel: string;
  inputAriaLabel: string;
  placeholderName: string;
  placeholderAnswer: string;
  voiceListeningHint: string;
  /** Spoken before the activation (API key) screen — guided tour handoff. */
  activationHandoffLine: string;
}

const EN_COPY: SortingHatCopy = {
  welcomeLine: "Welcome. Your ambient intelligence layer is now active.",
  glassIntroLine:
    "Glass works at the OS level — with your permission, it sees what you see, thinks alongside you, and shapes itself to how you work.",
  nameQuestionLine: "Before we go further — what should I call you?",
  q1Line:
    "Tell me what you do and what you're working on — the more I know, the better Glass can support you.",
  q1HelpLine:
    "Take your time. Just describe what you build, work on, or spend most of your day doing.",
  q1Disclaimer: "Not sure where to start? Just describe your work — I'll take it from there.",
  niceToMeetYou: (firstName) => `Nice to meet you, ${firstName}.`,
  continueButton: "Continue",
  skipButton: "Skip",
  skipAriaLabel: "Skip onboarding",
  inputAriaLabel: "Your answer to IIVO",
  placeholderName: "Your name…",
  placeholderAnswer: "Type your answer…",
  voiceListeningHint: "Listening — speak your answer",
  activationHandoffLine:
    "Perfect. One last step — next I'll ask you to connect your Anthropic API key. Glass runs on Claude, and Anthropic bills you directly for usage. It only takes about two minutes.",
};

const ES_COPY: SortingHatCopy = {
  welcomeLine: "Bienvenido. Tu capa de inteligencia ambiental ya está activa.",
  glassIntroLine:
    "Glass funciona a nivel del sistema operativo — con tu permiso, ve lo que ves, piensa contigo y se adapta a tu forma de trabajar.",
  nameQuestionLine: "Antes de continuar — ¿cómo debería llamarte?",
  q1Line:
    "Cuéntame qué haces y en qué estás trabajando — cuanto más sepa, mejor Glass podrá apoyarte.",
  q1HelpLine:
    "Tómate tu tiempo. Solo describe lo que construyes, en qué trabajas o en qué pasas la mayor parte del día.",
  q1Disclaimer: "¿No sabes por dónde empezar? Solo describe tu trabajo — yo me encargo del resto.",
  niceToMeetYou: (firstName) => `Mucho gusto, ${firstName}.`,
  continueButton: "Continuar",
  skipButton: "Omitir",
  skipAriaLabel: "Omitir onboarding",
  inputAriaLabel: "Tu respuesta para IIVO",
  placeholderName: "Tu nombre…",
  placeholderAnswer: "Escribe tu respuesta…",
  voiceListeningHint: "Escuchando — di tu respuesta",
  activationHandoffLine:
    "Perfecto. Un último paso: a continuación te pediré que conectes tu clave API de Anthropic. Glass funciona con Claude, y Anthropic te factura el uso directamente. Solo toma unos dos minutos.",
};

export function getSortingHatCopy(locale: GlassUiLocale): SortingHatCopy {
  if (locale === "es") return ES_COPY;
  return EN_COPY;
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
