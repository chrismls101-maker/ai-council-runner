import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  importGlassStorageFiles,
  listGlassStorageFiles,
  deleteGlassStorageFile,
} from "../main/storage/glassStorageFilesStore.ts";
import { glassStorageFilesDir } from "../main/storage/glassStoragePaths.ts";

test("importGlassStorageFiles copies files into glass-storage/files", async () => {
  const userData = await mkdtemp(join(tmpdir(), "glass-files-"));
  const source = join(userData, "note.txt");
  await writeFile(source, "hello glass storage", "utf8");

  const imported = await importGlassStorageFiles(userData, [source]);
  assert.equal(imported.length, 1);
  assert.equal(imported[0]?.name, "note.txt");

  const listed = await listGlassStorageFiles(userData);
  assert.equal(listed.length, 1);
  const onDisk = await readFile(join(glassStorageFilesDir(userData), "note.txt"), "utf8");
  assert.equal(onDisk, "hello glass storage");

  const deleted = await deleteGlassStorageFile(userData, "note.txt");
  assert.equal(deleted, true);
  assert.equal((await listGlassStorageFiles(userData)).length, 0);
});
