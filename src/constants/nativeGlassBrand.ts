/** Public marketing brand — nativeglass.ai */
export const NATIVE_GLASS_NAME = "Native Glass";
export const NATIVE_GLASS_MARK = "NativeGlass";
export const NATIVE_GLASS_DOMAIN = "nativeglass.ai";
export const NATIVE_GLASS_URL = `https://${NATIVE_GLASS_DOMAIN}`;
export const NATIVE_GLASS_TAGLINE = "Native intelligence. Above everything.";
export const NATIVE_GLASS_DESCRIPTION =
  "NativeGlass is the OS layer above every window on your Mac — one intelligence surface for Lens, memory, Aletheia, and agents across your entire desktop.";

/** Shorter line for meta tags and cinema finale. */
export const NATIVE_GLASS_DESCRIPTION_SHORT =
  "The OS layer above every Mac app — one native intelligence surface, not another tab.";

export const NATIVE_GLASS_PATHS = {
  studio: "/studio",
  aletheia: "/aletheia",
  download: "/download",
  install: "/install",
} as const;

export const NATIVE_GLASS_PAGE_TITLE = `${NATIVE_GLASS_NAME} — ${NATIVE_GLASS_TAGLINE}`;

/** macOS bundle id — changing this resets Privacy & Security permission entries. */
export const NATIVE_GLASS_BUNDLE_ID = "com.nativeglass.app";
