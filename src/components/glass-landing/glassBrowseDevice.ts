export type GlassBrowseDeviceProfile = "desktop" | "tablet" | "phone";
export type GlassBrowseMobilePlatform = "ios" | "android";

const DESKTOP_MIN = 900;
const TABLET_MIN = 600;

export function detectGlassBrowseDevice(width = typeof window !== "undefined" ? window.innerWidth : 1024): GlassBrowseDeviceProfile {
  if (width >= DESKTOP_MIN) return "desktop";
  if (width >= TABLET_MIN) return "tablet";
  return "phone";
}

export function detectGlassBrowseMobilePlatform(): GlassBrowseMobilePlatform {
  if (typeof navigator === "undefined") return "ios";
  return /Android/i.test(navigator.userAgent) ? "android" : "ios";
}

export function isGlassBrowseMobile(profile: GlassBrowseDeviceProfile): boolean {
  return profile === "phone" || profile === "tablet";
}
