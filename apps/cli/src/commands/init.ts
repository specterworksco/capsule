import { writeFile, mkdir } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { logger } from "../utils/logger";

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Create a new Capsule project interactively",
  },
  args: {
    dir: {
      type: "positional",
      required: false,
      description: "Project directory (defaults to current working directory)",
    },
  },
  async run({ args }) {
    const projectDir = resolve(process.cwd(), (args._[0] as string) ?? ".");
    const projectName = basename(projectDir);

    logger.section("Create a new Capsule project");

    p.intro("capsule init");

    const result = await p.group(
      {
        name: () =>
          p.text({
            message: "App name",
            placeholder: projectName,
            defaultValue: projectName,
            validate: (value: string | undefined) => {
              if (!value || value.trim().length === 0) return "App name is required";
              if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
                return "Must be lowercase, start with letter, use hyphens only (max 64 chars)";
              }
            },
          }),
        version: () =>
          p.text({
            message: "Initial version",
            placeholder: "1.0.0",
            defaultValue: "1.0.0",
            validate: (value: string | undefined) => {
              if (!value || !/^\d+\.\d+\.\d+/.test(value)) return "Must be valid semver (e.g. 1.0.0)";
            },
          }),
        description: () =>
          p.text({
            message: "Description (optional)",
            placeholder: "",
          }),
        entry: () =>
          p.text({
            message: "Entry point",
            placeholder: "src/index.ts",
            defaultValue: "src/index.ts",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Cancelled.");
          process.exit(0);
        },
      },
    );

    const s = p.spinner();
    s.start("Creating project files");

    const configLines = [
      "export default {",
      `  name: "${result.name}",`,
      `  version: "${result.version}",`,
      `  entry: "${result.entry}",`,
    ];

    if (result.description) {
      configLines.push(`  description: "${result.description}",`);
    }

    configLines.push("};", "");

    const configContent = configLines.join("\n");

    const entryContent = [
      '#!/usr/bin/env bun',
      "",
      'console.log("Hello from Capsule!");',
    ].join("\n");

    // Write capsule.config.ts
    const configPath = join(projectDir, "capsule.config.ts");
    if (existsSync(configPath)) {
      s.stop("Aborted");
      p.cancel("capsule.config.ts already exists in this directory.");
      process.exit(1);
    }

    await mkdir(projectDir, { recursive: true });
    await writeFile(configPath, configContent);

    // Write entry file if it doesn't exist
    const entryPath = join(projectDir, result.entry);
    const entryDir = resolve(projectDir, join(result.entry, ".."));
    if (!existsSync(entryPath)) {
      await mkdir(entryDir, { recursive: true });
      await writeFile(entryPath, entryContent);
    }

    s.stop("Created project files");

    p.note(
      `Run \`capsule build\` to build your app, then \`capsule registry publish\` to share it.`,
      "Next steps",
    );

    p.outro("Done!");
  },
});
