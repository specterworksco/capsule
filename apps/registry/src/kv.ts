import type { RegistryAppMetadata, RegistryVersionMetadata, RegistrySearchIndexEntry } from "@capsule/shared";
import type { Env, PublishedVersion, PublishedVersionRecord } from "./types";

export async function getApp(env: Env, name: string): Promise<RegistryAppMetadata | null> {
  return env.CAPSULE_REGISTRY.get<RegistryAppMetadata>(appKey(name), "json");
}

export async function putApp(env: Env, name: string, metadata: RegistryAppMetadata): Promise<void> {
  await env.CAPSULE_REGISTRY.put(appKey(name), JSON.stringify(metadata));
}

export async function deleteApp(env: Env, name: string): Promise<void> {
  await env.CAPSULE_REGISTRY.delete(appKey(name));
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

export async function deleteVersion(env: Env, name: string, version: string): Promise<void> {
  await env.CAPSULE_REGISTRY.delete(versionKey(name, version));
}

export async function listVersions(env: Env, name: string): Promise<PublishedVersion[]> {
  const versions = await listVersionRecords(env, name);
  return versions.map(({ version, hash, publishedAt }) => ({ version, hash, publishedAt }));
}

export async function listVersionRecords(env: Env, name: string): Promise<PublishedVersionRecord[]> {
  const listed = await env.CAPSULE_REGISTRY.list({ prefix: versionPrefix(name) });
  const versions = await Promise.all(
    listed.keys.map(async (key) => {
      const metadata = await env.CAPSULE_REGISTRY.get<RegistryVersionMetadata>(key.name, "json");
      if (!metadata) {
        return null;
      }

      return {
        version: key.name.slice(versionPrefix(name).length),
        r2Key: metadata.r2Key,
        hash: metadata.hash,
        publishedAt: metadata.publishedAt,
      };
    }),
  );

  return versions.filter((version): version is PublishedVersionRecord => version !== null);
}

export async function addOwnedApp(env: Env, certificateId: string, name: string): Promise<void> {
  await env.CAPSULE_REGISTRY.put(ownerAppKey(certificateId, name), "1");
}

export async function removeOwnedApp(env: Env, certificateId: string, name: string): Promise<void> {
  await env.CAPSULE_REGISTRY.delete(ownerAppKey(certificateId, name));
}

export async function listOwnedApps(env: Env, certificateId: string): Promise<string[]> {
  const listed = await env.CAPSULE_REGISTRY.list({ prefix: ownerPrefix(certificateId) });
  return listed.keys.map((key) => key.name.slice(ownerPrefix(certificateId).length));
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

function ownerAppKey(certificateId: string, name: string): string {
  return `${ownerPrefix(certificateId)}${name}`;
}

function ownerPrefix(certificateId: string): string {
  return `owner:${certificateId}:`;
}

// ── Search index ──────────────────────────────────────────────────────────────
const SEARCH_INDEX_KEY = "_search_index";

export async function getSearchIndex(env: Env): Promise<RegistrySearchIndexEntry[] | null> {
  return env.CAPSULE_REGISTRY.get<RegistrySearchIndexEntry[]>(SEARCH_INDEX_KEY, "json");
}

export async function putSearchIndex(env: Env, index: RegistrySearchIndexEntry[]): Promise<void> {
  await env.CAPSULE_REGISTRY.put(SEARCH_INDEX_KEY, JSON.stringify(index));
}

export async function addToSearchIndex(env: Env, entry: RegistrySearchIndexEntry): Promise<void> {
  const index = (await getSearchIndex(env)) ?? [];
  const existing = index.findIndex((e) => e.name === entry.name);
  if (existing !== -1) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }
  await putSearchIndex(env, index);
}

export async function removeFromSearchIndex(env: Env, name: string): Promise<void> {
  const index = (await getSearchIndex(env)) ?? [];
  const filtered = index.filter((e) => e.name !== name);
  if (filtered.length !== index.length) {
    await putSearchIndex(env, filtered);
  }
}
