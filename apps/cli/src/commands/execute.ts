import { defineCommand } from "citty";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { readCapsuleArchive } from "../core/archive";
import { resolvePackage, resolveRegistryServer } from "../core/registry-client";
import { verifyDownloadedCapsule } from "../core/verification";
import { downloadToBytes } from "../utils/fetch";
import { runBundle } from "../core/runner";
import { logger } from "../utils/logger";

export const executeCommand = defineCommand({
  meta: {
    name: "execute",
    description: "Run a capsule app ephemerally (download, run, and discard). Shorthand: capsule x",
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
    const target = args._[0] as string;
    const appArgs = args._.slice(1) as string[];

    if (!target) {
      throw new Error("Missing package name or URL");
    }

    logger.section("Execute capsule");

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

    // Extract to temp dir
    const archive = readCapsuleArchive(bytes);
    const tempDir = await mkdtemp(join(tmpdir(), "capsule-exec-"));

    try {
      for (const [name, content] of Object.entries(archive.files)) {
        const outputPath = join(tempDir, name);
        await mkdir(join(outputPath, ".."), { recursive: true });
        await writeFile(outputPath, content);
      }

      logger.info(`Running ${archive.manifest.name}@${archive.manifest.version}`);
      await runBundle(
        join(tempDir, archive.manifest.entry),
        appArgs,
        archive.manifest.name,
        archive.manifest.permissions ?? null,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
});
