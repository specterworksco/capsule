import { defineCommand } from "citty";
import { resolvePackage, resolveRegistryServer } from "../core/registry-client";
import { installCapsuleArchive, warnIfBinMissingFromPath } from "../core/store";
import { verifyDownloadedCapsule } from "../core/verification";
import { downloadToBytes } from "../utils/fetch";
import { logger } from "../utils/logger";

export const registryInstallCommand = defineCommand({
  meta: {
    name: "install",
    description: "Download, verify, and install a capsule app from the registry or a direct URL",
  },
  args: {
    target: {
      type: "positional",
      required: true,
      description: "Package name or direct URL to a .capsule.app archive",
    },
    "keyring-server": {
      type: "string",
      description: "Keyring server URL",
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

    logger.section("Install app");

    let downloadUrl = target;
    if (!URL.canParse(target)) {
      const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
      const resolved = await logger.spinner(`Resolving ${target}`, () => resolvePackage(registryServer, target));
      if (resolved.state === "tombstoned") {
        throw new Error(resolved.tombstoneMessage);
      }

      downloadUrl = resolved.downloadUrl;
      logger.info(`Resolved ${resolved.name}@${resolved.version}`);
    }

    const bytes = await logger.spinner("Downloading capsule", () => downloadToBytes(downloadUrl));
    logger.info("Verifying signature");
    await verifyDownloadedCapsule(bytes, args["keyring-server"] as string | undefined);
    const installed = await logger.spinner("Installing app", () => installCapsuleArchive(bytes));
    logger.success(`Installed ${installed.manifest.name}@${installed.manifest.version}`);

    const missingPath = await warnIfBinMissingFromPath();
    if (missingPath) {
      logger.warn(`Add ${logger.path(missingPath)} to your PATH to run installed apps by name.`);
    }
  },
});
