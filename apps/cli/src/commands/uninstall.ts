import { rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import { getAppsDir, getBinDir, getInstalledApp } from "../core/store";
import { logger } from "../utils/logger";

export const uninstallCommand = defineCommand({
  meta: {
    name: "uninstall",
    description: "Remove an installed capsule app and its shims",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "App name to uninstall",
    },
  },
  async run({ args }) {
    const name = args._[0];
    if (!name) {
      throw new Error("Missing app name");
    }

    logger.section("Uninstall app");

    const app = await getInstalledApp(name);
    if (!app) {
      throw new Error(`App "${name}" is not installed`);
    }

    // Remove app directory
    const appDir = join(getAppsDir(), name);
    await rm(appDir, { recursive: true, force: true });
    logger.info(`Removed app directory`);

    // Remove shims (unix binary and windows .cmd)
    const binDir = getBinDir();
    const shimPath = join(binDir, name);
    if (existsSync(shimPath)) {
      await rm(shimPath, { force: true });
      logger.info(`Removed shim: ${shimPath}`);
    }

    const shimCmdPath = join(binDir, `${name}.cmd`);
    if (existsSync(shimCmdPath)) {
      await rm(shimCmdPath, { force: true });
      logger.info(`Removed shim: ${shimCmdPath}`);
    }

    logger.success(`Uninstalled ${name}`);
  },
});
