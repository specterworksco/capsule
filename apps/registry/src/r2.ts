import type { Env } from "./types";

export function appObjectKey(name: string, version: string): string {
  return `apps/${name}/${version}.capsule.app`;
}

export async function putAppObject(env: Env, key: string, bytes: Uint8Array): Promise<void> {
  await env.CAPSULE_APPS.put(key, bytes, {
    httpMetadata: {
      contentType: "application/vnd.capsule.app",
    },
  });
}

export async function getAppObject(env: Env, key: string): Promise<R2ObjectBody | null> {
  return env.CAPSULE_APPS.get(key);
}

export async function deleteAppObject(env: Env, key: string): Promise<void> {
  await env.CAPSULE_APPS.delete(key);
}
