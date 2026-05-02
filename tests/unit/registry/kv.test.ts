import { describe, expect, test, mock } from "bun:test";
import { getApp, putApp, deleteApp, getVersion, putVersion, deleteVersion, listVersions } from "../../../apps/registry/src/kv";

function mockEnv() {
  const store = new Map<string, string>();

  return {
    CAPSULE_REGISTRY: {
      get: mock(async (key: string, type?: "json" | "text") => {
        const val = store.get(key);
        if (val === undefined) return null;
        if (type === "json") return JSON.parse(val);
        return val;
      }),
      put: mock(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: mock(async (key: string) => {
        store.delete(key);
      }),
      list: mock(async (options?: { prefix?: string }) => {
        const prefix = options?.prefix ?? "";
        const keys = Array.from(store.keys())
          .filter((k) => k.startsWith(prefix))
          .sort()
          .map((name) => ({ name }));
        return { keys };
      }),
    } as never,
  };
}

const validUuid = "550e8400-e29b-41d4-a716-446655440000";
const validDatetime = "2025-01-01T00:00:00.000Z";
const validHex64 = "a".repeat(64);
const validAuthor = { name: "Alice", email: "alice@example.com" };

describe("kv operations", () => {
  test("putApp and getApp round-trip", async () => {
    const env = mockEnv();
    const metadata = {
      state: "active" as const,
      latestVersion: "1.0.0",
      certificateId: validUuid,
      author: validAuthor,
      createdAt: validDatetime,
      updatedAt: validDatetime,
    };

    await putApp(env, "my-app", metadata);
    const result = await getApp(env, "my-app");
    expect(result).toEqual(metadata);
  });

  test("getApp returns null for missing app", async () => {
    const env = mockEnv();
    expect(await getApp(env, "nonexistent")).toBeNull();
  });

  test("deleteApp removes app", async () => {
    const env = mockEnv();
    const metadata = {
      state: "active" as const,
      latestVersion: "1.0.0",
      certificateId: validUuid,
      author: validAuthor,
      createdAt: validDatetime,
      updatedAt: validDatetime,
    };

    await putApp(env, "my-app", metadata);
    await deleteApp(env, "my-app");
    expect(await getApp(env, "my-app")).toBeNull();
  });

  test("putVersion and getVersion round-trip", async () => {
    const env = mockEnv();
    const metadata = {
      r2Key: "apps/my-app/1.0.0.capsule.app",
      hash: validHex64,
      publishedAt: validDatetime,
    };

    await putVersion(env, "my-app", "1.0.0", metadata);
    const result = await getVersion(env, "my-app", "1.0.0");
    expect(result).toEqual(metadata);
  });

  test("getVersion returns null for missing version", async () => {
    const env = mockEnv();
    expect(await getVersion(env, "my-app", "9.9.9")).toBeNull();
  });

  test("deleteVersion removes version", async () => {
    const env = mockEnv();
    const metadata = {
      r2Key: "apps/my-app/1.0.0.capsule.app",
      hash: validHex64,
      publishedAt: validDatetime,
    };

    await putVersion(env, "my-app", "1.0.0", metadata);
    await deleteVersion(env, "my-app", "1.0.0");
    expect(await getVersion(env, "my-app", "1.0.0")).toBeNull();
  });

  test("listVersions returns all versions for app", async () => {
    const env = mockEnv();
    const v1 = { r2Key: "k1", hash: validHex64, publishedAt: validDatetime };
    const v2 = { r2Key: "k2", hash: validHex64, publishedAt: validDatetime };

    await putVersion(env, "my-app", "1.0.0", v1);
    await putVersion(env, "my-app", "2.0.0", v2);

    const versions = await listVersions(env, "my-app");
    expect(versions).toEqual([
      { version: "1.0.0", hash: v1.hash, publishedAt: v1.publishedAt },
      { version: "2.0.0", hash: v2.hash, publishedAt: v2.publishedAt },
    ]);
  });

  test("listVersions returns empty array for no versions", async () => {
    const env = mockEnv();
    expect(await listVersions(env, "my-app")).toEqual([]);
  });
});
