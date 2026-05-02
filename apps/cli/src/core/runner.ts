import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import type { RunOptions } from "../types";
import { readCapsuleArchive } from "./archive";
import { injectSecretsIntoEnv } from "./secrets";
import { getAppsDir } from "./store";

export async function runCapsuleFile(filePath: string, options: RunOptions): Promise<void> {
  const archive = readCapsuleArchive(new Uint8Array(await readFile(filePath)));
  const tempDir = await mkdtemp(join(tmpdir(), "capsule-"));

  try {
    for (const [name, content] of Object.entries(archive.files)) {
      const outputPath = join(tempDir, name);
      await mkdir(join(outputPath, ".."), { recursive: true });
      await writeFile(outputPath, content);
    }

    await runBundle(join(tempDir, archive.manifest.entry), options.appArgs);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runBundle(bundlePath: string, appArgs: string[]): Promise<void> {
  const previousArgv = process.argv;
  process.argv = [process.argv[0] ?? "capsule", bundlePath, ...appArgs];

  // Attempt to detect app name from the bundle path and inject secrets
  const restoreEnv = await maybeInjectSecrets(bundlePath);

  try {
    const url = pathToFileURL(bundlePath);
    url.searchParams.set("capsuleRun", Date.now().toString());
    await import(url.href);
  } finally {
    process.argv = previousArgv;
    restoreEnv();
  }
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
