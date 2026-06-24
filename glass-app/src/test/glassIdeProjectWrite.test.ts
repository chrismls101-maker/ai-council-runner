import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  readGlassIdeProjectFile,
  writeGlassIdeProjectFile,
} from "../main/glassIdeProject.ts";
import { GLASS_IDE_MAX_FILE_BYTES } from "../shared/glassIdeProject.ts";

test("writeGlassIdeProjectFile round-trips content", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-write-"));
  try {
    const filePath = path.join(root, "hello.ts");
    await fs.writeFile(filePath, "export const a = 1;\n", "utf8");
    const res = await writeGlassIdeProjectFile(root, "hello.ts", "export const a = 2;\n");
    assert.equal(res.ok, true);
    const onDisk = await fs.readFile(filePath, "utf8");
    assert.equal(onDisk, "export const a = 2;\n");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("writeGlassIdeProjectFile rejects path outside project root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-write-"));
  try {
    const res = await writeGlassIdeProjectFile(root, "../../../etc/passwd", "x");
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /outside the project root/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("writeGlassIdeProjectFile rejects new files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-write-"));
  try {
    const res = await writeGlassIdeProjectFile(root, "does-not-exist.ts", "x");
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /does not exist/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("writeGlassIdeProjectFile rejects oversize content", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-write-"));
  try {
    await fs.writeFile(path.join(root, "big.txt"), "x", "utf8");
    const huge = "a".repeat(GLASS_IDE_MAX_FILE_BYTES + 1);
    const res = await writeGlassIdeProjectFile(root, "big.txt", huge);
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /byte limit/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("readGlassIdeProjectFile still works after write", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-write-"));
  try {
    await fs.writeFile(path.join(root, "note.md"), "# hi", "utf8");
    await writeGlassIdeProjectFile(root, "note.md", "# updated");
    const read = await readGlassIdeProjectFile(root, "note.md");
    assert.equal(read.ok, true);
    assert.equal(read.content, "# updated");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
