import { defineCommand } from "citty";
import { getCertificateRecord, resolveKeyringServer } from "../core/keyring-client";
import { getCertificatePath, loadCertificate } from "../core/store";
import { logger } from "../utils/logger";

export const whoamiCommand = defineCommand({
  meta: {
    name: "whoami",
    description: "Show the identity for the locally installed certificate",
  },
  args: {
    "keyring-server": {
      type: "string",
      description: "Keyring server URL",
    },
  },
  async run({ args }) {
    logger.section("Current identity");

    const certificate = await loadCertificate();
    if (!certificate) {
      logger.warn("No local certificate found.");
      logger.hint(`Run ${logger.command("capsule certificate request")} to create one.`);
      return;
    }

    logger.label("Name", certificate.author.name);
    logger.label("Email", certificate.author.email);
    logger.label("Cert", certificate.certificateId);
    logger.label("Issued", certificate.issuedAt);
    logger.label("Path", getCertificatePath());

    const keyringServer = resolveKeyringServer(args["keyring-server"] as string | undefined);
    const record = await logger.spinner("Checking Keyring", () => getCertificateRecord(keyringServer, certificate.certificateId));

    if (record.publicKey !== certificate.publicKey) {
      logger.warn("The local certificate public key does not match the Keyring record.");
      return;
    }

    if (record.revokedAt) {
      logger.warn(`Certificate revoked on ${record.revokedAt}.`);
      if (record.replacedByCertificateId) {
        logger.hint(`Replacement certificate: ${record.replacedByCertificateId}`);
      }
      return;
    }

    logger.success("Certificate is active.");
  },
});
