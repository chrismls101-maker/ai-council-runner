import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIivoGlassConnected,
  resolveConnectBlockerMessage,
} from "../renderer/panel/connectIivoGlass.ts";
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

test("resolveConnectBlockerMessage explains server offline", () => {
  assert.match(
    resolveConnectBlockerMessage({
      setupCheckSummary: "Setup check: server (Offline)",
      setupCapabilities: [
        {
          id: "server",
          status: "error",
          label: "Offline",
          severity: "error",
          detail: "Could not reach https://iivo.ai",
        },
        { id: "screenRecording", status: "ready", label: "Ready", severity: "ok" },
        { id: "windowCapture", status: "ready", label: "Ready", severity: "ok" },
      ],
      systemAudioStatus: "available",
    }) ?? "",
    /Could not reach/,
  );
});

test("resolveConnectBlockerMessage explains virtual audio on macOS", () => {
  assert.match(
    resolveConnectBlockerMessage({
      setupCheckSummary: "Setup check complete",
      setupCapabilities: readyRows,
      systemAudioStatus: "requires_virtual_device",
    }) ?? "",
    /BlackHole|screen picker/i,
  );
});
