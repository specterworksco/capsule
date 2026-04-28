import { readFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { getRequiredContentFiles, readCapsuleArchive } from "../core/archive";
import { computeContentHash, signContentHash } from "../core/crypto";
import { publishCapsule, resolveKeyringServer } from "../core/keyring-client";
import { publishToRegistry, resolveRegistryServer } from "../core/registry-client";
import { loadCertificate } from "../core/store";
import { logger } from "../utils/logger";

export const registryPublishCommand = defineCommand({
  meta: {
    name: "publish",
    description: "Register a signed capsule with the keyring server and publish it to the registry",
  },
  args: {
    file: {
      type: "positional",
      required: true,
      description: "Path to the .capsule.app file",
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
    const file = args._[0];
    if (!file) {
      throw new Error("Missing .capsule.app file");
    }

    logger.section("Publish archive");

    const certificate = await loadCertificate();
    if (!certificate) {
      throw new Error("No certificate found. Run `capsule certificate request` first.");
    }

    const bytes = await logger.spinner("Reading capsule", async () => new Uint8Array(await readFile(file)));
    const archive = readCapsuleArchive(bytes);
    const { manifestBytes, bundleBytes } = getRequiredContentFiles(archive);
    const contentHash = await logger.spinner("Computing content hash", () => computeContentHash(manifestBytes, bundleBytes));
    const signature = await logger.spinner("Signing capsule", () => signContentHash(contentHash, certificate.privateKey));
    const keyringServer = resolveKeyringServer(args["keyring-server"] as string | undefined);
    const response = await logger.spinner("Registering with Keyring", () =>
      publishCapsule(keyringServer, {
        contentHash,
        signature,
        certificateId: certificate.certificateId,
      }),
    );
    const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
    const registry = await logger.spinner("Publishing to Registry", () =>
      publishToRegistry(registryServer, {
        bytes,
        fileName: file.split(/[\\/]/).pop() ?? "app.capsule.app",
        certificateId: certificate.certificateId,
        signature,
      }),
    );

    logger.success(`Signed and registered as ${response.author.name}`);
    logger.success(`Published to registry: ${logger.command(`capsule registry install ${registry.name}`)}`);
  },
});
