import { promises as fs } from "node:fs";
import { join } from "node:path";
import { nativeImage } from "electron";
import type {
  DesignStack,
  DesignToCodeAction,
  DesignToCodeSession,
} from "../../shared/designToCode.ts";
import { extractFirstCodeBlock } from "../../shared/markdownCode.ts";
import type {
  DesignToCodeSessionManifest,
  GlassProjectRecord,
} from "../../shared/glassStorageProjectTypes.ts";
import { parseDataUrl } from "../../shared/sessionScreenshotPaths.ts";
import {
  designToCodeProjectDir,
  designToCodeProjectsRoot,
} from "../storage/glassStoragePaths.ts";
import { upsertGlassStorageProject } from "../storage/glassStorageProjectsStore.ts";
import {
  primaryOutputFileName,
  titleForDesignToCodeProject,
  summaryForDesignToCodeProject,
  formatCaptureTimestamp,
} from "./designToCodeProjectNaming.ts";

const THUMB_WIDTH = 320;

export type SaveDesignToCodeResult = {
  ok: boolean;
  record?: GlassProjectRecord;
  error?: string;
};

function projectStatus(
  session: DesignToCodeSession,
  saveOk: boolean,
): GlassProjectRecord["status"] {
  if (!saveOk) return "failed";
  if (session.latestWarnings?.length) return "warning";
  return "ready";
}

function warningSummaryForRecord(session: DesignToCodeSession): string | undefined {
  const warnings = session.latestWarnings;
  if (!warnings?.length) return undefined;
  const text = warnings.slice(0, 3).join("; ");
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

async function writeImagePair(
  imageDataUrl: string,
  capturePath: string,
  thumbPath: string,
): Promise<void> {
  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed) throw new Error("Invalid capture image data.");
  await fs.writeFile(capturePath, parsed.buffer);
  const image = nativeImage.createFromBuffer(parsed.buffer);
  const size = image.getSize();
  const scale = size.width > THUMB_WIDTH ? THUMB_WIDTH / size.width : 1;
  const thumb = image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  });
  await fs.writeFile(thumbPath, thumb.toPNG());
}

