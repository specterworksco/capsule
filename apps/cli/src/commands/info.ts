import { defineCommand } from "citty";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger";
import { getAppDir, getInstalledApp } from "../core/store";

export const infoCommand = defineCommand({
  meta: {
    name: "info",
    description: "Show detailed information about an installed app, including SBOM dependencies",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the installed app",
      required: true,
    },
  },
  async run({ args }) {
    const name = args._[0] as string;
    if (!name) {
      throw new Error("Missing app name");
    }

    const app = await getInstalledApp(name);
    if (!app) {
      throw new Error(`App "${name}" is not installed`);
    }

    logger.section(`App: ${app.manifest.name}@${app.manifest.version}`);

    // Show manifest info
    logger.info(`Name: ${app.manifest.name}`);
    logger.info(`Version: ${app.manifest.version}`);
    if (app.manifest.author) {
      logger.info(`Author: ${app.manifest.author}`);
    }
    if (app.manifest.description) {
      logger.info(`Description: ${app.manifest.description}`);
    }
    if (app.manifest.permissions) {
      const perms = app.manifest.permissions;
      logger.info("Permissions requested:");
      if (perms.fs && perms.fs.length > 0) logger.info(`  Filesystem: ${perms.fs.join(", ")}`);
      if (perms.net) {
        logger.info(`  Network: ${typeof perms.net === "boolean" ? "yes" : perms.net.join(", ")}`);
      }
      if (perms.env) {
        logger.info(`  Environment: ${typeof perms.env === "boolean" ? "yes" : perms.env.join(", ")}`);
      }
      if (perms.subprocess) logger.info("  Subprocess: yes");
    } else {
      logger.info("Permissions: none requested (runs without sandbox)");
    }

    // Show SBOM if available
    const sbomPath = join(app.appDir, "sbom.json");
    if (existsSync(sbomPath)) {
      try {
        const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
        if (sbom.components && sbom.components.length > 0) {
          console.log("");
          logger.section("SBOM (Dependencies)");
          logger.info(`Dependencies: ${sbom.components.length}`);
          console.log("");

          // Show top 20 dependencies
          const maxShow = 20;
          for (let i = 0; i < Math.min(sbom.components.length, maxShow); i++) {
            const comp = sbom.components[i];
            logger.info(`  ${comp.name}@${comp.version}`);
          }
          if (sbom.components.length > maxShow) {
            logger.info(`  ... and ${sbom.components.length - maxShow} more`);
          }
        }
      } catch {
        // Ignore SBOM parsing errors
      }
    }

    console.log("");
    logger.info(`App directory: ${app.appDir}`);
  },
});
