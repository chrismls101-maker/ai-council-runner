import { test } from "node:test";
import assert from "node:assert/strict";
import { isIivoGlassConnected } from "../renderer/panel/connectIivoGlass.ts";
import type { GlassCapabilityRow } from "../shared/glassCapabilities.ts";

const readyRows: GlassCapabilityRow[] = [
  { id: "screenRecording", status: "ready", label: "Ready", severity: "ok" },
  { id: "windowCapture", status: "ready", label: "Ready", severity: "ok" },
  { id: "server", status: "ready", label: "Online", severity: "ok" },
  { id: "systemAudio", status: "ready", label: "Connected", severity: "ok" },
];

test("isIivoGlassConnected requires screen and window capture ready", () => {
  assert.equal(
    isIivoGlassConnected({
      setupCheckSummary: "Setup check complete — all capabilities look ready.",
      setupCapabilities: readyRows,
      systemAudioStatus: "available",
    }),
    true,
  );

  const uncheckedScreen = readyRows.map((row) =>
    row.id === "screenRecording"
      ? {
          ...row,
          status: "not_requested" as const,
          label: "Not checked",
          severity: "idle" as const,
        }
      : row,
  );
  assert.equal(
    isIivoGlassConnected({
      setupCheckSummary: "Setup check complete — all capabilities look ready.",
      setupCapabilities: uncheckedScreen,
      systemAudioStatus: "available",
    }),
    false,
  );
});