function buildNotesMarkdown(session: DesignToCodeSession, action: DesignToCodeAction): string {
  const lines: string[] = [
    "# Design to Code session notes",
    "",
    `Action: ${action}`,
    "",
  ];
  if (session.latestWarnings?.length) {
    lines.push("## Fidelity notes", "");
    for (const w of session.latestWarnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }
  if (session.quality?.recommendation) {
    lines.push("## Capture quality", "", session.quality.recommendation, "");
  }
  if (session.refinementHistory.length) {
    lines.push("## Refinement history", "");
    for (const entry of session.refinementHistory) {
      lines.push(`- ${entry.text}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function resolvePrimaryContent(
  session: DesignToCodeSession,
  action: DesignToCodeAction,
  fullBody?: string,
): string {
  if (action === "describe") {
    return session.latestResult ?? fullBody ?? "";
  }
  const fromResult = session.latestResult?.trim();
  if (fromResult) return fromResult;
  const block = fullBody ? extractFirstCodeBlock(fullBody) : null;
  return block ?? fullBody ?? "";
}

async function archivePrimaryRevision(
  rootPath: string,
  primaryName: string,
): Promise<number> {
  const primaryPath = join(rootPath, primaryName);
  try {
    await fs.access(primaryPath);
  } catch {
    return 0;
  }
  const revisionsDir = join(rootPath, "revisions");
  await fs.mkdir(revisionsDir, { recursive: true });
  const stamp = formatCaptureTimestamp(Date.now());
  await fs.copyFile(primaryPath, join(revisionsDir, `${stamp}_${primaryName}`));
  try {
    const entries = await fs.readdir(revisionsDir);
    return entries.length;
  } catch {
    return 1;
  }
}

async function countRevisions(rootPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(join(rootPath, "revisions"));
    return entries.length;
  } catch {
    return 0;
  }
}

export async function saveDesignToCodeProject(input: {
  userDataPath: string;
  session: DesignToCodeSession;
  action: DesignToCodeAction;
  stack: DesignStack;
  fullBody?: string;
  existingProjectId?: string;
}): Promise<SaveDesignToCodeResult> {
  const { userDataPath, session, action, stack, fullBody } = input;
  const projectId = input.existingProjectId ?? session.feedItemId;
  const now = Date.now();
  const title = titleForDesignToCodeProject(session, action);
  const rootPath = designToCodeProjectDir(userDataPath, projectId);

  try {
    await fs.mkdir(designToCodeProjectsRoot(userDataPath), { recursive: true });
    await fs.mkdir(rootPath, { recursive: true });

    const capturePath = join(rootPath, "capture.png");
    const thumbPath = join(rootPath, "thumb.png");
    await writeImagePair(session.imageDataUrl, capturePath, thumbPath);

    const primaryName = primaryOutputFileName(action, stack);
    const primaryFilePath = join(rootPath, primaryName);
    const revisionCount = await archivePrimaryRevision(rootPath, primaryName);
    const primaryContent = resolvePrimaryContent(session, action, fullBody);
    if (!primaryContent.trim()) {
      throw new Error("No output content to save.");
    }
    await fs.writeFile(primaryFilePath, primaryContent, "utf8");

    const manifest: DesignToCodeSessionManifest = {
      version: 1,
      designCaptureId: session.feedItemId,
      createdAt: session.createdAt,
      updatedAt: now,
      action,
      stack,
      activeApp: session.activeApp,
      activeWindowTitle: session.activeWindowTitle,
      detectedEditor: session.detectedEditor,
      detectedFile: session.detectedFile ?? null,
      refinementHistory: session.refinementHistory,
      latestWarnings: session.latestWarnings,
      quality: session.quality,
      screenSpec: session.screenSpec,
      codebaseStylePack: session.codebaseStylePack,
    };
    const manifestPath = join(rootPath, "session.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    if (session.screenSpec) {
      await fs.writeFile(
        join(rootPath, "screen-spec.json"),
        JSON.stringify(session.screenSpec, null, 2),
        "utf8",
      );
    }

    await fs.writeFile(join(rootPath, "notes.md"), buildNotesMarkdown(session, action), "utf8");

    const record: GlassProjectRecord = {
      id: projectId,
      kind: "design-to-code",
      title,
      createdAt: session.createdAt,
      updatedAt: now,
      category: "Projects",
      source: "Design to Code",
      summary: summaryForDesignToCodeProject(action, stack),
      stack,
      action,
      detectedEditor: session.detectedEditor,
      detectedFileName: session.detectedFile?.fileName,
      designCaptureId: session.feedItemId,
      previewImagePath: capturePath,
      previewThumbPath: thumbPath,
      rootPath,
      primaryFilePath,
      manifestPath,
      tags: [action, stack],
      status: projectStatus(session, true),
      revisionCount: revisionCount || (await countRevisions(rootPath)),
      warningSummary: warningSummaryForRecord(session),
    };

    await upsertGlassStorageProject(userDataPath, record);
    return { ok: true, record };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DesignToCode] save project ${projectId}:`, err);
    const partial: GlassProjectRecord = {
      id: projectId,
      kind: "design-to-code",
      title,
      createdAt: session.createdAt,
      updatedAt: now,
      category: "Projects",
      source: "Design to Code",
      summary: summaryForDesignToCodeProject(action, stack),
      stack,
      action,
      detectedEditor: session.detectedEditor,
      detectedFileName: session.detectedFile?.fileName,
      designCaptureId: session.feedItemId,
      rootPath,
      status: "failed",
      saveError: message,
      warningSummary: warningSummaryForRecord(session),
    };
    try {
      await upsertGlassStorageProject(userDataPath, partial);
    } catch {
      /* index write failed too */
    }
    return { ok: false, error: message, record: partial };
  }
}
