/**
 * Detect which packaged build folder the running .app came from.
 */

export type GlassPackagingVariant =
  | "mac-arm64"
  | "mac-universal"
  | "mac-x64"
  | "applications"
  | "dev"
  | "unknown";

export function detectGlassPackagingVariant(execPath: string, isPackaged: boolean): GlassPackagingVariant {
  if (!isPackaged) return "dev";
  const lower = execPath.toLowerCase();
  if (lower.includes("/release/mac-arm64/")) return "mac-arm64";
  if (lower.includes("/release/mac-universal/")) return "mac-universal";
  if (lower.includes("/release/mac-x64/") || lower.includes("/release/mac/")) return "mac-x64";
  if (lower.startsWith("/applications/")) return "applications";
  return "unknown";
}

export function formatPackagingVariantLabel(variant: GlassPackagingVariant): string {
  switch (variant) {
    case "mac-arm64":
      return "mac-arm64";
    case "mac-universal":
      return "mac-universal";
    case "mac-x64":
      return "mac-x64";
    case "applications":
      return "Installed (/Applications)";
    case "dev":
      return "dev (Electron)";
    default:
      return "unknown packaged path";
  }
}

export const DUPLICATE_APP_WARNING =
  "Multiple IIVO Glass apps detected. macOS permissions may be granted to a different copy.";

export function buildDuplicateAppWarning(
  bundles: { path: string }[],
  runningBundlePath?: string,
): string | undefined {
  if (bundles.length <= 1) return undefined;
  const others = bundles.filter((b) => b.path !== runningBundlePath);
  if (others.length === 0) return undefined;
  return DUPLICATE_APP_WARNING;
}
