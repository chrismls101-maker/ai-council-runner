export const LANDING_GATE_STORAGE_KEY = "nativeglass_landing_gate_unlocked";
const LEGACY_LANDING_GATE_STORAGE_KEY = "iivo_landing_gate_unlocked";

export function isLandingGateUnlockedLocally(): boolean {
  try {
    return (
      localStorage.getItem(LANDING_GATE_STORAGE_KEY) === "1"
      || localStorage.getItem(LEGACY_LANDING_GATE_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setLandingGateUnlockedLocally(): void {
  try {
    localStorage.setItem(LANDING_GATE_STORAGE_KEY, "1");
    localStorage.removeItem(LEGACY_LANDING_GATE_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export async function fetchLandingGateStatus(): Promise<{ enabled: boolean }> {
  const res = await fetch("/api/landing-gate/status");
  if (!res.ok) {
    throw new Error("Failed to load landing gate status");
  }
  return res.json() as Promise<{ enabled: boolean }>;
}

export async function unlockLandingGate(password: string): Promise<boolean> {
  const res = await fetch("/api/landing-gate/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) return false;
  if (!res.ok) {
    throw new Error("Landing gate unlock failed");
  }
  return true;
}
