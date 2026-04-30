import { defineCommand } from "citty";
import packageJson from "../../package.json";
import { checkForUpdate, upgradeCapsule } from "../core/upgrade";
import { logger } from "../utils/logger";

export const upgradeCommand = defineCommand({
  meta: {
    name: "upgrade",
    description: "Upgrade the Capsule CLI to the latest GitHub release",
  },
  args: {
    target: {
      type: "string",
      description: "Exact Bun compile target asset to install",
    },
    variant: {
      type: "string",
      description: "Platform variant to install: default, baseline, modern, or musl",
    },
    "install-dir": {
      type: "string",
      description: "Directory where the capsule binary should be installed",
    },
    force: {
      type: "boolean",
      description: "Reinstall the latest release even when already up to date",
    },
  },
  async run({ args }) {
    logger.section("Upgrade CLI");

    const update = await logger.spinner("Checking latest release", () =>
      checkForUpdate(packageJson.version, {
        target: args.target as string | undefined,
        variant: args.variant as string | undefined,
      }),
    );

    if (!update && !args.force) {
      logger.success(`Capsule ${packageJson.version} is already up to date.`);
      return;
    }

    if (update) {
      logger.info(`Latest version: ${update.latestVersion}`);
      logger.info(`Release asset: ${update.asset.name}`);
    } else {
      logger.warn("Reinstalling the latest release because --force was provided.");
    }

    const result = await logger.spinner("Installing upgrade", () =>
      upgradeCapsule({
        currentVersion: packageJson.version,
        target: args.target as string | undefined,
        variant: args.variant as string | undefined,
        installDir: args["install-dir"] as string | undefined,
        force: args.force as boolean | undefined,
      }),
    );

    if (result.updated) {
      logger.success(`Installed Capsule ${result.version} to ${logger.path(result.destination)}`);
      if (result.assetName) {
        logger.info(`Installed release asset: ${result.assetName}`);
      }
    }
  },
});
