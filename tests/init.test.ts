import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createProjectFiles, type InitConfig } from "../apps/cli/src/commands/init";
import { withTempHome } from "./helpers";

describe("init", () => {
  beforeEach(() => {
    process.exitCode = undefined;
  });

  test("creates capsule.config.ts with the correct content", async () => {
    await withTempHome(async (home) => {
      const config: InitConfig = {
        name: "test-app",
        version: "1.0.0",
        description: "A test app",
        entry: "src/index.ts",
      };

      await createProjectFiles(home, config);

      const configPath = join(home, "capsule.config.ts");
      expect(existsSync(configPath)).toBe(true);

      const content = await readFile(configPath, "utf8");
      expect(content).toContain('name: "test-app"');
      expect(content).toContain('version: "1.0.0"');
      expect(content).toContain('description: "A test app"');
      expect(content).toContain('entry: "src/index.ts"');
    });
  });

  test("creates the entry file with boilerplate content", async () => {
    await withTempHome(async (home) => {
      await createProjectFiles(home, { name: "myapp", version: "1.0.0", entry: "src/index.ts" });

      const entryPath = join(home, "src", "index.ts");
      expect(existsSync(entryPath)).toBe(true);

      const content = await readFile(entryPath, "utf8");
      expect(content).toContain("Hello from Capsule");
    });
  });

  test("creates nested entry directory if it does not exist", async () => {
    await withTempHome(async (home) => {
      await createProjectFiles(home, { name: "deep-app", version: "1.0.0", entry: "lib/cli.ts" });

      expect(existsSync(join(home, "lib", "cli.ts"))).toBe(true);
    });
  });

  test("throws when capsule.config.ts already exists", async () => {
    await withTempHome(async (home) => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(home, "capsule.config.ts"), 'export default { name: "existing" };');

      expect(createProjectFiles(home, { name: "dup", version: "1.0.0", entry: "src/index.ts" })).rejects.toThrow(
        "capsule.config.ts already exists",
      );
    });
  });

  test("omits description from config when not provided", async () => {
    await withTempHome(async (home) => {
      await createProjectFiles(home, { name: "no-desc", version: "2.0.0", entry: "main.ts" });

      const content = await readFile(join(home, "capsule.config.ts"), "utf8");
      expect(content).toContain('name: "no-desc"');
      expect(content).toContain('version: "2.0.0"');
      expect(content).toContain('entry: "main.ts"');
      expect(content).not.toContain("description:");
    });
  });

  test("does not overwrite an existing entry file", async () => {
    await withTempHome(async (home) => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(join(home, "src"), { recursive: true });
      await writeFile(join(home, "src", "index.ts"), 'console.log("custom");');

      await createProjectFiles(home, { name: "keep-entry", version: "1.0.0", entry: "src/index.ts" });

      const content = await readFile(join(home, "src", "index.ts"), "utf8");
      expect(content).toBe('console.log("custom");');
    });
  });
});
