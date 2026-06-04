/**
 * Print connected displays via Electron screen API (same source Glass uses).
 * Run: npm run display:diag --prefix desktop-glass
 */

const { app, screen } = require("electron");

function labelFor(display, index, primaryId) {
  if (display.id === primaryId) return "Primary Display";
  const n = index + 1;
  const isExternal = display.internal === false;
  const isLarge = display.bounds.width >= 1920 || display.bounds.height >= 1080;
  if (isExternal && isLarge) return `HDMI Display (Display ${n})`;
  if (isExternal) return `External Display (Display ${n})`;
  return `Display ${n}`;
}

app.whenReady().then(() => {
  const primary = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  const cursor = screen.getCursorScreenPoint();

  const snapshots = displays.map((display, index) => ({
    id: display.id,
    label: labelFor(display, index, primary.id),
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    internal: display.internal,
    isPrimary: display.id === primary.id,
    cursorInside:
      cursor.x >= display.bounds.x &&
      cursor.x < display.bounds.x + display.bounds.width &&
      cursor.y >= display.bounds.y &&
      cursor.y < display.bounds.y + display.bounds.height,
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    displayCount: displays.length,
    cursor,
    primary: snapshots.find((d) => d.isPrimary) ?? null,
    externalDisplays: snapshots.filter((d) => !d.isPrimary),
    displays: snapshots,
  };

  console.log(JSON.stringify(report, null, 2));
  app.quit();
});
