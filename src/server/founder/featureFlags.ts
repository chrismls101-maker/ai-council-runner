import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FLAGS_FILE = path.resolve(__dirname, "../../../data/founder/feature-flags.json");

function flagsFilePath(): string {
  const override = process.env.FOUNDER_FLAGS_FILE?.trim();
  return override || DEFAULT_FLAGS_FILE;
}

export type FeatureFlags = {
  overlayDemoEnabled: boolean;
  terminalAutoFixEnabled: boolean;
  coderBuildLoopEnabledForNewUsers: boolean;
  aiCallsEnabled: boolean;
  updatedAt: string;
  updatedBy?: string;
};

const DEFAULT_FLAGS: FeatureFlags = {
  overlayDemoEnabled: true,
  terminalAutoFixEnabled: true,
  coderBuildLoopEnabledForNewUsers: true,
  aiCallsEnabled: true,
  updatedAt: new Date(0).toISOString(),
};

export type FeatureFlagKey = Exclude<keyof FeatureFlags, "updatedAt" | "updatedBy">;

const FLAG_KEYS: FeatureFlagKey[] = [
  "overlayDemoEnabled",
  "terminalAutoFixEnabled",
  "coderBuildLoopEnabledForNewUsers",
  "aiCallsEnabled",
];

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return (FLAG_KEYS as string[]).includes(key);
}

async function ensureFlagsFile(): Promise<void> {
  const file = flagsFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, `${JSON.stringify(DEFAULT_FLAGS, null, 2)}\n`, "utf8");
  }
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  await ensureFlagsFile();
  try {
    const raw = await fs.readFile(flagsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<FeatureFlags>;
    return {
      ...DEFAULT_FLAGS,
      ...parsed,
      updatedAt: parsed.updatedAt ?? DEFAULT_FLAGS.updatedAt,
    };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

export async function updateFeatureFlags(
  patch: Partial<Record<FeatureFlagKey, boolean>>,
  updatedBy?: string,
): Promise<FeatureFlags> {
  const current = await getFeatureFlags();
  const next: FeatureFlags = {
    ...current,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? current.updatedBy,
  };

  for (const key of FLAG_KEYS) {
    if (typeof patch[key] === "boolean") {
      next[key] = patch[key] as boolean;
    }
  }

  await ensureFlagsFile();
  await fs.writeFile(flagsFilePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function assertAiCallsEnabled(): Promise<void> {
  const flags = await getFeatureFlags();
  if (!flags.aiCallsEnabled) {
    throw new Error("AI calls are temporarily disabled by the system operator.");
  }
}
