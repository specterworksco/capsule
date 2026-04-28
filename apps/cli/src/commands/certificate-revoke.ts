import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createCertificateRevokeMessage, createRegistryTransferMessage } from "@capsule/shared";
import { defineCommand } from "citty";
import { signMessage } from "../core/crypto";
import { getCertificateRecord, resolveKeyringServer, revokeCertificate } from "../core/keyring-client";
import { listOwnedPackages, resolveRegistryServer, transferPackage } from "../core/registry-client";
import { deleteCertificate, loadCertificate } from "../core/store";
import { logger } from "../utils/logger";

export const certificateRevokeCommand = defineCommand({
  meta: {
    name: "revoke",
    description: "Revoke the locally installed signing certificate",
  },
  args: {
    "transfer-to": {
      type: "string",
      description: "Replacement certificateId for packages owned by the local certificate",
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
    logger.section("Revoke certificate");

    const certificate = await loadCertificate();
    if (!certificate) {
      throw new Error("No certificate found. Run `capsule certificate request` first.");
    }

    const keyringServer = resolveKeyringServer(args["keyring-server"] as string | undefined);
    const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
    const owned = await logger.spinner("Looking up owned packages", () => listOwnedPackages(registryServer, certificate.certificateId));

    let transferTo = args["transfer-to"] as string | undefined;
    if (owned.packages.length > 0 && !transferTo) {
      const rl = createInterface({ input, output });
      try {
        transferTo = (await rl.question(`${logger.command("Transfer to")} `)).trim();
      } finally {
        rl.close();
      }
    }

    if (transferTo) {
      if (transferTo === certificate.certificateId) {
        throw new Error("Replacement certificate must be different from the local certificate.");
      }

      const replacement = await logger.spinner("Validating replacement certificate", () =>
        getCertificateRecord(keyringServer, transferTo as string),
      );
      if (replacement.revokedAt) {
        throw new Error("Replacement certificate is revoked.");
      }
    }

    if (owned.packages.length > 0 && !transferTo) {
      throw new Error("A replacement certificateId is required to transfer owned packages before revocation.");
    }

    for (const [index, name] of owned.packages.entries()) {
      const issuedAt = new Date().toISOString();
      const signature = await signMessage(createRegistryTransferMessage(name, transferTo as string, issuedAt), certificate.privateKey);
      await logger.spinner(`Transferring ${name} (${index + 1}/${owned.packages.length})`, () =>
        transferPackage(registryServer, name, {
          certificateId: certificate.certificateId,
          toCertificateId: transferTo as string,
          issuedAt,
          signature,
        }),
      );
    }

    const issuedAt = new Date().toISOString();
    const signature = await logger.spinner("Signing revoke request", () =>
      signMessage(createCertificateRevokeMessage(certificate.certificateId, transferTo, issuedAt), certificate.privateKey),
    );
    const response = await logger.spinner("Revoking certificate", () =>
      revokeCertificate(keyringServer, certificate.certificateId, {
        replacementCertificateId: transferTo,
        issuedAt,
        signature,
      }),
    );
    await logger.spinner("Removing local certificate", () => deleteCertificate());

    logger.success(`Revoked certificate ${response.certificateId}`);
    if (transferTo && owned.packages.length > 0) {
      logger.success(`Transferred ${owned.packages.length} package(s) to ${transferTo}`);
    }
  },
});
