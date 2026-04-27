import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import type { RunOptions } from "../types";
import { readCapsuleArchive } from "./archive";

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

  try {
    const url = pathToFileURL(bundlePath);
    url.searchParams.set("capsuleRun", Date.now().toString());
    await import(url.href);
  } finally {
    process.argv = previousArgv;
  }
}
