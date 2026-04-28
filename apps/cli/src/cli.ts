import {
  defineCommand,
  runCommand as runCittyCommand,
  showUsage,
  type CommandDef,
  type CommandMeta,
  type Resolvable,
} from "citty";
import { buildCommand } from "./commands/build";
import { certificateCommand } from "./commands/certificate";
import { internalRunCommand } from "./commands/_internal";
import { registryCommand } from "./commands/registry";
import { runCommand } from "./commands/run";
import packageJson from "../package.json";
import { formatError, logger } from "./utils/logger";

export const mainCommand = defineCommand({
  meta: {
    name: "capsule",
    version: packageJson.version,
    description: "An unique and easy way of shipping JS/TS apps without shipping a JS runtime.",
  },
  subCommands: {
    build: buildCommand,
    certificate: certificateCommand,
    registry: registryCommand,
    run: runCommand,
    __run: internalRunCommand,
  },
});

export async function runCli(rawArgs = process.argv.slice(2)): Promise<void> {
  if (shouldShowBrand(rawArgs)) {
    logger.brand();
  }

  try {
    if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
      const { command, parent } = await resolveUsageCommand(rawArgs);
      await showUsage(command, parent);
      return;
    }

    if (rawArgs.length === 1 && (rawArgs[0] === "--version" || rawArgs[0] === "-v")) {
      console.log(packageJson.version);
      return;
    }

    await runCittyCommand(mainCommand, { rawArgs });
  } catch (error) {
    logger.error(formatError(error));
    process.exitCode = 1;
  }
}

function shouldShowBrand(rawArgs: string[]): boolean {
  if (rawArgs[0] === "__run") {
    return false;
  }

  return rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h");
}

async function resolveUsageCommand(rawArgs: string[]): Promise<{ command: CommandDef; parent?: CommandDef }> {
  let command: CommandDef = mainCommand;
  let parent: CommandDef | undefined;

  for (const arg of rawArgs) {
    if (arg.startsWith("-")) {
      break;
    }

    const subCommands = await resolve(command.subCommands ?? {});
    const subCommand = subCommands[arg] ? await resolve(subCommands[arg]) : undefined;
    if (!subCommand) {
      break;
    }

    parent = await appendParent(parent, command);
    command = subCommand;
  }

  return { command, parent };
}

async function appendParent(parent: CommandDef | undefined, command: CommandDef): Promise<CommandDef> {
  const commandMeta = await resolveMeta(command);
  const parentMeta = parent ? await resolveMeta(parent) : undefined;
  const name = [parentMeta?.name, commandMeta.name].filter(Boolean).join(" ");

  return {
    meta: {
      name,
      version: parentMeta?.version ?? commandMeta.version,
    },
  };
}

async function resolveMeta(command: CommandDef): Promise<CommandMeta> {
  return resolve(command.meta ?? {});
}

async function resolve<T>(value: Resolvable<T>): Promise<T> {
  if (typeof value === "function") {
    return (value as () => T | Promise<T>)();
  }

  return value;
}
