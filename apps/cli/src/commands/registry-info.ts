import { defineCommand } from "citty";
import { getPackageInfo, resolveRegistryServer } from "../core/registry-client";
import { logger } from "../utils/logger";

export const registryInfoCommand = defineCommand({
  meta: {
    name: "info",
    description: "Show public registry metadata for a capsule app",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Package name",
    },
    "registry-server": {
      type: "string",
      description: "Registry server URL",
    },
  },
  async run({ args }) {
    const name = args._[0];
    if (!name) {
      throw new Error("Missing package name");
    }

    logger.section("Registry info");

    const server = resolveRegistryServer(args["registry-server"] as string | undefined);
    const info = await logger.spinner(`Fetching ${name}`, () => getPackageInfo(server, name));

    if (info.state === "tombstoned") {
      logger.label("Package", info.name);
      logger.label("State", info.state);
      logger.label("Owner", `${info.author.name} <${info.author.email}>`);
      logger.label("Owner cert", info.certificateId);
      logger.label("Removed", info.tombstonedAt);
      logger.warn(info.tombstoneMessage);
      return;
    }

    logger.label("Package", `${info.name}@${info.latestVersion}`);
    logger.label("State", info.state);
    logger.label("Owner", `${info.author.name} <${info.author.email}>`);
    logger.label("Owner cert", info.certificateId);
    logger.info("Versions");
    for (const version of info.versions) {
      logger.label(version.version, version.publishedAt);
    }
  },
});
