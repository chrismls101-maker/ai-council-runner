/**
 * Glass Guide — terminal QA simulation (no UI).
 */

import {
  shouldTriggerOrientation,
  ORIENTATION_LONG_ABSENCE_MS,
  defaultAppProficiencyProfile,
  filterRegionsForSession,
  deriveOrientationActions,
  regionsToResurface,
} from "./liveOrientationTypes.ts";
import type { OrientationRegion } from "./liveOrientationTypes.ts";

export type OrientationQAResult = {
  name: string;
  pass: boolean;
  detail: string;
  evidence?: Record<string, unknown>;
};

export type OrientationQAReport = {
  results: OrientationQAResult[];
  passCount: number;
  failCount: number;
  ranAt: string;
};

const sampleRegion: OrientationRegion = {
  id: "sidebar",
  label: "Sidebar",
  bounds: { x: 0, y: 0.1, width: 0.2, height: 0.8 },
  priority: 1,
  role: "navigation",
  l1: "Main navigation.",
  l2: null,
  l3: null,
  l4: deriveOrientationActions("navigation"),
};

export function runOrientationQASuite(now = Date.now()): OrientationQAReport {
  const results: OrientationQAResult[] = [];

  const newApp = shouldTriggerOrientation({ profile: null, now, currentVersion: null });
  results.push({
    name: "Trigger — first visit",
    pass: newApp.trigger && newApp.reason === "new_app",
    detail: "New app should trigger orientation",
    evidence: newApp,
  });

  const profile = defaultAppProficiencyProfile("com.notion", "Notion", now - ORIENTATION_LONG_ABSENCE_MS - 1);
  profile.sessionCount = 10;
  const longAbsence = shouldTriggerOrientation({
    profile,
    now,
    currentVersion: "1.0",
  });
  results.push({
    name: "Trigger — long absence",
    pass: longAbsence.trigger && longAbsence.reason === "long_absence",
    detail: ">30 days away should re-orient",
    evidence: longAbsence,
  });

  const early = defaultAppProficiencyProfile("com.figma", "Figma", now);
  early.sessionCount = 1;
  const earlySessions = shouldTriggerOrientation({
    profile: early,
    now,
    currentVersion: "1.0",
  });
  results.push({
    name: "Trigger — early sessions",
    pass: earlySessions.trigger && earlySessions.reason === "early_sessions",
    detail: "Sessions < 3 should orient",
    evidence: earlySessions,
  });

  const mastered = defaultAppProficiencyProfile("com.slack", "Slack", now);
  mastered.masteredRegions = ["sidebar"];
  const filtered = filterRegionsForSession([sampleRegion], mastered);
  results.push({
    name: "Proficiency — skip mastered",
    pass: filtered.length === 0,
    detail: "Mastered regions should not appear in session",
    evidence: { filteredCount: filtered.length },
  });

  const navActions = deriveOrientationActions("navigation");
  results.push({
    name: "L4 — navigation actions",
    pass: navActions[0]?.op === "navigate_to" && navActions[0]?.label === "Take me there",
    detail: "Navigation regions get Take me there",
    evidence: { actions: navActions },
  });

  const resurfaceProfile = defaultAppProficiencyProfile("com.linear", "Linear", now);
  resurfaceProfile.sessionCount = 3;
  resurfaceProfile.neverTouchedRegions = ["settings-panel"];
  const resurface = regionsToResurface(resurfaceProfile);
  results.push({
    name: "Proficiency — resurface never-touched",
    pass: resurface.includes("settings-panel"),
    detail: "After 3 sessions, never-touched regions resurface",
    evidence: { resurface },
  });

  const passCount = results.filter((r) => r.pass).length;
  return {
    results,
    passCount,
    failCount: results.length - passCount,
    ranAt: new Date(now).toISOString(),
  };
}
