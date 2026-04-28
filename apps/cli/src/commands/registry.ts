import { defineCommand } from "citty";
import { registryDownloadCommand } from "./registry-download";
import { registryInfoCommand } from "./registry-info";
import { registryInstallCommand } from "./registry-install";
import { registryPublishCommand } from "./registry-publish";
import { registryRemoveCommand } from "./registry-remove";
import { registryTransferCommand } from "./registry-transfer";

export const registryCommand = defineCommand({
  meta: {
    name: "registry",
    description: "Manage packages in the Capsule registry",
  },
  subCommands: {
    publish: registryPublishCommand,
    info: registryInfoCommand,
    install: registryInstallCommand,
    download: registryDownloadCommand,
    remove: registryRemoveCommand,
    transfer: registryTransferCommand,
  },
});
