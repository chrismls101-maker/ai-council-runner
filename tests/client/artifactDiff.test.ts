import assert from "node:assert/strict";

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

await test("artifactDiff: table changed cell highlighted", async () => {
  const { diffTable } = await import("../../src/utils/artifactDiff.ts");
  const diff = diffTable(
    {
      columns: ["Item", "Cost"],
      rows: [{ Item: "A", Cost: "10" }],
    },
    {
      columns: ["Item", "Cost"],
      rows: [{ Item: "A", Cost: "12" }],
    },
  );
  assert.equal(diff.mode, "table");
  assert.equal(diff.changedCells.length, 1);
  assert.equal(diff.changedCells[0]!.after, "12");
});

await test("artifactDiff: checklist added item", async () => {
  const { diffChecklist } = await import("../../src/utils/artifactDiff.ts");
  const diff = diffChecklist(
    { items: [{ label: "One", checked: false }] },
    {
      items: [
        { label: "One", checked: false },
        { label: "Two", checked: true, note: "new" },
      ],
    },
  );
  assert.equal(diff.changes.some((c) => c.type === "added" && c.label === "Two"), true);
});

await test("artifactDiff: text fallback still works", async () => {
  const { diffArtifactSectionContent } = await import("../../src/utils/artifactDiff.ts");
  const diff = diffArtifactSectionContent("line one", "line two", "text");
  assert.equal(diff.mode, "text");
  assert.ok(diff.lines.some((l) => l.type === "remove" || l.type === "add"));
});
