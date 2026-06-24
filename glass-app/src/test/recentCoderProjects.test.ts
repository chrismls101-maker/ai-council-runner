import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectFolderLabel,
  touchRecentCoderProject,
  RECENT_CODER_PROJECTS_MAX,
} from "../shared/recentCoderProjects.ts";

test("touchRecentCoderProject moves folder to front and dedupes", () => {
  const next = touchRecentCoderProject(["/b", "/a"], "/c");
  assert.deepEqual(next, ["/c", "/b", "/a"]);
  const again = touchRecentCoderProject(next, "/b");
  assert.deepEqual(again, ["/b", "/c", "/a"]);
});

test("touchRecentCoderProject caps list length", () => {
  const seed = Array.from({ length: RECENT_CODER_PROJECTS_MAX }, (_, i) => `/p${i}`);
  const next = touchRecentCoderProject(seed, "/new");
  assert.equal(next.length, RECENT_CODER_PROJECTS_MAX);
  assert.equal(next[0], "/new");
});

test("projectFolderLabel returns basename", () => {
  assert.equal(projectFolderLabel("/Users/me/projects/my-app"), "my-app");
});
