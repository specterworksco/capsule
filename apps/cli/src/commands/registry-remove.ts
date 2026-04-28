import { createRegistryRemoveMessage } from "@capsule/shared";
import { defineCommand } from "citty";
import { signMessage } from "../core/crypto";
import { removePackage, resolveRegistryServer } from "../core/registry-client";
import { loadCertificate } from "../core/store";
import { logger } from "../utils/logger";

export const registryRemoveCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Tombstone a package you own and delete its stored archives",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Package name",
    },
    "registry-server": {
      type: "string",
      description: "Registry server URL",
    },
  },
  async run({ args }) {
    const name = args._[0];
    if (!name) {
      throw new Error("Missing package name");
    }

    logger.section("Remove package");

    const certificate = await loadCertificate();
    if (!certificate) {
      throw new Error("No certificate found. Run `capsule certificate request` first.");
    }

    const issuedAt = new Date().toISOString();
    const signature = await logger.spinner("Signing remove request", () =>
      signMessage(createRegistryRemoveMessage(name, issuedAt), certificate.privateKey),
    );
    const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
    const response = await logger.spinner("Tombstoning package", () =>
      removePackage(registryServer, name, {
        certificateId: certificate.certificateId,
        issuedAt,
        signature,
      }),
    );

    logger.success(`Removed ${response.name}`);
    logger.warn(response.tombstoneMessage);
  },
});
