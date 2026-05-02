import { defineCommand } from "citty";
import { setAppSecret, removeAppSecret, listAppSecrets, getSecretsForApp } from "../core/secrets";
import { getInstalledApp } from "../core/store";
import { logger } from "../utils/logger";

const secretSetCommand = defineCommand({
  meta: {
    name: "set",
    description: "Set a secret for an installed app",
  },
  args: {
    app: {
      type: "positional",
      required: true,
      description: "App name",
    },
    keyvalue: {
      type: "positional",
      required: true,
      description: "KEY=VALUE pair",
    },
  },
  async run({ args }) {
    const appName = args._[0];
    const keyValue = args._[1];

    if (!appName) {
      throw new Error("Missing app name");
    }

    if (!keyValue || !keyValue.includes("=")) {
      throw new Error("Missing or invalid KEY=VALUE pair");
    }

    const separatorIndex = keyValue.indexOf("=");
    const key = keyValue.slice(0, separatorIndex);
    const value = keyValue.slice(separatorIndex + 1);

    if (!key) {
      throw new Error("Secret key cannot be empty");
    }

    const app = await getInstalledApp(appName);
    if (!app) {
      throw new Error(`App "${appName}" is not installed. Install it first with \`capsule registry install ${appName}\`.`);
    }

    logger.section(`Secret: ${appName}`);

    await setAppSecret(appName, key, value);
    logger.success(`Set secret ${logger.command(key)} for ${appName}`);
  },
});

const secretRemoveCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Remove a secret from an installed app",
  },
  args: {
    app: {
      type: "positional",
      required: true,
      description: "App name",
    },
    key: {
      type: "positional",
      required: true,
      description: "Secret key to remove",
    },
  },
  async run({ args }) {
    const appName = args._[0];
    const key = args._[1];

    if (!appName) {
      throw new Error("Missing app name");
    }

    if (!key) {
      throw new Error("Missing secret key");
    }

    logger.section(`Secret: ${appName}`);

    const removed = await removeAppSecret(appName, key);
    if (removed) {
      logger.success(`Removed secret ${logger.command(key)} from ${appName}`);
    } else {
      logger.warn(`Secret ${logger.command(key)} not found for ${appName}`);
    }
  },
});

const secretListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List all secret keys for an installed app",
  },
  args: {
    app: {
      type: "positional",
      required: true,
      description: "App name",
    },
  },
  async run({ args }) {
    const appName = args._[0];

    if (!appName) {
      throw new Error("Missing app name");
    }

    const app = await getInstalledApp(appName);
    if (!app) {
      throw new Error(`App "${appName}" is not installed.`);
    }

    logger.section(`Secrets: ${appName}`);

    const keys = await listAppSecrets(appName);

    if (keys.length === 0) {
      logger.info(`No secrets set for ${appName}.`);
      return;
    }

    for (const key of keys) {
      logger.label(key, "••••••••");
    }
  },
});

export const secretCommand = defineCommand({
  meta: {
    name: "secret",
    description: "Manage environment secrets for installed apps",
  },
  subCommands: {
    set: secretSetCommand,
    remove: secretRemoveCommand,
    list: secretListCommand,
  },
});
