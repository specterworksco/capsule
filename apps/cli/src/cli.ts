import { defineCommand, runMain } from "citty";
import { buildCommand } from "./commands/build";
import { certificatesCommand } from "./commands/certificates";
import { getCommand } from "./commands/get";
import { infoCommand } from "./commands/info";
import { internalRunCommand } from "./commands/_internal";
import { publishCommand } from "./commands/publish";
import { runCommand } from "./commands/run";

export const mainCommand = defineCommand({
  meta: {
    name: "capsule",
    version: "1.0.0",
    description: "Distribute and run JavaScript apps without requiring users to install a JS runtime",
  },
  subCommands: {
    build: buildCommand,
    certificates: certificatesCommand,
    get: getCommand,
    info: infoCommand,
    publish: publishCommand,
    run: runCommand,
    __run: internalRunCommand,
  },
});

export async function runCli(rawArgs = process.argv.slice(2)): Promise<void> {
  await runMain(mainCommand, { rawArgs });
}
