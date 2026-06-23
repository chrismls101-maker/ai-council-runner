import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  findStaticPreviewServeDir,
  startStaticPreviewServer,
  stopStaticPreviewServer,
} from "../main/glassIdeStaticServer.ts";

test("findStaticPreviewServeDir prefers project root index.html", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-static-"));
  try {
    await fs.writeFile(path.join(root, "index.html"), "<html></html>");
    const serveDir = await findStaticPreviewServeDir(root);
    assert.equal(serveDir, root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("findStaticPreviewServeDir checks public/index.html", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-static-"));
  try {
    const publicDir = path.join(root, "public");
    await fs.mkdir(publicDir);
    await fs.writeFile(path.join(publicDir, "index.html"), "<html></html>");
    const serveDir = await findStaticPreviewServeDir(root);
    assert.equal(serveDir, publicDir);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("startStaticPreviewServer serves index on loopback", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glass-ide-static-"));
  try {
    await fs.writeFile(path.join(root, "index.html"), "<html><body>hi</body></html>");
    const url = await startStaticPreviewServer(root);
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(url);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /hi/);
  } finally {
    await stopStaticPreviewServer();
    await fs.rm(root, { recursive: true, force: true });
  }
});
