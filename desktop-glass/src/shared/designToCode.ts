/**
 * Pure module for design-to-code prompt construction.
 * NO Electron/Node imports — must stay unit-testable in node:test.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DesignToCodeAction = "react" | "html" | "describe" | "match-codebase";

/**
 * The target framework/stack for generated code.
 * Stored as a persistent Glass setting (#163-F) and injected into every prompt.
 * When a code file is open, the codebase context takes precedence; this setting
 * acts as the fallback when no file context is available.
 */
export type DesignStack =
  | "react-tsx"       // React + TypeScript (default)
  | "react-tailwind"  // React + Tailwind CSS
  | "next-tailwind"   // Next.js + Tailwind CSS
  | "vue"             // Vue 3 (Composition API)
  | "nuxt"            // Nuxt 3 (Vue 3 + auto-imports)
  | "svelte"          // Svelte 5
  | "solid"           // Solid.js
  | "astro"           // Astro
  | "remix"           // Remix / React Router v7
  | "react-native"    // React Native / Expo
  | "html-css"        // Plain HTML + CSS, no framework
  | "angular";        // Angular

export const DEFAULT_DESIGN_STACK: DesignStack = "react-tsx";

export const DESIGN_STACK_LABELS: Record<DesignStack, string> = {
  "react-tsx":      "React / TSX",
  "react-tailwind": "React + Tailwind",
  "next-tailwind":  "Next.js + Tailwind",
  "remix":          "Remix",
  "vue":            "Vue 3",
  "nuxt":           "Nuxt 3",
  "svelte":         "Svelte",
  "solid":          "Solid.js",
  "astro":          "Astro",
  "react-native":   "React Native / Expo",
  "html-css":       "HTML / CSS",
  "angular":        "Angular",
};

/** File extension to use when saving generated code to disk. */
export const DESIGN_STACK_EXTENSIONS: Record<DesignStack, string> = {
  "react-tsx":      ".tsx",
  "react-tailwind": ".tsx",
  "next-tailwind":  ".tsx",
  "remix":          ".tsx",
  "vue":            ".vue",
  "nuxt":           ".vue",
  "svelte":         ".svelte",
  "solid":          ".tsx",
  "astro":          ".astro",
  "react-native":   ".tsx",
  "html-css":       ".html",
  "angular":        ".ts",
};

/** A single imported file included as codebase context (#164). */
export interface ImportedFileContext {
  fileName: string;
  language: string;
  filePath: string;
  content: string;
}

export interface DesignToCodeContext {
  fileName: string | null;
  language: string | null;
  filePath: string | null;
  content: string | null;
  /** Depth-1 and depth-2 imports of the target file, sorted by proximity (#164). */
  importedFiles?: ImportedFileContext[];
}

// ── Editor detection ──────────────────────────────────────────────────────────

export const EDITOR_APP_NAMES: readonly string[] = [
  "Cursor", "Code", "Visual Studio Code", "Xcode", "WebStorm",
  "IntelliJ IDEA", "PyCharm", "GoLand", "CLion", "RubyMine",
  "Nova", "Sublime Text", "Zed",
];

export function isEditorAppName(appName: string | null | undefined): boolean {
  return !!appName && (EDITOR_APP_NAMES as string[]).includes(appName);
}

// ── Action labels ─────────────────────────────────────────────────────────────

export const DESIGN_TO_CODE_ACTION_LABELS: Record<DesignToCodeAction, string> = {
  react: "React component",
  html: "HTML / CSS",
  describe: "Describe this",
  "match-codebase": "Match my codebase",
};

/**
 * Returns action button labels that reflect the current stack.
 * Falls back to generic labels if stack doesn't affect the label.
 */
export function getActionLabel(action: DesignToCodeAction, stack: DesignStack): string {
  // For "react" action: change label based on framework
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
        return "React component"; // react-tsx, react-tailwind, next-tailwind, html-css
    }
  }
  // For "html": adjust label for react-native (no HTML)
  if (action === "html") {
    if (stack === "react-native") return "Native layout";
    return "HTML / CSS";
  }
  // "describe" and "match-codebase" don't change by stack
  return DESIGN_TO_CODE_ACTION_LABELS[action];
}

// ── langTagFor ────────────────────────────────────────────────────────────────

export function langTagFor(language: string | null): string {
  if (!language) return "code";

  const lang = language;

  // TypeScript (React) or anything with tsx/TSX/React + TypeScript → "tsx"
  if (
    lang === "TypeScript (React)" ||
    lang.includes("tsx") ||
    lang.includes("TSX") ||
    (lang.includes("React") && lang.includes("TypeScript"))
  ) {
    return "tsx";
  }

  // TypeScript alone
  if (lang === "TypeScript") {
    return "ts";
  }

  // JavaScript (React) or anything with jsx/JSX/React + JavaScript → "jsx"
  if (
    lang === "JavaScript (React)" ||
    lang.includes("jsx") ||
    lang.includes("JSX") ||
    (lang.includes("React") && lang.includes("JavaScript"))
  ) {
    return "jsx";
  }

  // JavaScript alone
  if (lang === "JavaScript") {
    return "js";
  }

  // CSS
  if (lang === "CSS") {
    return "css";
  }

  return "code";
}

// ── stackHint ─────────────────────────────────────────────────────────────────

