import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { defineCommand } from "citty";
import { requestCertificate, resolveKeyringServer } from "../core/keyring-client";
import { getCertificatePath, saveCertificate } from "../core/store";
import { logger } from "../utils/logger";

export const certificatesCommand = defineCommand({
  meta: {
    name: "certificates",
    description: "Manage Capsule signing certificates",
  },
  subCommands: {
    request: defineCommand({
      meta: {
        name: "request",
        description: "Request a new signing certificate from the keyring server",
      },
      args: {
        "keyring-server": {
          type: "string",
          description: "Keyring server URL",
        },
      },
      async run({ args }) {
        const rl = createInterface({ input, output });

        try {
          const name = (await rl.question("Name: ")).trim();
          const email = (await rl.question("Email: ")).trim();
          const keyringServer = resolveKeyringServer(args["keyring-server"] as string | undefined);
          const certificate = await requestCertificate(keyringServer, { name, email });
          const certificatePath = await saveCertificate(certificate);

          logger.success(`Certificate issued: ${certificate.certificateId}`);
          logger.warn(`Your private key is stored at ${certificatePath} - keep this file safe. It cannot be recovered if lost.`);
        } finally {
          rl.close();
        }
      },
    }),
  },
});
