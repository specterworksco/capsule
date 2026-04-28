import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { defineCommand } from "citty";
import { requestCertificate, resolveKeyringServer } from "../core/keyring-client";
import { saveCertificate } from "../core/store";
import { logger } from "../utils/logger";

export const certificateRequestCommand = defineCommand({
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
    logger.section("Request certificate");
    const rl = createInterface({ input, output });

    try {
      const name = (await rl.question(`${logger.command("Name")}  `)).trim();
      const email = (await rl.question(`${logger.command("Email")} `)).trim();
      const keyringServer = resolveKeyringServer(args["keyring-server"] as string | undefined);
      const certificate = await logger.spinner("Requesting certificate", () => requestCertificate(keyringServer, { name, email }));
      const certificatePath = await logger.spinner("Saving private key", () => saveCertificate(certificate));

      logger.success(`Certificate issued: ${certificate.certificateId}`);
      logger.warn(`Your private key is stored at ${logger.path(certificatePath)} - keep this file safe. It cannot be recovered if lost.`);
    } finally {
      rl.close();
    }
  },
});
