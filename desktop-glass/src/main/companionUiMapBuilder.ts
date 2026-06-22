/**
 * Build Companion UiMap from macOS Accessibility + Chrome DOM (Phase 2.5).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UiMap, UiMark, NormalizedRect } from "../shared/companionGuidance.ts";
import type { WindowBounds } from "../shared/windowContextTypes.ts";
import { getCachedWindowContext } from "./windowContext.ts";

const execFileAsync = promisify(execFile);

export interface CompanionUiMapBuildInput {
  captureId: string;
  captureWidth: number;
  captureHeight: number;
  /** Display origin in screen coords (Electron top-left). */
  displayOrigin?: { x: number; y: number };
  /** Optional som-* marks from OmniParser (Phase 4d). */
  extraMarks?: UiMark[];
}

interface RawElement {
  id: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source: "ax" | "dom";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function toNormalizedRect(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
  input: CompanionUiMapBuildInput,
): NormalizedRect | null {
  const originX = input.displayOrigin?.x ?? 0;
  const originY = input.displayOrigin?.y ?? 0;
  const w = input.captureWidth;
  const h = input.captureHeight;
  if (w <= 0 || h <= 0 || width < 4 || height < 4) return null;
  const x = clamp01((screenX - originX) / w);
  const y = clamp01((screenY - originY) / h);
  const nw = clamp01(width / w);
  const nh = clamp01(height / h);
  if (nw <= 0 || nh <= 0) return null;
  return { x, y, w: Math.min(nw, 1 - x), h: Math.min(nh, 1 - y) };
}

function rawToMark(raw: RawElement, input: CompanionUiMapBuildInput): UiMark | null {
  const bounds = toNormalizedRect(raw.x, raw.y, raw.w, raw.h, input);
  if (!bounds) return null;
  return {
    id: raw.id,
    label: raw.label?.trim() || undefined,
    bounds,
    source: raw.source,
  };
}

/** Enumerate AX buttons/text via System Events (requires Accessibility). */
async function enumerateAxElements(windowBounds?: WindowBounds): Promise<RawElement[]> {
  if (process.platform !== "darwin") return [];
  const script = `
set output to ""
tell application "System Events"
  set frontProc to first application process whose frontmost is true
  set procName to name of frontProc
  if (count of windows of frontProc) is 0 then return "[]"
  set frontWin to front window of frontProc
  set idx to 0
  repeat with el in (UI elements of frontWin)
    try
      set elRole to role of el
      if elRole is in {"AXButton", "AXTextField", "AXTextArea", "AXStaticText", "AXLink", "AXMenuButton"} then
        set p to position of el
        set s to size of el
        set elName to ""
        try
          set elName to name of el
        end try
        set elTitle to ""
        try
          set elTitle to title of el
        end try
        set elValue to ""
        try
          set elValue to value of el
        end try
        set labelText to elName
        if elTitle is not "" then set labelText to elTitle
        if labelText is "" and elValue is not "" then set labelText to elValue
        set idx to idx + 1
        if idx > 24 then exit repeat
        set output to output & "ax-" & idx & "|" & labelText & "|" & (item 1 of p) & "|" & (item 2 of p) & "|" & (item 1 of s) & "|" & (item 2 of s) & linefeed
      end if
    end try
  end repeat
end tell
return output
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 2500,
      maxBuffer: 256 * 1024,
    });
    const lines = stdout.trim().split("\n").filter(Boolean);
    const elements: RawElement[] = [];
    for (const line of lines) {
      const [id, label, x, y, w, h] = line.split("|");
      if (!id || !x || !y || !w || !h) continue;
      const sx = Number(x);
      const sy = Number(y);
      const sw = Number(w);
      const sh = Number(h);
      if (!Number.isFinite(sx) || sw < 4 || sh < 4) continue;
      elements.push({
        id,
        label: label?.slice(0, 80),
        x: sx,
        y: sy,
        w: sw,
        h: sh,
        source: "ax",
      });
    }
    if (elements.length === 0 && windowBounds) {
      elements.push({
        id: "ax-window",
        label: getCachedWindowContext().windowTitle ?? "Front window",
        x: windowBounds.x,
        y: windowBounds.y,
        w: windowBounds.width,
        h: windowBounds.height,
        source: "ax",
      });
    }
    return elements;
  } catch {
    if (windowBounds) {
      return [
        {
          id: "ax-window",
          label: getCachedWindowContext().windowTitle ?? "Front window",
          x: windowBounds.x,
          y: windowBounds.y,
          w: windowBounds.width,
          h: windowBounds.height,
          source: "ax",
        },
      ];
    }
    return [];
  }
}

const CHROME_DOM_JS = `(function(){
  var sel = 'a,button,input,select,textarea,[role=button],[role=link]';
  var els = Array.from(document.querySelectorAll(sel)).slice(0, 32);
  return JSON.stringify(els.map(function(el, i){
    var r = el.getBoundingClientRect();
    var label = (el.innerText || el.placeholder || el.getAttribute('aria-label') || el.title || el.name || '').trim().slice(0, 60);
    return { i: i + 1, label: label, x: r.x, y: r.y, w: r.width, h: r.height };
  }).filter(function(o){ return o.w >= 4 && o.h >= 4; }));
})()`;

/** Chrome active tab DOM rects via AppleScript execute javascript. */
async function enumerateChromeDomElements(
  windowBounds: WindowBounds | undefined,
): Promise<RawElement[]> {
  if (process.platform !== "darwin") return [];
  const ctx = getCachedWindowContext();
  const app = ctx.appName ?? "";
  if (!/chrome|chromium|brave|edge/i.test(app)) return [];

  const browser = /brave/i.test(app)
    ? "Brave Browser"
    : /edge/i.test(app)
      ? "Microsoft Edge"
      : /chromium/i.test(app)
        ? "Chromium"
        : "Google Chrome";

  const escapedJs = CHROME_DOM_JS.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
tell application "${browser}"
  if not running then return "[]"
  set jsResult to execute active tab of front window javascript "${escapedJs}"
  return jsResult
end tell
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 3000,
      maxBuffer: 512 * 1024,
    });
    const parsed = JSON.parse(stdout.trim()) as Array<{
      i: number;
      label?: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }>;
    const offsetX = windowBounds?.x ?? 0;
    const offsetY = windowBounds?.y ?? 0;
    const chromeChrome = 80;
    return parsed.map((el) => ({
      id: `dom-${el.i}`,
      label: el.label,
      x: offsetX + el.x,
      y: offsetY + el.y + chromeChrome,
      w: el.w,
      h: el.h,
      source: "dom" as const,
    }));
  } catch {
    return [];
  }
}

export async function buildCompanionLocalUiMap(
  input: CompanionUiMapBuildInput,
): Promise<UiMap | null> {
  if (process.platform !== "darwin") return null;
  const ctx = getCachedWindowContext();
  const windowBounds = ctx.windowBounds;

  const [axRaw, domRaw] = await Promise.all([
    enumerateAxElements(windowBounds),
    enumerateChromeDomElements(windowBounds),
  ]);

  const raw = [...domRaw, ...axRaw];
  const marks = raw
    .map((r) => rawToMark(r, input))
    .filter((m): m is UiMark => m != null);

  const extra = input.extraMarks ?? [];
  const combined = [...marks, ...extra];

  if (!combined.length) return null;

  return {
    captureId: input.captureId,
    width: input.captureWidth,
    height: input.captureHeight,
    marks: combined.slice(0, 48),
  };
}

/** Serialize marks for vision model context (Set-of-Marks appendix). */
export function formatUiMapForVisionPrompt(uiMap: UiMap): string {
  const lines = [
    "Interactive regions detected on screen (reference these mark ids in companion JSON):",
    ...uiMap.marks.map(
      (m) =>
        `- ${m.id} [${m.source}]${m.label ? ` "${m.label}"` : ""} bounds={x:${m.bounds.x.toFixed(3)},y:${m.bounds.y.toFixed(3)},w:${m.bounds.w.toFixed(3)},h:${m.bounds.h.toFixed(3)}}`,
    ),
  ];
  return lines.join("\n");
}
