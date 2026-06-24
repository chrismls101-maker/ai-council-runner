/**
 * Electron desktop loopback handler for system audio capture.
 * Registered only in main; renderer calls getDisplayMedia on explicit Start Listening.
 */

import { app, desktopCapturer, screen, session } from "electron";

let loopbackFlagsApplied = false;

export function applySystemAudioChromiumFlags(): void {
  if (loopbackFlagsApplied || process.platform !== "darwin") return;
  loopbackFlagsApplied = true;
  app.commandLine.appendSwitch(
    "enable-features",
    "MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride",
  );
}

export function registerSystemAudioHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => {
        if (sources.length === 0) {
          callback({});
          return;
        }
        const primary = screen.getPrimaryDisplay();
        const primaryId = String(primary.id);
        const source =
          sources.find((s) => s.display_id === primaryId) ?? sources[0];
        callback({ video: source, audio: "loopback" });
      })
      .catch(() => callback({}));
  });
}
