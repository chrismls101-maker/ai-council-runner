import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AletheiaNote } from "../shared/aletheiaNotes.ts";
import type { GlassProjectRecord } from "../shared/glassStorageProjectTypes.ts";
import { loadGlassStorageProjectsIndex } from "../main/storage/glassStorageProjectsStore.ts";
import { saveGlassStorageProjectsIndex } from "../main/storage/glassStorageProjectsStore.ts";
import { designToCodeProjectDir } from "../main/storage/glassStoragePaths.ts";
import { resolveAletheiaDiagnosticContext } from "../shared/memory/resolveAletheiaDiagnosticContext.ts";
import { isDesignToCodeRecallPrompt } from "../shared/design/designToCodeProjectRecall.ts";

async function withRestartFixture(
  fn: (ctx: {
    userData: string;
    projectId: string;
    reloadedProjects: GlassProjectRecord[];
    persistedNotes: AletheiaNote[];
    latestProjectId: string;
  }) => Promise<void>,
): Promise<void> {
  const userData = await fs.mkdtemp(join(tmpdir(), "glass-memory-restart-"));
  const projectId = "cap-restart-1";
  const rootPath = designToCodeProjectDir(userData, projectId);
  await fs.mkdir(rootPath, { recursive: true });
  await fs.writeFile(join(rootPath, "result.tsx"), "export function Card() { return null; }\n", "utf8");
  await fs.writeFile(
    join(rootPath, "session.json"),
    JSON.stringify({
      version: 1,
      designCaptureId: projectId,
      createdAt: 1,
      updatedAt: 2,
      action: "react",
      stack: "react-tsx",
      refinementHistory: [],
    }),
    "utf8",
  );

  const record: GlassProjectRecord = {
    id: projectId,
    kind: "design-to-code",
    title: "Hero.tsx — Design to Code",
    createdAt: 1,
    updatedAt: 2,
    category: "Projects",
    source: "Design to Code",
    designCaptureId: projectId,
    rootPath,
    primaryFilePath: join(rootPath, "result.tsx"),
    manifestPath: join(rootPath, "session.json"),
    status: "ready",
    action: "react",
    stack: "react-tsx",
    detectedFileName: "Hero.tsx",
    revisionCount: 0,
  };
  await saveGlassStorageProjectsIndex(userData, [record]);

  const persistedNotes: AletheiaNote[] = [
    {
      id: "note-restart-1",
      body: "Design to Code: React component (Hero.tsx) — saved to Glass Storage under Projects.",
      category: "observation",
      source: "assistant",
      linkedProjectId: projectId,
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 5000,
    },
  ];

  try {
    const reloadedProjects = await loadGlassStorageProjectsIndex(userData);
    await fn({
      userData,
      projectId,
      reloadedProjects,
      persistedNotes,
      latestProjectId: projectId,
    });
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
}

describe("glassMemoryRestartRecall", () => {
  test("reloads projects index and resolves recall without live captures", async () => {
    await withRestartFixture(async (ctx) => {
      assert.equal(ctx.reloadedProjects.length, 1);
      assert.equal(ctx.reloadedProjects[0]!.id, ctx.projectId);

      const ctxText = resolveAletheiaDiagnosticContext({
        prompt: "what happened with design to code?",
        companionModeActive: false,
        notes: ctx.persistedNotes,
        projects: ctx.reloadedProjects,
        captures: undefined,
        latestProjectId: ctx.latestProjectId,
      });

      assert.ok(ctxText);
      assert.match(ctxText!, /Hero\.tsx/);
      assert.match(ctxText!, /Glass Storage project metadata/);
      assert.match(ctxText!, /saved to Glass Storage/);
      assert.doesNotMatch(ctxText!, /Recent Design to Code activity/);
    });
  });

  test("where-is-it prompt matches recall after simulated restart", async () => {
    await withRestartFixture(async (ctx) => {
      assert.equal(isDesignToCodeRecallPrompt("where is it?"), true);

      const ctxText = resolveAletheiaDiagnosticContext({
        prompt: "where did you save it?",
        companionModeActive: false,
        notes: ctx.persistedNotes,
        projects: ctx.reloadedProjects,
        captures: {},
        latestProjectId: ctx.latestProjectId,
      });

      assert.ok(ctxText);
      assert.match(ctxText!, /projectId=cap-restart-1/);
      assert.match(ctxText!, /Glass Storage → Projects/);
    });
  });
});
