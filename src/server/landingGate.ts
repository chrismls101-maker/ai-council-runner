export function getLandingPassword(): string | undefined {
  const password = process.env.LANDING_PASSWORD?.trim();
  return password || undefined;
}

export function isLandingGateEnabled(): boolean {
  return !!getLandingPassword();
}

export function verifyLandingPassword(candidate: string): boolean {
  const password = getLandingPassword();
  if (!password) return true;
  return candidate === password;
}
