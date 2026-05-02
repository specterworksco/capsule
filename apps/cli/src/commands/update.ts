import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import { resolveRegistryServer, resolvePackage } from "../core/registry-client";
import { getAppsDir, getInstalledApp, installCapsuleArchive } from "../core/store";
import { verifyDownloadedCapsule } from "../core/verification";
import { downloadToBytes } from "../utils/fetch";
import { logger } from "../utils/logger";
import type { Manifest } from "@capsule/shared";

export const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Update installed apps to the latest version from the registry",
  },
  args: {
    name: {
      type: "positional",
      required: false,
      description: "App name to update (updates all if omitted)",
    },
    "registry-server": {
      type: "string",
      description: "Registry server URL",
    },
    "keyring-server": {
      type: "string",
      description: "Keyring server URL",
    },
  },
  async run({ args }) {
    const specificName = args._[0] as string | undefined;
    const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);

    // Collect apps to update
    const appNames: string[] = [];

    if (specificName) {
      const app = await getInstalledApp(specificName);
      if (!app) {
        throw new Error(`App "${specificName}" is not installed`);
      }
      appNames.push(specificName);
    } else {
      const appsDir = getAppsDir();
      if (!existsSync(appsDir)) {
        logger.info("No apps installed.");
        return;
      }

      const entries = await readdir(appsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = join(appsDir, entry.name, "manifest.json");
          if (existsSync(manifestPath)) {
            appNames.push(entry.name);
          }
        }
      }

      if (appNames.length === 0) {
        logger.info("No apps installed.");
        return;
      }
    }

    logger.section(specificName ? `Update ${specificName}` : "Update all apps");

    let updated = 0;
    let upToDate = 0;
    let failed = 0;

    for (const name of appNames) {
      try {
        const manifest = await getInstalledApp(name);
        if (!manifest) {
          logger.warn(`Skipping ${name}: not found`);
          failed++;
          continue;
        }

        const localVersion = manifest.manifest.version;

        logger.info(`Checking ${name}@${localVersion} ...`);

        const resolved = await resolvePackage(registryServer, name);
        if (resolved.state === "tombstoned") {
          logger.warn(`${name} has been tombstoned: ${resolved.tombstoneMessage}`);
          failed++;
          continue;
        }

        const remoteVersion = resolved.version;

        if (remoteVersion === localVersion) {
          logger.info(`${name} is up to date (${localVersion})`);
          upToDate++;
          continue;
        }

        logger.info(`Updating ${name} from ${localVersion} to ${remoteVersion} ...`);

        const bytes = await downloadToBytes(resolved.downloadUrl);
        await verifyDownloadedCapsule(bytes, args["keyring-server"] as string | undefined);
        await installCapsuleArchive(bytes);

        logger.success(`Updated ${name} to ${remoteVersion}`);
        updated++;
      } catch (error) {
        logger.warn(`Failed to update ${name}: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    console.log("");
    if (updated > 0) {
      logger.success(`${updated} app(s) updated`);
    }
    if (upToDate > 0) {
      logger.info(`${upToDate} app(s) already up to date`);
    }
    if (failed > 0) {
      logger.warn(`${failed} app(s) failed`);
    }
  },
});
