export type GlassSpacesTheme = "light" | "dark";

const THEME_KEY = "glass-spaces-theme";

export function readGlassSpacesTheme(): GlassSpacesTheme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore
  }
  return "dark";
}

export function persistGlassSpacesTheme(theme: GlassSpacesTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}
