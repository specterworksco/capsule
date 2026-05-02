import { describe, expect, test } from "bun:test";
import { verifyRegistryRemoveOwnership, verifyRegistryTransferOwnership } from "../../../apps/registry/src/auth";
import type { RegistryRemoveRequest, RegistryTransferRequest } from "../../../packages/shared/src/registry";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

function makeEnv(overrides?: Record<string, unknown>) {
  return {
    CAPSULE_REGISTRY: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [] }),
    } as never,
    CAPSULE_APPS: {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    } as never,
    KEYRING_SERVER: "https://keyring.test",
    ...overrides,
  };
}

describe("verifyRegistryRemoveOwnership", () => {
  test("returns error for expired timestamp", async () => {
    const env = makeEnv();
    const request: RegistryRemoveRequest = {
      certificateId: validUuid,
      issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      signature: "sig",
    };
    const result = await verifyRegistryRemoveOwnership(env, "my-app", request, "message");
    expect(result).toEqual({ ok: false, status: 400, error: "Request timestamp expired" });
  });

  test("returns error for very old timestamp", async () => {
    const env = makeEnv();
    const request: RegistryRemoveRequest = {
      certificateId: validUuid,
      issuedAt: "2020-01-01T00:00:00.000Z",
      signature: "sig",
    };
    const result = await verifyRegistryRemoveOwnership(env, "my-app", request, "message");
    expect(result).toEqual({ ok: false, status: 400, error: "Request timestamp expired" });
  });
});

describe("verifyRegistryTransferOwnership", () => {
  test("returns error for expired timestamp", async () => {
    const env = makeEnv();
    const request: RegistryTransferRequest = {
      certificateId: validUuid,
      toCertificateId: validUuid,
      issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      signature: "sig",
    };
    const result = await verifyRegistryTransferOwnership(env, "my-app", request, "message");
    expect(result).toEqual({ ok: false, status: 400, error: "Request timestamp expired" });
  });
});
