/**
 * Local answers for Sorting Hat QA — no server round-trip required.
 */

import type { GlassUiLocale } from "./glassLocale.ts";

const TOPICS_EN: Array<{ match: RegExp; answer: string }> = [
  {
    match: /power\s*stack|stack(s)?\s+(for|do|mean)|what('s| is) a stack/i,
    answer:
      "A power stack is the set of tools, intelligence modes, and capabilities Glass loads specifically for your kind of work. A builder's stack looks different from a writer's or a closer's — instead of giving everyone the same AI, Glass configures itself around what you actually do. After your reveal, yours loads tuned to how you work.",
  },
  {
    match: /what is glass|what('s| does) glass|tell me about glass|how does glass work/i,
    answer:
      "Glass is an ambient intelligence layer that runs at the OS level as a transparent overlay. It's always present without being in the way — not an app you open, not a chatbot you type into. With your permission it reads your screen context and thinks alongside you while you work.",
  },
  {
    match: /what (can|could) glass do|what does it do|capabilities|features/i,
    answer:
      "Glass reads your screen with your permission, so it understands what you're working on without you explaining it. It surfaces what matters, catches things you might miss, helps you think through decisions, and can act when you need it to. It handles the cognitive load you normally hold in your head.",
  },
  {
    match: /privacy|permission|record|log|store|trust|safe|secure|data/i,
    answer:
      "Glass runs entirely on a permission model — you decide what it can access, restrict it to certain apps, pause it, or shut it down any time. It does not record, log, or store your screen content. It's designed to earn trust, not assume it.",
  },
  {
    match: /chatgpt|claude|copilot|ai browser|browser|different from|vs\.?|compared to/i,
    answer:
      "ChatGPT and Claude are tools you go to — you leave your work, paste context, and carry answers back. AI browsers wrap the web in chat. Glass is none of that. It's a transparent OS-level layer above everything you already do, with live screen context, without switching windows.",
  },
  {
    match: /see (my|what)|screen|context|working on|know what|what am i/i,
    answer:
      "With your explicit permission, Glass reads your screen so it has live context on what you're working on — no pasting, no tab switching, no re-explaining. It sees what you see, only when you allow it.",
  },
  {
    match: /learn|over time|get (better|smarter)|adapt|personal/i,
    answer:
      "Yes — the more Glass is with you, the sharper it gets. It builds a picture of your patterns, the work you do, and how you decide, and uses that to give better support over time. Your power stack refines as it learns you.",
  },
  {
    match: /what is iivo|who (are|is) iivo|iivo/i,
    answer:
      "IIVO is the intelligence and presence behind Glass — what you're talking to right now. Not a chatbot character, but the core layer that observes, thinks, and acts. The visual form and voice are expressions of that presence.",
  },
  {
    match: /price|cost|subscription|release|when (will|does)|launch/i,
    answer:
      "I don't have pricing or release details here — that's not what this moment is for. What I can tell you is what Glass does and how your power stack will work for you. Ask me about that, or type continue when you're ready for your reveal.",
  },
];

const TOPICS_ES: Array<{ match: RegExp; answer: string }> = [
  {
    match: /power\s*stack|stack|pila|herramientas/i,
    answer:
      "Un power stack es el conjunto de herramientas, modos de inteligencia y capacidades que Glass carga específicamente para tu tipo de trabajo. El stack de un builder se ve distinto al de un writer o un closer — en lugar de darle a todos la misma IA, Glass se configura alrededor de lo que realmente haces. Después de tu revelación, el tuyo se carga afinado a tu forma de trabajar.",
  },
  {
    match: /qu[eé] es glass|qu[eé] hace glass|cu[eé]ntame sobre glass|c[oó]mo funciona glass/i,
    answer:
      "Glass es una capa de inteligencia ambiental que corre a nivel del sistema operativo como un overlay transparente. Siempre está presente sin estorbar — no es una app que abres ni un chatbot al que escribes. Con tu permiso lee el contexto de tu pantalla y piensa contigo mientras trabajas.",
  },
  {
    match: /qu[eé] puede hacer|qu[eé] hace|capacidades|funciones/i,
    answer:
      "Glass lee tu pantalla con tu permiso, así entiende en qué trabajas sin que tengas que explicarlo. Destaca lo importante, detecta lo que podrías perder, te ayuda a pensar decisiones y puede actuar cuando lo necesitas. Sostiene la carga cognitiva que normalmente llevas en la cabeza.",
  },
  {
    match: /privacidad|permiso|grabar|registrar|almacenar|confianza|seguro|datos/i,
    answer:
      "Glass funciona completamente con un modelo de permisos — tú decides qué puede acceder, restringirlo a ciertas apps, pausarlo o apagarlo en cualquier momento. No graba, registra ni almacena el contenido de tu pantalla. Está diseñado para ganarse la confianza, no asumirla.",
  },
  {
    match: /chatgpt|claude|copilot|navegador|diferente de|vs\.?|comparado/i,
    answer:
      "ChatGPT y Claude son herramientas a las que vas — dejas tu trabajo, pegas contexto y traes respuestas de vuelta. Los navegadores con IA envuelven la web en chat. Glass no es eso. Es una capa transparente a nivel de SO sobre todo lo que ya haces, con contexto de pantalla en vivo, sin cambiar de ventana.",
  },
  {
    match: /ver (mi|lo)|pantalla|contexto|en qu[eé] trabajo|saber qu[eé]/i,
    answer:
      "Con tu permiso explícito, Glass lee tu pantalla para tener contexto en vivo sobre en qué trabajas — sin pegar, sin cambiar pestañas, sin volver a explicar. Ve lo que ves, solo cuando lo permites.",
  },
  {
    match: /aprend|con el tiempo|mejor|adapt|personal/i,
    answer:
      "Sí — cuanto más tiempo Glass está contigo, más afilado se vuelve. Construye un mapa de tus patrones, el trabajo que haces y cómo decides, y usa eso para darte mejor apoyo con el tiempo. Tu power stack se refina mientras te conoce.",
  },
  {
    match: /qu[eé] es iivo|qui[eé]n es iivo|iivo/i,
    answer:
      "IIVO es la inteligencia y presencia detrás de Glass — con lo que estás hablando ahora. No es un personaje de chatbot, sino la capa central que observa, piensa y actúa. La forma visual y la voz son expresiones de esa presencia.",
  },
  {
    match: /precio|costo|suscripci[oó]n|lanzamiento|cu[aá]ndo/i,
    answer:
      "No tengo detalles de precios o lanzamiento aquí — este momento no es para eso. Lo que sí puedo contarte es qué hace Glass y cómo funcionará tu power stack. Pregúntame sobre eso, o escribe continuar cuando estés listo para tu revelación.",
  },
];

const DEFAULT_EN =
  "Good question. Glass is your ambient OS-level layer — it sees your screen with permission, loads a power stack tuned to your work, and stays in context without you switching apps. Ask me about the power stack, privacy, or how it's different from ChatGPT — or type continue when you're ready.";

const DEFAULT_ES =
  "Buena pregunta. Glass es tu capa ambiental a nivel de SO — ve tu pantalla con permiso, carga un power stack afinado a tu trabajo y se mantiene en contexto sin cambiar de app. Pregúntame sobre el power stack, privacidad o en qué se diferencia de ChatGPT — o escribe continuar cuando estés listo.";

/** Returns a warm plain-text answer for onboarding QA. */
export function answerGlassOnboardingQuestion(
  question: string,
  locale: GlassUiLocale = "en",
): string {
  const q = question.trim();
  const topics = locale === "es" ? TOPICS_ES : TOPICS_EN;
  const fallback = locale === "es" ? DEFAULT_ES : DEFAULT_EN;
  if (!q) return fallback;
  for (const { match, answer } of topics) {
    if (match.test(q)) return answer;
  }
  return fallback;
}
