import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolvePackage, resolveRegistryServer } from "./registry-client";
import { getAppDir } from "./store";

const UPDATE_FLAG_FILE = ".update-available";

/**
 * Check for updates for a specific app in the background.
 * This is a fire-and-forget function that writes a flag file if an update is available.
 */
export async function checkForAppUpdate(appName: string, registryServer?: string): Promise<void> {
  try {
    const server = resolveRegistryServer(registryServer);
    const resolved = await resolvePackage(server, appName);

    if (resolved.state === "tombstoned") return;

    const appDir = getAppDir(appName);
    const manifestPath = join(appDir, "manifest.json");

    if (!existsSync(manifestPath)) return;

    const localManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const localVersion = localManifest.version as string;
    const remoteVersion = resolved.version;

    if (remoteVersion !== localVersion) {
      // Write the flag file
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        join(appDir, UPDATE_FLAG_FILE),
        JSON.stringify({ currentVersion: localVersion, latestVersion: remoteVersion }, null, 2),
      );
    }
  } catch {
    // Background check must never throw
  }
}

/**
 * Check if an update flag exists for an app.
 */
export function getAppUpdateInfo(appName: string): { currentVersion: string; latestVersion: string } | null {
  const flagPath = join(getAppDir(appName), UPDATE_FLAG_FILE);
  if (!existsSync(flagPath)) return null;

  try {
    return JSON.parse(readFileSync(flagPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Clear the update flag for an app.
 */
export function clearAppUpdateFlag(appName: string): void {
  const flagPath = join(getAppDir(appName), UPDATE_FLAG_FILE);
  try {
    writeFileSync(flagPath, "");
  } catch {
    // Best effort
  }
}
