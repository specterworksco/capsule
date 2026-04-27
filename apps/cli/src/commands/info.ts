import { defineCommand } from "citty";
import { getPackageInfo, resolveRegistryServer } from "../core/registry-client";
import { logger } from "../utils/logger";

export const infoCommand = defineCommand({
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

    const server = resolveRegistryServer(args["registry-server"] as string | undefined);
    const info = await getPackageInfo(server, name);

    logger.info(`${info.name}@${info.latestVersion}`);
    logger.info(`Author: ${info.author.name} <${info.author.email}>`);
    logger.info("Versions:");
    for (const version of info.versions) {
      logger.info(`  ${version.version}  ${version.publishedAt}`);
    }
  },
});
