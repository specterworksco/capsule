import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync as readFileSyncFS } from "node:fs";
import type { RunOptions } from "../types";
import { readCapsuleArchive } from "./archive";
import { injectSecretsIntoEnv } from "./secrets";
import { getAppsDir, getAppDir } from "./store";
import { activateSandbox, activateSandboxWithPermissions, installSandboxProxies, type Permission } from "./sandbox";
import { getAppUpdateInfo, clearAppUpdateFlag } from "./app-update";
import { resolvePackage, resolveRegistryServer } from "./registry-client";
import { verifyDownloadedCapsule } from "./verification";
import { downloadToBytes } from "../utils/fetch";
import { logger } from "../utils/logger";

export async function runCapsuleFile(
  filePath: string,
  options: RunOptions,
  appName?: string,
): Promise<void> {
  const archive = readCapsuleArchive(new Uint8Array(await readFile(filePath)));
  const tempDir = await mkdtemp(join(tmpdir(), "capsule-"));

  try {
    for (const [name, content] of Object.entries(archive.files)) {
      const outputPath = join(tempDir, name);
      await mkdir(join(outputPath, ".."), { recursive: true });
      await writeFile(outputPath, content);
    }

    await runBundle(
      join(tempDir, archive.manifest.entry),
      options.appArgs,
      archive.manifest.name,
      archive.manifest.permissions,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runBundle(
  bundlePath: string,
  appArgs: string[],
  appName?: string,
  appPermissions?: Permission | null,
): Promise<void> {
  const previousArgv = process.argv;
  process.argv = [process.argv[0] ?? "capsule", bundlePath, ...appArgs];

  // Determine app name from path if not provided
  const name = appName ?? extractAppName(bundlePath);

  // Activate sandbox permissions
  let deactivatePermissions: (() => void) | null = null;
  let deactivateProxies: (() => void) | null = null;

  if (name) {
    if (appPermissions) {
      deactivatePermissions = activateSandboxWithPermissions(appPermissions, name);
    } else {
      deactivatePermissions = activateSandbox(name);
    }
    deactivateProxies = installSandboxProxies();
  }

  // Check for update notifications (for installed apps)
  const installedName = name ?? extractAppName(bundlePath);
  if (installedName) {
    const updateInfo = getAppUpdateInfo(installedName);
    if (updateInfo) {
      logger.warn(
        `Update available for ${installedName}: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}. ` +
          `Run 'capsule update ${installedName}' to update.`,
      );
      clearAppUpdateFlag(installedName);
    }

    // Fire-and-forget background update check
    checkForUpdatesInBackground(installedName).catch(() => {});
  }

  // Inject the Capsule plugin API (Capsule.importApp)
  const restoreCapsuleAPI = injectCapsuleAPI(name);

  // Attempt to detect app name from the bundle path and inject secrets
  const restoreEnv = await maybeInjectSecrets(bundlePath);

  try {
    const url = pathToFileURL(bundlePath);
    url.searchParams.set("capsuleRun", Date.now().toString());
    await import(url.href);
  } finally {
    process.argv = previousArgv;
    restoreEnv();
    restoreCapsuleAPI();
    deactivatePermissions?.();
    deactivateProxies?.();
  }
}

/**
 * Fire-and-forget background check for app updates.
 */
async function checkForUpdatesInBackground(appName: string): Promise<void> {
  const { checkForAppUpdate } = await import("./app-update");
  await checkForAppUpdate(appName);
}

/**
 * Extract app name from bundle path if it's inside the Capsule apps directory.
 */
function extractAppName(bundlePath: string): string | undefined {
  const appsDir = getAppsDir() + sep;
  if (!bundlePath.startsWith(appsDir)) return undefined;
  const relative = bundlePath.slice(appsDir.length);
  return relative.split(sep)[0];
}

/**
 * Inject the Capsule plugin API into the global scope.
 * This allows installed apps to import/use other installed capsules as plugins.
 */
function injectCapsuleAPI(currentAppName: string | undefined): () => void {
  const previous = (globalThis as Record<string, unknown>).Capsule;

  const capsuleAPI = {
    /**
     * Import another installed capsule app's bundle at runtime.
     * Returns the module exports of the imported app.
     */
    importApp: async (appName: string): Promise<Record<string, unknown>> => {
      if (!currentAppName) {
        throw new Error("Cannot import another app outside of a Capsule context");
      }

      const appDir = getAppDir(appName);
      const manifestPath = join(appDir, "manifest.json");

      if (!existsSync(manifestPath)) {
        throw new Error(`App "${appName}" is not installed. Install it first with 'capsule registry install ${appName}'`);
      }

      const manifest = JSON.parse(readFileSyncFS(manifestPath, "utf8"));
      const bundlePath = join(appDir, manifest.entry);

      if (!existsSync(bundlePath)) {
        throw new Error(`App "${appName}" bundle not found at ${bundlePath}`);
      }

      // Activate sandbox for the imported app as well
      const deactivateImported = activateSandbox(appName);
      const deactivateProxies = installSandboxProxies();

      try {
        const url = pathToFileURL(bundlePath);
        url.searchParams.set("capsulePlugin", Date.now().toString());
        const mod = await import(url.href);
        return mod as Record<string, unknown>;
      } finally {
        deactivateProxies();
        deactivateImported();
      }
    },

    /**
     * Get the current app's name.
     */
    appName: currentAppName ?? null,

    /**
     * Resolve and download a capsule from the registry, returning its exports.
     * This is an ephemeral plugin import: the app is not permanently installed.
     */
    importFromRegistry: async (name: string): Promise<Record<string, unknown>> => {
      const registryServer = resolveRegistryServer();
      const resolved = await resolvePackage(registryServer, name);
      if (resolved.state === "tombstoned") {
        throw new Error(`Package "${name}" has been removed from the registry`);
      }

      const bytes = await downloadToBytes(resolved.downloadUrl);
      await verifyDownloadedCapsule(bytes, undefined);

      const archive = readCapsuleArchive(bytes);
      const tempDir = await mkdtemp(join(tmpdir(), "capsule-plugin-"));

      try {
        for (const [fileName, content] of Object.entries(archive.files)) {
          const outputPath = join(tempDir, fileName);
          await mkdir(join(outputPath, ".."), { recursive: true });
          await writeFile(outputPath, content);
        }

        const deactivatePerms = activateSandboxWithPermissions(
          archive.manifest.permissions ?? { fs: [] },
          archive.manifest.name,
        );
        const deactivateProxies = installSandboxProxies();

        try {
          const url = pathToFileURL(join(tempDir, archive.manifest.entry));
          url.searchParams.set("capsulePlugin", Date.now().toString());
          const mod = await import(url.href);
          return mod as Record<string, unknown>;
        } finally {
          deactivateProxies();
          deactivatePerms();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };

  (globalThis as Record<string, unknown>).Capsule = capsuleAPI;

  return () => {
    (globalThis as Record<string, unknown>).Capsule = previous;
  };
}

/**
 * If the bundle is inside the Capsule apps directory, inject that app's secrets
 * into process.env and return a function to restore the previous state.
 */
async function maybeInjectSecrets(bundlePath: string): Promise<() => void> {
  const appsDir = getAppsDir() + sep;

  if (!bundlePath.startsWith(appsDir)) {
    return () => {};
  }

  const relative = bundlePath.slice(appsDir.length);
  const appName = relative.split(sep)[0];

  if (!appName) {
    return () => {};
  }

  try {
    return await injectSecretsIntoEnv(appName);
  } catch {
    return () => {};
  }
}
