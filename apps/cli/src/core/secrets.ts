import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { getStoreRoot } from "./store";

export type SecretsStore = Record<string, Record<string, string>>;

function getSecretsPath(): string {
  return join(getStoreRoot(), "secrets.json");
}

export async function loadSecrets(): Promise<SecretsStore> {
  const secretsPath = getSecretsPath();

  if (!existsSync(secretsPath)) {
    return {};
  }

  try {
    return JSON.parse(await readFile(secretsPath, "utf8")) as SecretsStore;
  } catch {
    return {};
  }
}

export async function saveSecrets(store: SecretsStore): Promise<void> {
  const secretsPath = getSecretsPath();
  await mkdir(dirname(secretsPath), { recursive: true });
  await writeFile(secretsPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  await chmod(secretsPath, 0o600).catch(() => undefined);
}

export async function getSecretsForApp(appName: string): Promise<Record<string, string>> {
  const store = await loadSecrets();
  return store[appName] ?? {};
}

export async function setAppSecret(appName: string, key: string, value: string): Promise<void> {
  const store = await loadSecrets();

  if (!store[appName]) {
    store[appName] = {};
  }

  store[appName][key] = value;
  await saveSecrets(store);
}

export async function removeAppSecret(appName: string, key: string): Promise<boolean> {
  const store = await loadSecrets();

  if (!store[appName] || !(key in store[appName])) {
    return false;
  }

  delete store[appName][key];

  if (Object.keys(store[appName]).length === 0) {
    delete store[appName];
  }

  await saveSecrets(store);
  return true;
}

export async function listAppSecrets(appName: string): Promise<string[]> {
  const secrets = await getSecretsForApp(appName);
  return Object.keys(secrets);
}

export async function injectSecretsIntoEnv(appName: string): Promise<() => void> {
  const secrets = await getSecretsForApp(appName);
  const previousValues: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(secrets)) {
    previousValues[key] = process.env[key];
    process.env[key] = value;
  }

  // Return a restore function
  return () => {
    for (const key of Object.keys(secrets)) {
      if (previousValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValues[key];
      }
    }
  };
}
