import { confirm, intro, outro } from "@clack/prompts";
import { defineCommand } from "citty";
import { readCapsuleArchive } from "../core/archive";
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
    alias: {
      type: "string",
      description: "Custom alias for the installed binary (defaults to package name)",
    },
    "keyring-server": {
      type: "string",
      description: "Keyring server URL",
    },
    "registry-server": {
      type: "string",
      description: "Registry server URL",
    },
    yes: {
      type: "boolean",
      description: "Accept all permissions without prompting",
      default: false,
    },
  },
  async run({ args }) {
    const target = args._[0];
    const alias = args.alias as string | undefined;
    const acceptAll = args.yes as boolean;

    if (!target) {
      throw new Error("Missing package name or URL");
    }

    logger.section("Install app");

    let downloadUrl = target;
    let packageName = target;
    if (!URL.canParse(target)) {
      const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
      const resolved = await logger.spinner(`Resolving ${target}`, () => resolvePackage(registryServer, target));
      if (resolved.state === "tombstoned") {
        throw new Error(resolved.tombstoneMessage);
      }

      downloadUrl = resolved.downloadUrl;
      packageName = resolved.name;
      logger.info(`Resolved ${resolved.name}@${resolved.version}`);
    }

    const bytes = await logger.spinner("Downloading capsule", () => downloadToBytes(downloadUrl));
    logger.info("Verifying signature");
    await verifyDownloadedCapsule(bytes, args["keyring-server"] as string | undefined);

    // Check permissions from the manifest
    const archive = readCapsuleArchive(bytes);
    const permissions = archive.manifest.permissions;

    if (permissions) {
      logger.section("Permission Request");
      logger.info(`The app "${archive.manifest.name}" requests the following permissions:\n`);

      if (permissions.fs && permissions.fs.length > 0) {
        logger.info(`  • Filesystem: ${permissions.fs.join(", ")}`);
      }
      if (permissions.net) {
        const netDesc = typeof permissions.net === "boolean"
          ? "full network access"
          : `network access to: ${permissions.net.join(", ")}`;
        logger.info(`  • Network: ${netDesc}`);
      }
      if (permissions.env) {
        const envDesc = typeof permissions.env === "boolean"
          ? "all environment variables"
          : `env vars: ${permissions.env.join(", ")}`;
        logger.info(`  • Environment: ${envDesc}`);
      }
      if (permissions.subprocess) {
        logger.info(`  • Subprocess spawning: yes`);
      }
      console.log("");

      if (!acceptAll) {
        const granted = await confirm({
          message: "Grant these permissions? (You can change them later in ~/.capsule/apps/<name>/permissions.json)",
          initialValue: false,
        });

        if (typeof granted !== "boolean" || !granted) {
          logger.warn("Installation cancelled by user.");
          return;
        }
      }
    }

    const installed = await logger.spinner("Installing app", () =>
      installCapsuleArchive(bytes, alias, permissions ?? null),
    );
    logger.success(`Installed ${installed.manifest.name}@${installed.manifest.version}`);

    if (permissions) {
      logger.info("Permissions saved. Edit ~/.capsule/apps/<name>/permissions.json to change them.");
    }

    if (alias) {
      logger.info(`Binary shim created as "${alias}"`);
    }

    const missingPath = await warnIfBinMissingFromPath();
    if (missingPath) {
      logger.warn(`Add ${logger.path(missingPath)} to your PATH to run installed apps by name.`);
    }
  },
});
