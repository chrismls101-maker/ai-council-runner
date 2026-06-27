/**
 * Deterministic Aletheia bootstrap pass (P0.5 Body).
 *
 * Checks every manifest entry, applies safe auto-fixes, and returns narration.
 */

import { buildAletheiaDependencyManifest } from "../shared/aletheiaDependencyManifest.ts";
import type { AletheiaDependencyManifestSnapshot } from "../shared/aletheiaDependencyManifest.ts";
import { probeAletheiaDependencies, probeNodePtyReady, type AletheiaDependencyProbeContext } from "./aletheiaDependencyProbes.ts";

export interface AletheiaBootstrapHost {
  getContext: () => AletheiaDependencyProbeContext;
  fixNodePtyPermissions: () => void;
  refreshSetup: () => Promise<void> | void;
  setManifest: (snapshot: AletheiaDependencyManifestSnapshot) => void;
  push: () => void;
}

export interface AletheiaBootstrapReport {
  snapshot: AletheiaDependencyManifestSnapshot;
  autoFixed: string[];
}

export async function runAletheiaBootstrapPass(host: AletheiaBootstrapHost): Promise<AletheiaBootstrapReport> {
  const autoFixed: string[] = [];

  if (!probeNodePtyReady()) {
    host.fixNodePtyPermissions();
    if (probeNodePtyReady()) {
      autoFixed.push("Terminal spawn-helper permissions repaired.");
    }
  }

  await host.refreshSetup();

  const probes = await probeAletheiaDependencies(host.getContext());
  const snapshot = buildAletheiaDependencyManifest(probes);
  host.setManifest(snapshot);
  host.push();

  return { snapshot, autoFixed };
}

export type { AletheiaDependencyManifestSnapshot };
