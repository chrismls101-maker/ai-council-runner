/**
 * Shared helpers for live Listen mode QA (screen context + real system audio).
 * Pure logic lives in listenLiveHarness.ts; this module adds macOS I/O.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractMediaContext } from "../../src/shared/mediaContextExtract.ts";
import {
  CONTEXT_FALLBACK_QUESTIONS,
  STUB_CANARY,
  COUNCIL_MARKERS,
  analyzeListenMomentWithHarness,
  applyHarnessMomentDecision,
  buildHarnessListenReport,
  createListenHarnessRuntime,
  evaluateListenMomentsFromTranscript,
  gradeListenLiveAnswer,
  gradeMediaExtraction,
  hasEnoughTranscriptForQuestion,
  parseListenLiveMinutes,
  pickContextAwareQuestion,
  runServerPreflight,
  sessionHasRawAudioOrBase64,
  summarizeMomentStats,
} from "../../src/shared/listenLiveHarness.ts";

export {
  CONTEXT_FALLBACK_QUESTIONS as LISTEN_LIVE_QUESTIONS,
  STUB_CANARY,
  COUNCIL_MARKERS,
  analyzeListenMomentWithHarness,
  applyHarnessMomentDecision,
  buildHarnessListenReport,
  createListenHarnessRuntime,
  evaluateListenMomentsFromTranscript as evaluateListenMomentsFromChunks,
  gradeListenLiveAnswer,
  gradeMediaExtraction,
  hasEnoughTranscriptForQuestion,
  pickContextAwareQuestion,
  runServerPreflight,
  sessionHasRawAudioOrBase64,
  summarizeMomentStats,
};

export const OUT_DIR = "/tmp/iivo-glass-listen-live";
export const RESULTS_JSONL = join(OUT_DIR, "LISTEN_LIVE_RESULTS.jsonl");
export const REPORT_MD = join(OUT_DIR, "LISTEN_LIVE_REPORT.md");
export const LISTEN_REPORT_MD = join(OUT_DIR, "LISTEN_REPORT.md");

export function parseListenLiveArgs(argv = process.argv.slice(2)) {
  return { minutes: parseListenLiveMinutes(argv) };
}

export function resolveSessionsPath() {
  if (process.env.GLASS_SESSIONS_PATH) return process.env.GLASS_SESSIONS_PATH;
  const candidates = [
    join(homedir(), "Library/Application Support/iivo-glass/glass-sessions.json"),
    join(homedir(), "Library/Application Support/IIVO Glass/glass-sessions.json"),
    join(homedir(), "Library/Application Support/Electron/glass-sessions.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

export function readSessionsStore(path) {
  if (!existsSync(path)) return { sessions: [], currentSessionId: null };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { sessions: [], currentSessionId: null };
  }
}

export function getActiveSession(store) {
  const id = store.currentSessionId;
  if (id) {
    const hit = store.sessions?.find((s) => s.id === id);
    if (hit) return hit;
  }
  const active = store.sessions?.find((s) => s.status === "active" || s.status === "paused");
  return active ?? store.sessions?.[store.sessions.length - 1] ?? null;
}

export function collectSystemAudioChunks(session) {
  if (!session?.events) return [];
  return session.events.filter(
    (e) =>
      e.kind === "transcript_note" &&
      Array.isArray(e.tags) &&
      e.tags.includes("system_audio") &&
      (e.text ?? e.title)?.trim(),
  );
}

export function collectMicrophoneChunks(session) {
  if (!session?.events) return [];
  return session.events.filter(
    (e) =>
      e.kind === "transcript_note" &&
      Array.isArray(e.tags) &&
      e.tags.includes("microphone") &&
      (e.text ?? e.title)?.trim(),
  );
}

export function collectListenMomentEvents(session) {
  if (!session?.events) return [];
  return session.events.filter((e) => e.tags?.includes("listen_moment"));
}

/** @deprecated use analyzeListenMomentWithHarness */
export function analyzeListenMomentEngine(opts) {
  const runtime = createListenHarnessRuntime(opts.attentionLevel ?? "balanced");
  return analyzeListenMomentWithHarness({
    moments: opts.moments,
    runtime,
    recentTranscriptChars: opts.recentTranscriptChars ?? 0,
  });
}

export function macFrontWindowContext() {
  if (process.platform !== "darwin") {
    return { appName: undefined, windowTitle: undefined, error: "not macOS" };
  }
  try {
    const appName = execFileSync("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ])
      .toString()
      .trim();
    let windowTitle;
    try {
      windowTitle = execFileSync("osascript", [
        "-e",
        'tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window',
      ])
        .toString()
        .trim();
    } catch {
      windowTitle = undefined;
    }
    return { appName, windowTitle };
  } catch (err) {
    return { appName: undefined, windowTitle: undefined, error: String(err) };
  }
}

const BROWSER_SCRIPTS = {
  "Google Chrome": 'tell application "Google Chrome" to get URL of active tab of front window',
  Arc: 'tell application "Arc" to get URL of active tab of front window',
  "Brave Browser": 'tell application "Brave Browser" to get URL of active tab of front window',
  "Microsoft Edge": 'tell application "Microsoft Edge" to get URL of active tab of front window',
  Safari: 'tell application "Safari" to get URL of current tab of front window',
};

export function macBrowserUrl(appName) {
  if (process.platform !== "darwin" || !appName) return undefined;
  const script = BROWSER_SCRIPTS[appName];
  if (!script) return undefined;
  try {
    const url = execFileSync("osascript", ["-e", script]).toString().trim();
    if (url.startsWith("http")) return url;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function captureMacMediaContext() {
  const { appName, windowTitle, error } = macFrontWindowContext();
  const browserUrl = macBrowserUrl(appName);
  const media = extractMediaContext({ appName, windowTitle, browserUrl });
  return { appName, windowTitle, browserUrl, media, error };
}

export function mediaContextFromSession(session) {
  if (!session?.events) return null;
  for (const e of [...session.events].reverse()) {
    const meta = e.metadata?.mediaContext;
    if (meta) return meta;
  }
  return null;
}

export function buildListenLiveAskSession({ mediaContext, systemAudioChunks, runningTranscript = "" }) {
  const chunks = systemAudioChunks.map((e) => ({
    text: (e.text ?? e.title ?? "").trim(),
    source: "system_audio",
    timestamp: e.timestamp ?? new Date().toISOString(),
  }));
  const recentTranscriptWindow =
    chunks.map((c) => c.text).join(" ").trim() || runningTranscript.trim();
  return {
    recentTranscript: recentTranscriptWindow.slice(-1500),
    activeListening: {
      enabled: true,
      activeMode: "listen",
      windowMinutes: 5,
      chunkCount: chunks.length,
      systemAudioChunkCount: chunks.length,
      microphoneChunkCount: 0,
      recentTranscriptWindow,
      chunks: chunks.slice(-40),
      sessionFocus: "video_learning",
      copilotMode: "coaching",
      contextThin: recentTranscriptWindow.length < 80,
      mediaContext: mediaContext ?? undefined,
    },
  };
}

export function appendResult(record) {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(RESULTS_JSONL, `${JSON.stringify(record)}\n`);
}

export function writeReport(markdown, path = REPORT_MD) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path, markdown);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function sanitize(s, max = 400) {
  if (!s) return "";
  let t = String(s)
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[redacted-image]")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > max) t = `${t.slice(0, max)}…`;
  return t;
}

export function diagnoseFailure(category, cause, fix) {
  return { category, cause, fix };
}
