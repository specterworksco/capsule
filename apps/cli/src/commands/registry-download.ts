import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineCommand } from "citty";
import { resolvePackage, resolveRegistryServer } from "../core/registry-client";
import { downloadToBytes } from "../utils/fetch";
import { logger } from "../utils/logger";

export const registryDownloadCommand = defineCommand({
  meta: {
    name: "download",
    description: "Download a .capsule.app archive from the registry or a direct URL",
  },
  args: {
    target: {
      type: "positional",
      required: true,
      description: "Package name or direct URL to a .capsule.app archive",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output file path",
    },
    "registry-server": {
      type: "string",
      description: "Registry server URL",
    },
  },
  async run({ args }) {
    const target = args._[0];
    if (!target) {
      throw new Error("Missing package name or URL");
    }

    logger.section("Download archive");

    let downloadUrl = target;
    let defaultOutput = defaultOutputFromUrl(target);
    if (!URL.canParse(target)) {
      const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
      const resolved = await logger.spinner(`Resolving ${target}`, () => resolvePackage(registryServer, target));
      if (resolved.state === "tombstoned") {
        throw new Error(resolved.tombstoneMessage);
      }

      downloadUrl = resolved.downloadUrl;
      defaultOutput = `${resolved.name}-${resolved.version}.capsule.app`;
      logger.info(`Resolved ${resolved.name}@${resolved.version}`);
    }

    const outputPath = resolve(process.cwd(), args.output ?? defaultOutput);
    const bytes = await logger.spinner("Downloading capsule", () => downloadToBytes(downloadUrl));
    await logger.spinner("Saving archive", async () => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
    });

    logger.success(`Downloaded ${logger.path(outputPath)}`);
  },
});

function defaultOutputFromUrl(url: string): string {
  if (!URL.canParse(url)) {
    return "download.capsule.app";
  }

  const path = new URL(url).pathname.split("/").pop();
  return path && path.length > 0 ? path : "download.capsule.app";
}
