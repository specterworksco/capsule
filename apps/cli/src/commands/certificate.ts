import { defineCommand } from "citty";
import { certificateRequestCommand } from "./certificate-request";
import { certificateRevokeCommand } from "./certificate-revoke";

export const certificateCommand = defineCommand({
  meta: {
    name: "certificate",
    description: "Manage Capsule signing certificates",
  },
  subCommands: {
    request: certificateRequestCommand,
    revoke: certificateRevokeCommand,
  },
});
