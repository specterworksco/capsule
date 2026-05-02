import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import pc from "picocolors";
import { getAppsDir } from "../core/store";
import { logger } from "../utils/logger";
import type { Manifest } from "@capsule/shared";

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List all locally installed capsule apps",
  },
  async run() {
    logger.section("Installed apps");

    const appsDir = getAppsDir();

    if (!existsSync(appsDir)) {
      logger.info("No apps installed.");
      return;
    }

    const entries = await readdir(appsDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());

    if (dirs.length === 0) {
      logger.info("No apps installed.");
      return;
    }

    const rows: { name: string; version: string; author: string; description: string }[] = [];

    for (const dir of dirs) {
      const manifestPath = join(appsDir, dir.name, "manifest.json");
      if (!existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
        rows.push({
          name: manifest.name,
          version: manifest.version,
          author: manifest.author ?? "—",
          description: manifest.description ?? "—",
        });
      } catch {
        // Skip malformed manifests
      }
    }

    if (rows.length === 0) {
      logger.info("No apps installed.");
      return;
    }

    const namePad = Math.max(...rows.map((r) => r.name.length), 4);
    const verPad = Math.max(...rows.map((r) => r.version.length), 7);
    const authorPad = Math.max(...rows.map((r) => r.author.length), 6);

    console.log(
      `${pc.bold("Name".padEnd(namePad))}  ${pc.bold("Version".padEnd(verPad))}  ${pc.bold("Author".padEnd(authorPad))}  ${pc.bold("Description")}`,
    );
    console.log(pc.dim("─".repeat(Math.max(namePad + verPad + authorPad + 60, 60))));

    for (const row of rows) {
      console.log(
        `${row.name.padEnd(namePad)}  ${row.version.padEnd(verPad)}  ${row.author.padEnd(authorPad)}  ${row.description}`,
      );
    }
  },
});
