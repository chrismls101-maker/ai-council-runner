/**
 * Optional bearer token for IIVO server /api/* when GLASS_API_SECRET is configured.
 *
 * Packaged builds: electron-vite `define` inlines process.env.IIVO_GLASS_API_SECRET
 * at compile time when IIVO_GLASS_API_SECRET is set in the build environment.
 */

export function getIivoGlassApiSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const fromEnv = env.IIVO_GLASS_API_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // Compile-time fallback for DMG builds (see electron.vite.config.ts `define`)
  const baked = process.env.IIVO_GLASS_API_SECRET?.trim();
  return baked || undefined;
}

export function iivoApiAuthHeaders(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const secret = getIivoGlassApiSecret(env);
  if (!secret) return {};
  return { Authorization: `Bearer ${secret}` };
}

export function withIivoApiAuthHeaders(
  headers: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  return { ...iivoApiAuthHeaders(env), ...headers };
}
