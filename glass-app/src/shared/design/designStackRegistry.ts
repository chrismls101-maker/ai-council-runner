import type { DesignStack } from "./designToCodeTypes.ts";

export const DEFAULT_DESIGN_STACK: DesignStack = "react-tsx";

export const DESIGN_STACK_LABELS: Record<DesignStack, string> = {
  "react-tsx": "React / TSX",
  "react-tailwind": "React + Tailwind",
  "next-tailwind": "Next.js + Tailwind",
  remix: "Remix",
  vue: "Vue 3",
  nuxt: "Nuxt 3",
  svelte: "Svelte",
  solid: "Solid.js",
  astro: "Astro",
  "react-native": "React Native / Expo",
  "html-css": "HTML / CSS",
  angular: "Angular",
};

export const DESIGN_STACK_EXTENSIONS: Record<DesignStack, string> = {
  "react-tsx": ".tsx",
  "react-tailwind": ".tsx",
  "next-tailwind": ".tsx",
  remix: ".tsx",
  vue: ".vue",
  nuxt: ".vue",
  svelte: ".svelte",
  solid: ".tsx",
  astro: ".astro",
  "react-native": ".tsx",
  "html-css": ".html",
  angular: ".ts",
};

export function stackHint(stack: DesignStack): string {
  switch (stack) {
    case "react-tsx":
      return "Use React with TypeScript (.tsx). Style with CSS modules or inline styles.";
    case "react-tailwind":
      return "Use React with TypeScript (.tsx) and Tailwind CSS utility classes for all styling. Do not use CSS files or inline styles.";
    case "next-tailwind":
      return "Use Next.js with TypeScript (.tsx) and Tailwind CSS utility classes. Use Next.js Image/Link components where appropriate.";
    case "vue":
      return 'Use Vue 3 with the Composition API (<script setup lang="ts">). Style with scoped CSS.';
    case "nuxt":
      return "Use Nuxt 3 with Vue 3 Composition API (<script setup lang=\"ts\">). Use Nuxt auto-imports and scoped CSS.";
    case "svelte":
      return "Use Svelte 5 with TypeScript. Style with scoped <style> blocks.";
    case "solid":
      return "Use Solid.js with TypeScript (.tsx). Use createSignal/createMemo. Return JSX from a function component.";
    case "astro":
      return "Use Astro (.astro). Frontmatter script in --- fence. Scoped <style> blocks.";
    case "remix":
      return "Use Remix with TypeScript (.tsx). Follow Remix conventions. Style with Tailwind or CSS modules.";
    case "react-native":
      return "Use React Native with TypeScript (.tsx) and Expo. View, Text, TouchableOpacity, StyleSheet — no HTML.";
    case "html-css":
      return "Use plain HTML5 and CSS — no JavaScript frameworks. Inline CSS in a <style> block.";
    case "angular":
      return "Use Angular with TypeScript. Generate a standalone component with an inline template.";
  }
}

export function langTagFor(language: string | null): string {
  if (!language) return "code";
  const lang = language;
  if (
    lang === "TypeScript (React)"
    || lang.includes("tsx")
    || lang.includes("TSX")
    || (lang.includes("React") && lang.includes("TypeScript"))
  ) {
    return "tsx";
  }
  if (lang === "TypeScript") return "ts";
  if (
    lang === "JavaScript (React)"
    || lang.includes("jsx")
    || lang.includes("JSX")
    || (lang.includes("React") && lang.includes("JavaScript"))
  ) {
    return "jsx";
  }
  if (lang === "JavaScript") return "js";
  if (lang === "CSS") return "css";
  return "code";
}

export const DESIGN_TO_CODE_ACTION_LABELS: Record<
  import("./designToCodeTypes.ts").DesignToCodeAction,
  string
> = {
  react: "React component",
  html: "HTML / CSS",
  describe: "Describe this",
  "match-codebase": "Match my codebase",
};

export function getActionLabel(
  action: import("./designToCodeTypes.ts").DesignToCodeAction,
  stack: DesignStack,
): string {
  if (action === "react") {
    switch (stack) {
      case "vue":
      case "nuxt":
        return "Vue component";
      case "svelte":
        return "Svelte component";
      case "solid":
        return "Solid component";
      case "astro":
        return "Astro component";
      case "react-native":
        return "Native component";
      case "angular":
        return "Angular component";
      case "remix":
        return "Remix component";
      default:
        return "React component";
    }
  }
  if (action === "html") {
    if (stack === "react-native") return "Native layout";
    return "HTML / CSS";
  }
  return DESIGN_TO_CODE_ACTION_LABELS[action];
}
