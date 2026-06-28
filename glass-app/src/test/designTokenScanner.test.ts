import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  extractCssCustomProperties,
  extractJsonTokenKeys,
  extractTailwindThemeHints,
} from "../main/design/designTokenScanner.ts";

describe("designTokenScanner", () => {
  test("extractCssCustomProperties finds semantic CSS variables", () => {
    const css = `
      :root {
        --color-primary: #3366ff;
        --spacing-md: 16px;
        --radius-lg: 12px;
      }
    `;
    const vars = extractCssCustomProperties(css);
    assert.ok(vars.includes("--color-primary"));
    assert.ok(vars.includes("--spacing-md"));
    assert.ok(vars.includes("--radius-lg"));
  });

  test("extractJsonTokenKeys walks nested token JSON", () => {
    const json = JSON.stringify({
      color: { primary: "#3366ff", muted: "#8899aa" },
      spacing: { md: 16 },
    });
    const keys = extractJsonTokenKeys(json);
    assert.ok(keys.includes("color.primary"));
    assert.ok(keys.includes("color.muted"));
    assert.ok(keys.includes("spacing.md"));
  });

  test("extractTailwindThemeHints summarizes color keys", () => {
    const config = `
      export default {
        theme: {
          extend: {
            colors: {
              brand: "#123456",
              surface: "#0a0a0a",
            },
          },
        },
      };
    `;
    const hints = extractTailwindThemeHints(config);
    assert.ok(hints.some((h) => h.includes("tailwind colors")));
    assert.ok(hints.some((h) => h.includes("brand")));
  });
});