/** Returns a concise stack instruction to append when no codebase file is available. */
export function stackHint(stack: DesignStack): string {
  switch (stack) {
    case "react-tsx":      return "Use React with TypeScript (.tsx). Style with CSS modules or inline styles.";
    case "react-tailwind": return "Use React with TypeScript (.tsx) and Tailwind CSS utility classes for all styling. Do not use CSS files or inline styles.";
    case "next-tailwind":  return "Use Next.js with TypeScript (.tsx) and Tailwind CSS utility classes. Use Next.js Image/Link components where appropriate.";
    case "vue":            return "Use Vue 3 with the Composition API (<script setup lang=\"ts\">). Style with scoped CSS.";
    case "nuxt":           return "Use Nuxt 3 with Vue 3 Composition API (<script setup lang=\"ts\">). Use Nuxt auto-imports (useRoute, useFetch, etc.) and scoped CSS.";
    case "svelte":         return "Use Svelte 5 with TypeScript. Style with scoped <style> blocks.";
    case "solid":          return "Use Solid.js with TypeScript (.tsx). Use Solid's reactivity primitives (createSignal, createMemo). Return JSX from a function component.";
    case "astro":          return "Use Astro (.astro file). Put the component script in the frontmatter fence (---). Use Astro's built-in scoped <style> blocks.";
    case "remix":          return "Use Remix with TypeScript (.tsx). Follow Remix conventions (loader/action exports where needed, Link for navigation). Style with Tailwind or CSS modules.";
    case "react-native":   return "Use React Native with TypeScript (.tsx) and Expo. Use View, Text, TouchableOpacity, and StyleSheet — no HTML elements or browser CSS.";
    case "html-css":       return "Use plain HTML5 and CSS — no JavaScript frameworks. Inline the CSS in a <style> block.";
    case "angular":        return "Use Angular with TypeScript. Generate a standalone component with an inline template.";
  }
}

// ── buildDesignToCodePrompt ───────────────────────────────────────────────────

/**
 * Neutral preamble — describes what the AI is receiving without assuming the
 * source (Figma, live website, screenshot, wireframe, reference image, etc.).
 */
const PREAMBLE = "You are given a visual reference screenshot.";

export function buildDesignToCodePrompt(
  action: DesignToCodeAction,
  ctx: DesignToCodeContext,
  stack: DesignStack = DEFAULT_DESIGN_STACK,
  refinementFeedback?: string,
): string {
  let prompt: string;

  switch (action) {
    case "react": {
      const hint = stack === "react-tailwind" || stack === "next-tailwind"
        ? "Use Tailwind CSS utility classes for all styling."
        : "Infer the styling approach (CSS modules, styled-components, Tailwind, inline styles) from the visual reference.";
      prompt = [
        PREAMBLE,
        "Generate a single self-contained React/TSX functional component that faithfully implements the design.",
        "Return exactly one fenced ```tsx code block with the complete component.",
        `Use semantic HTML elements. ${hint}`,
      ].join(" ");
      break;
    }

    case "html":
      prompt = [
        PREAMBLE,
        "Generate semantic HTML5 markup with an inline <style> block that faithfully implements the design.",
        "Return exactly one fenced ```html code block.",
        "Do not use JavaScript frameworks — plain HTML and CSS only.",
      ].join(" ");
      break;

    case "describe":
      prompt = [
        PREAMBLE,
        "Analyze the visual reference in writing.",
        "Describe the layout, component hierarchy, spacing, color palette, typography, and interaction affordances.",
        "Do not write code and do not use code fences.",
      ].join(" ");
      break;

    case "match-codebase": {
      const reactPrompt = [
        PREAMBLE,
        "Generate a single self-contained React/TSX functional component that faithfully implements the design.",
        "Return exactly one fenced ```tsx code block with the complete component.",
        "Use semantic HTML elements. Infer the styling approach (CSS modules, styled-components, Tailwind, inline styles) from the visual reference.",
      ].join(" ");

      if (ctx.content !== null) {
        const tag = langTagFor(ctx.language);
        let p =
          reactPrompt +
          ` Match the conventions of my existing codebase. Here is the file I am currently working in (${ctx.fileName}, ${ctx.language}):\n\`\`\`${tag}\n${ctx.content}\n\`\`\``;

        // #164 — include imported files for richer codebase context
        const imports = ctx.importedFiles ?? [];
        if (imports.length > 0) {
          p += `\n\nHere are ${imports.length} file(s) that the above file imports, for additional codebase context:`;
          for (const imp of imports) {
            const impTag = langTagFor(imp.language);
            p += `\n\n**${imp.fileName}** (${imp.language}):\n\`\`\`${impTag}\n${imp.content}\n\`\`\``;
          }
        }

        const fileRef = imports.length > 0 ? "the files above" : "the file above";
        p += `\n\nUse the same import style, component/prop patterns, styling approach (CSS modules / styled-components / Tailwind — infer from ${fileRef}), and naming conventions you observe in the codebase.`;
        prompt = p;
      } else {
        // No file open — fall back to the user's stack setting
        prompt = reactPrompt + ` No codebase file was available. ${stackHint(stack)}`;
      }
      break;
    }
  }

  if (refinementFeedback?.trim()) {
    prompt += `\n\n---\n**Refinement request:** ${refinementFeedback.trim()}`;
  }
  return prompt;
}
