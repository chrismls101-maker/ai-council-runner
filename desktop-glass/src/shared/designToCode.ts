/**
 * Pure module for design-to-code prompt construction.
 * NO Electron/Node imports — must stay unit-testable in node:test.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DesignToCodeAction = "react" | "html" | "describe" | "match-codebase";

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
  describe: "Describe this design",
  "match-codebase": "Match to my codebase",
};

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

// ── buildDesignToCodePrompt ───────────────────────────────────────────────────

const PREAMBLE = "You are given a screenshot of a UI design.";

export function buildDesignToCodePrompt(action: DesignToCodeAction, ctx: DesignToCodeContext): string {
  switch (action) {
    case "react":
      return [
        PREAMBLE,
        "Generate a single self-contained React/TSX functional component that faithfully implements the design.",
        "Return exactly one fenced ```tsx code block with the complete component.",
        "Use semantic HTML elements. Infer the styling approach (CSS modules, styled-components, Tailwind, inline styles) from the visual design.",
      ].join(" ");

    case "html":
      return [
        PREAMBLE,
        "Generate semantic HTML5 markup with an inline <style> block that faithfully implements the design.",
        "Return exactly one fenced ```html code block.",
        "Do not use JavaScript frameworks — plain HTML and CSS only.",
      ].join(" ");

    case "describe":
      return [
        PREAMBLE,
        "Analyze the UI design in writing.",
        "Describe the layout, component hierarchy, spacing, color palette, typography, and interaction affordances.",
        "Do not write code and do not use code fences.",
      ].join(" ");

    case "match-codebase": {
      const reactPrompt = [
        PREAMBLE,
        "Generate a single self-contained React/TSX functional component that faithfully implements the design.",
        "Return exactly one fenced ```tsx code block with the complete component.",
        "Use semantic HTML elements. Infer the styling approach (CSS modules, styled-components, Tailwind, inline styles) from the visual design.",
      ].join(" ");

      if (ctx.content !== null) {
        const tag = langTagFor(ctx.language);
        let prompt =
          reactPrompt +
          ` Match the conventions of my existing codebase. Here is the file I am currently working in (${ctx.fileName}, ${ctx.language}):\n\`\`\`${tag}\n${ctx.content}\n\`\`\``;

        // #164 — include imported files for richer codebase context
        const imports = ctx.importedFiles ?? [];
        if (imports.length > 0) {
          prompt += `\n\nHere are ${imports.length} file(s) that the above file imports, for additional codebase context:`;
          for (const imp of imports) {
            const impTag = langTagFor(imp.language);
            prompt += `\n\n**${imp.fileName}** (${imp.language}):\n\`\`\`${impTag}\n${imp.content}\n\`\`\``;
          }
        }

        const fileRef = imports.length > 0 ? "the files above" : "the file above";
        prompt += `\n\nUse the same import style, component/prop patterns, styling approach (CSS modules / styled-components / Tailwind — infer from ${fileRef}), and naming conventions you observe in the codebase.`;
        return prompt;
      } else {
        return reactPrompt + " (Generate idiomatically; no codebase sample was available.)";
      }
    }
  }
}
