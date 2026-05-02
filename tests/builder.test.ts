import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCapsule } from "../apps/cli/src/core/builder";
import { readCapsuleArchive } from "../apps/cli/src/core/archive";
import { strFromU8 } from "fflate";

describe("builder", () => {
  test("build includes declared assets in the archive", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "capsule-test-build-"));

    try {
      // Create a minimal capsule project
      await writeFile(
        join(tempDir, "capsule.config.ts"),
        [
          "export default {",
          '  name: "asset-test",',
          '  version: "1.0.0",',
          '  entry: "src/index.ts",',
          '  assets: ["static/**/*.txt", "config/*.json"],',
          "};",
        ].join("\n"),
      );

      await mkdir(join(tempDir, "src"), { recursive: true });
      await writeFile(join(tempDir, "src", "index.ts"), 'console.log("hello");');

      await mkdir(join(tempDir, "static", "data"), { recursive: true });
      await writeFile(join(tempDir, "static", "data", "hello.txt"), "hello world");

      await mkdir(join(tempDir, "config"), { recursive: true });
      await writeFile(join(tempDir, "config", "settings.json"), JSON.stringify({ key: "value" }));

      const result = await buildCapsule({ cwd: tempDir, output: join(tempDir, "dist", "asset-test.capsule.app") });

      const archiveBytes = new Uint8Array(await readFile(result.outputPath));
      const archive = readCapsuleArchive(archiveBytes);

      // Core files exist
      expect(archive.files["manifest.json"]).toBeDefined();
      expect(archive.files["bundle.js"]).toBeDefined();

      // Asset files exist in the archive
      expect(archive.files["static/data/hello.txt"]).toBeDefined();
      expect(strFromU8(archive.files["static/data/hello.txt"])).toBe("hello world");

      expect(archive.files["config/settings.json"]).toBeDefined();
      expect(strFromU8(archive.files["config/settings.json"])).toBe(JSON.stringify({ key: "value" }));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
