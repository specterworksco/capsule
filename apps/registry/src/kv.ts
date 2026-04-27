import type { RegistryAppMetadata, RegistryVersionMetadata } from "@capsule/shared";
import type { Env, PublishedVersion } from "./types";

export async function getApp(env: Env, name: string): Promise<RegistryAppMetadata | null> {
  return env.CAPSULE_REGISTRY.get<RegistryAppMetadata>(appKey(name), "json");
}

export async function putApp(env: Env, name: string, metadata: RegistryAppMetadata): Promise<void> {
  await env.CAPSULE_REGISTRY.put(appKey(name), JSON.stringify(metadata));
}

export async function getVersion(env: Env, name: string, version: string): Promise<RegistryVersionMetadata | null> {
  return env.CAPSULE_REGISTRY.get<RegistryVersionMetadata>(versionKey(name, version), "json");
}

export async function putVersion(
  env: Env,
  name: string,
  version: string,
  metadata: RegistryVersionMetadata,
): Promise<void> {
  await env.CAPSULE_REGISTRY.put(versionKey(name, version), JSON.stringify(metadata));
}

export async function listVersions(env: Env, name: string): Promise<PublishedVersion[]> {
  const listed = await env.CAPSULE_REGISTRY.list({ prefix: versionPrefix(name) });
  const versions = await Promise.all(
    listed.keys.map(async (key) => {
      const metadata = await env.CAPSULE_REGISTRY.get<RegistryVersionMetadata>(key.name, "json");
      if (!metadata) {
        return null;
      }

      return {
        version: key.name.slice(versionPrefix(name).length),
        hash: metadata.hash,
        publishedAt: metadata.publishedAt,
      };
    }),
  );

  return versions.filter((version): version is PublishedVersion => version !== null);
}

function appKey(name: string): string {
  return `app:${name}`;
}

function versionKey(name: string, version: string): string {
  return `${versionPrefix(name)}${version}`;
}

function versionPrefix(name: string): string {
  return `app:${name}:`;
}
