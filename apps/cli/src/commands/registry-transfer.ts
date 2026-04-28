import { createRegistryTransferMessage } from "@capsule/shared";
import { defineCommand } from "citty";
import { signMessage } from "../core/crypto";
import { resolveRegistryServer, transferPackage } from "../core/registry-client";
import { loadCertificate } from "../core/store";
import { logger } from "../utils/logger";

export const registryTransferCommand = defineCommand({
  meta: {
    name: "transfer",
    description: "Transfer package ownership to another active certificate",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Package name",
    },
    to: {
      type: "string",
      required: true,
      description: "Destination certificateId",
    },
    "registry-server": {
      type: "string",
      description: "Registry server URL",
    },
  },
  async run({ args }) {
    const name = args._[0];
    const toCertificateId = args.to as string | undefined;
    if (!name) {
      throw new Error("Missing package name");
    }

    if (!toCertificateId) {
      throw new Error("Missing destination certificateId");
    }

    logger.section("Transfer package");

    const certificate = await loadCertificate();
    if (!certificate) {
      throw new Error("No certificate found. Run `capsule certificate request` first.");
    }

    const issuedAt = new Date().toISOString();
    const signature = await logger.spinner("Signing transfer request", () =>
      signMessage(createRegistryTransferMessage(name, toCertificateId, issuedAt), certificate.privateKey),
    );
    const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
    const response = await logger.spinner("Transferring ownership", () =>
      transferPackage(registryServer, name, {
        certificateId: certificate.certificateId,
        toCertificateId,
        issuedAt,
        signature,
      }),
    );

    logger.success(`Transferred ${response.name} to ${response.toCertificateId}`);
  },
});
