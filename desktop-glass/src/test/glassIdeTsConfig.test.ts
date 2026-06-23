import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { readGlassIdeTsConfig } from "../main/glassIdeTsConfig.ts";
import {
  DEFAULT_MONACO_COMPILER_OPTIONS,
  mapRawTsConfigCompilerOptions,
  mergeMonacoCompilerOptions,
  TS_CONFIG_CANDIDATES,
} from "../shared/glassIdeTsConfig.ts";

describe("glassIdeTsConfig shared", () => {
  it("mergeMonacoCompilerOptions always forces noEmit", () => {
    const merged = mergeMonacoCompilerOptions(DEFAULT_MONACO_COMPILER_OPTIONS, {
      strict: true,
      noEmit: false,
    });
    assert.equal(merged.noEmit, true);
    assert.equal(merged.strict, true);
  });

  it("mapRawTsConfigCompilerOptions picks known keys", () => {
    const mapped = mapRawTsConfigCompilerOptions({
      allowJs: true,
      strict: true,
      lib: ["es2022", "dom"],
      baseUrl: "./src",
      paths: { "@/*": ["src/*"] },
      noise: "ignored",
    });
    assert.equal(mapped.allowJs, true);
    assert.equal(mapped.strict, true);
    assert.deepEqual(mapped.lib, ["es2022", "dom"]);
    assert.equal(mapped.baseUrl, "./src");
    assert.deepEqual(mapped.paths, { "@/*": ["src/*"] });
  });

  it("TS_CONFIG_CANDIDATES prefers tsconfig before jsconfig", () => {
    assert.equal(TS_CONFIG_CANDIDATES[0], "tsconfig.json");
    assert.ok(TS_CONFIG_CANDIDATES.includes("jsconfig.json"));
  });
});

describe("readGlassIdeTsConfig", () => {
  it("returns defaults when no config file exists", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glass-ide-ts-"));
    const res = await readGlassIdeTsConfig(dir);
    assert.equal(res.ok, true);
    assert.equal(res.configPath, null);
    assert.equal(res.compilerOptions?.noEmit, true);
    assert.equal(res.compilerOptions?.allowJs, true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("parses tsconfig.json compiler options even without source files", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glass-ide-ts-"));
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          jsx: "react-jsx",
          baseUrl: ".",
          paths: { "@app/*": ["src/*"] },
        },
      }),
    );
    const res = await readGlassIdeTsConfig(dir);
    assert.equal(res.ok, true);
    assert.equal(res.configPath, "tsconfig.json");
    assert.equal(res.compilerOptions?.strict, true);
    assert.ok(typeof res.compilerOptions?.baseUrl === "string");
    assert.deepEqual(res.compilerOptions?.paths, { "@app/*": ["src/*"] });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rejects missing project folder", async () => {
    const res = await readGlassIdeTsConfig(path.join(os.tmpdir(), "glass-ide-missing-xyz"));
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /not found/i);
  });
});
