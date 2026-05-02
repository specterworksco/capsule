import { describe, expect, test, mock } from "bun:test";
import { getCertificate, putCertificate, revokeCertificate, getCapsule, putCapsule } from "../../../apps/keyring/src/kv";

function mockEnv() {
  const store = new Map<string, string>();

  return {
    CAPSULE_KEYRING: {
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
      list: mock(async () => ({ keys: [] })),
    } as never,
  };
}

const validUuid = "550e8400-e29b-41d4-a716-446655440000";
const validDatetime = "2025-01-01T00:00:00.000Z";
const validAuthor = { name: "Alice", email: "alice@example.com" };

describe("keyring kv operations", () => {
  test("putCertificate and getCertificate round-trip", async () => {
    const env = mockEnv();
    const record = {
      certificateId: validUuid,
      publicKey: "pubkey",
      issuedAt: validDatetime,
      author: validAuthor,
    };

    await putCertificate(env, record);
    const result = await getCertificate(env, validUuid);
    expect(result).toEqual(record);
  });

  test("getCertificate returns null for missing", async () => {
    expect(await getCertificate(mockEnv(), "nonexistent")).toBeNull();
  });

  test("revokeCertificate updates existing certificate", async () => {
    const env = mockEnv();
    const record = {
      certificateId: validUuid,
      publicKey: "pubkey",
      issuedAt: validDatetime,
      author: validAuthor,
    };

    await putCertificate(env, record);
    const revoked = await revokeCertificate(env, validUuid, validDatetime, undefined);
    expect(revoked).not.toBeNull();
    expect(revoked!.revokedAt).toBe(validDatetime);
    expect(revoked!.replacedByCertificateId).toBeUndefined();
  });

  test("revokeCertificate with replacement id", async () => {
    const env = mockEnv();
    const record = {
      certificateId: validUuid,
      publicKey: "pubkey",
      issuedAt: validDatetime,
      author: validAuthor,
    };

    await putCertificate(env, record);
    const revoked = await revokeCertificate(env, validUuid, validDatetime, "other-uuid");
    expect(revoked!.replacedByCertificateId).toBe("other-uuid");
  });

  test("revokeCertificate returns null for missing", async () => {
    expect(await revokeCertificate(mockEnv(), "nonexistent", validDatetime)).toBeNull();
  });

  test("putCapsule and getCapsule round-trip", async () => {
    const env = mockEnv();
    const capsule = {
      certificateId: validUuid,
      author: validAuthor,
      publicKey: "pubkey",
      publishedAt: validDatetime,
    };
    const hash = "a".repeat(64);

    await putCapsule(env, hash, capsule);
    const result = await getCapsule(env, hash);
    expect(result).toEqual(capsule);
  });

  test("getCapsule returns null for missing", async () => {
    expect(await getCapsule(mockEnv(), "b".repeat(64))).toBeNull();
  });
});
