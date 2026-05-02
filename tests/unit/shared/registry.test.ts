import { describe, expect, test } from "bun:test";
import {
  RegistryAppNameSchema,
  RegistryVersionSchema,
  RegistryActiveAppMetadataSchema,
  RegistryTombstonedAppMetadataSchema,
  RegistryAppMetadataSchema,
  RegistryVersionMetadataSchema,
  RegistryPublishResponseSchema,
  RegistryResolveResponseSchema,
  RegistryAppInfoResponseSchema,
  RegistryPublishedVersionSchema,
  RegistrySignedMutationSchema,
  RegistryTransferRequestSchema,
  RegistryTransferResponseSchema,
  RegistryRemoveRequestSchema,
  RegistryRemoveResponseSchema,
  RegistryOwnedPackagesResponseSchema,
  createRegistryRemoveMessage,
  createRegistryTransferMessage,
  DEFAULT_REGISTRY_SERVER,
  REGISTRY_ACTION_MAX_SKEW_MS,
  REGISTRY_TOMBSTONE_MESSAGE,
} from "../../../packages/shared/src/registry";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";
const validDatetime = "2025-01-01T00:00:00.000Z";
const validHex64 = "a".repeat(64);
const validAuthor = { name: "Alice", email: "alice@example.com" };

describe("RegistryAppNameSchema", () => {
  test("accepts simple name", () => {
    expect(RegistryAppNameSchema.parse("my-app")).toBe("my-app");
  });

  test("accepts name with numbers", () => {
    expect(RegistryAppNameSchema.parse("app123")).toBe("app123");
  });

  test("accepts single character", () => {
    expect(RegistryAppNameSchema.parse("a")).toBe("a");
  });

  test("rejects uppercase letters", () => {
    expect(() => RegistryAppNameSchema.parse("MyApp")).toThrow();
  });

  test("rejects empty string", () => {
    expect(() => RegistryAppNameSchema.parse("")).toThrow();
  });

  test("rejects leading hyphen", () => {
    expect(() => RegistryAppNameSchema.parse("-app")).toThrow();
  });

  test("rejects leading number then hyphen is ok", () => {
    expect(RegistryAppNameSchema.parse("1-app")).toBe("1-app");
  });

  test("rejects string over 64 chars", () => {
    expect(() => RegistryAppNameSchema.parse("a".repeat(65))).toThrow();
  });

  test("accepts exactly 64 chars", () => {
    const name = "a".repeat(64);
    expect(RegistryAppNameSchema.parse(name)).toBe(name);
  });

  test("rejects special characters", () => {
    expect(() => RegistryAppNameSchema.parse("app@name")).toThrow();
    expect(() => RegistryAppNameSchema.parse("app_name")).toThrow();
  });
});

describe("RegistryVersionSchema", () => {
  test("accepts simple semver", () => {
    expect(RegistryVersionSchema.parse("1.0.0")).toBe("1.0.0");
  });

  test("accepts semver with pre-release", () => {
    expect(RegistryVersionSchema.parse("1.0.0-alpha")).toBe("1.0.0-alpha");
    expect(RegistryVersionSchema.parse("1.0.0-beta.1")).toBe("1.0.0-beta.1");
  });

  test("accepts semver with build metadata", () => {
    expect(RegistryVersionSchema.parse("1.0.0+build.123")).toBe("1.0.0+build.123");
  });

  test("rejects major-only", () => {
    expect(() => RegistryVersionSchema.parse("1")).toThrow();
  });

  test("rejects major.minor only", () => {
    expect(() => RegistryVersionSchema.parse("1.0")).toThrow();
  });

  test("rejects non-numeric parts", () => {
    expect(() => RegistryVersionSchema.parse("a.b.c")).toThrow();
  });

  test("rejects empty string", () => {
    expect(() => RegistryVersionSchema.parse("")).toThrow();
  });
});

describe("RegistryActiveAppMetadataSchema", () => {
  const valid = {
    state: "active" as const,
    latestVersion: "1.0.0",
    certificateId: validUuid,
    author: validAuthor,
    createdAt: validDatetime,
    updatedAt: validDatetime,
  };

  test("accepts valid active app metadata", () => {
    expect(RegistryActiveAppMetadataSchema.parse(valid)).toEqual(valid);
  });

  test("rejects non-active state", () => {
    expect(() => RegistryActiveAppMetadataSchema.parse({ ...valid, state: "tombstoned" })).toThrow();
  });
});

describe("RegistryTombstonedAppMetadataSchema", () => {
  const valid = {
    state: "tombstoned" as const,
    certificateId: validUuid,
    author: validAuthor,
    createdAt: validDatetime,
    updatedAt: validDatetime,
    tombstonedAt: validDatetime,
    tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE,
  };

  test("accepts valid tombstoned app metadata", () => {
    expect(RegistryTombstonedAppMetadataSchema.parse(valid)).toEqual(valid);
  });

  test("rejects non-tombstoned state", () => {
    expect(() => RegistryTombstonedAppMetadataSchema.parse({ ...valid, state: "active" })).toThrow();
  });
});

describe("RegistryAppMetadataSchema", () => {
  test("parses active metadata", () => {
    const result = RegistryAppMetadataSchema.parse({
      state: "active",
      latestVersion: "1.0.0",
      certificateId: validUuid,
      author: validAuthor,
      createdAt: validDatetime,
      updatedAt: validDatetime,
    });
    expect(result.state).toBe("active");
  });

  test("parses tombstoned metadata", () => {
    const result = RegistryAppMetadataSchema.parse({
      state: "tombstoned",
      certificateId: validUuid,
      author: validAuthor,
      createdAt: validDatetime,
      updatedAt: validDatetime,
      tombstonedAt: validDatetime,
      tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE,
    });
    expect(result.state).toBe("tombstoned");
  });
});

describe("RegistryVersionMetadataSchema", () => {
  const valid = { r2Key: "apps/my-app/1.0.0.capsule.app", hash: validHex64, publishedAt: validDatetime };

  test("accepts valid version metadata", () => {
    expect(RegistryVersionMetadataSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid hash", () => {
    expect(() => RegistryVersionMetadataSchema.parse({ ...valid, hash: "bad" })).toThrow();
  });
});

describe("RegistryPublishResponseSchema", () => {
  const valid = { success: true as const, name: "my-app", version: "1.0.0", downloadUrl: "https://example.com/download" };

  test("accepts valid publish response", () => {
    expect(RegistryPublishResponseSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid name", () => {
    expect(() => RegistryPublishResponseSchema.parse({ ...valid, name: "MyApp" })).toThrow();
  });

  test("rejects invalid download URL", () => {
    expect(() => RegistryPublishResponseSchema.parse({ ...valid, downloadUrl: "not-url" })).toThrow();
  });
});

describe("RegistryResolveResponseSchema", () => {
  const activePayload = {
    state: "active" as const,
    name: "my-app",
    version: "1.0.0",
    downloadUrl: "https://example.com/dl",
    author: validAuthor,
    certificateId: validUuid,
    hash: validHex64,
  };

  test("accepts active resolve response", () => {
    expect(RegistryResolveResponseSchema.parse(activePayload)).toEqual(activePayload);
  });

  test("accepts tombstoned resolve response", () => {
    const tombstoned = {
      state: "tombstoned" as const,
      name: "my-app",
      author: validAuthor,
      certificateId: validUuid,
      tombstonedAt: validDatetime,
      tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE,
    };
    expect(RegistryResolveResponseSchema.parse(tombstoned)).toEqual(tombstoned);
  });
});

describe("RegistryPublishedVersionSchema", () => {
  const valid = { version: "1.0.0", hash: validHex64, publishedAt: validDatetime };

  test("accepts valid published version", () => {
    expect(RegistryPublishedVersionSchema.parse(valid)).toEqual(valid);
  });
});

describe("RegistryAppInfoResponseSchema", () => {
  const activePayload = {
    state: "active" as const,
    name: "my-app",
    author: validAuthor,
    certificateId: validUuid,
    latestVersion: "1.0.0",
    versions: [{ version: "1.0.0", hash: validHex64, publishedAt: validDatetime }],
  };

  test("accepts active app info", () => {
    expect(RegistryAppInfoResponseSchema.parse(activePayload)).toEqual(activePayload);
  });

  test("accepts tombstoned app info", () => {
    const tombstoned = {
      state: "tombstoned" as const,
      name: "my-app",
      author: validAuthor,
      certificateId: validUuid,
      tombstonedAt: validDatetime,
      tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE,
    };
    expect(RegistryAppInfoResponseSchema.parse(tombstoned)).toEqual(tombstoned);
  });
});

describe("RegistrySignedMutationSchema", () => {
  const valid = { certificateId: validUuid, issuedAt: validDatetime, signature: "sig" };

  test("accepts valid mutation", () => {
    expect(RegistrySignedMutationSchema.parse(valid)).toEqual(valid);
  });
});

describe("RegistryTransferRequestSchema", () => {
  const valid = { certificateId: validUuid, issuedAt: validDatetime, signature: "sig", toCertificateId: validUuid };

  test("accepts valid transfer request", () => {
    expect(RegistryTransferRequestSchema.parse(valid)).toEqual(valid);
  });

  test("rejects missing toCertificateId", () => {
    const { toCertificateId: _, ...rest } = valid;
    expect(() => RegistryTransferRequestSchema.parse(rest)).toThrow();
  });
});

describe("RegistryTransferResponseSchema", () => {
  const valid = { success: true as const, name: "my-app", certificateId: validUuid, toCertificateId: validUuid };

  test("accepts valid transfer response", () => {
    expect(RegistryTransferResponseSchema.parse(valid)).toEqual(valid);
  });
});

describe("RegistryRemoveRequestSchema", () => {
  const valid = { certificateId: validUuid, issuedAt: validDatetime, signature: "sig" };

  test("accepts valid remove request", () => {
    expect(RegistryRemoveRequestSchema.parse(valid)).toEqual(valid);
  });
});

describe("RegistryRemoveResponseSchema", () => {
  const valid = { success: true as const, name: "my-app", tombstonedAt: validDatetime, tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE };

  test("accepts valid remove response", () => {
    expect(RegistryRemoveResponseSchema.parse(valid)).toEqual(valid);
  });
});

describe("RegistryOwnedPackagesResponseSchema", () => {
  const valid = { certificateId: validUuid, packages: ["my-app", "other-app"] };

  test("accepts valid owned packages", () => {
    expect(RegistryOwnedPackagesResponseSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid package names in array", () => {
    expect(() => RegistryOwnedPackagesResponseSchema.parse({ certificateId: validUuid, packages: ["MyApp"] })).toThrow();
  });
});

describe("createRegistryRemoveMessage", () => {
  test("generates correct message", () => {
    expect(createRegistryRemoveMessage("my-app", validDatetime)).toBe(`capsule-registry:remove:my-app:${validDatetime}`);
  });
});

describe("createRegistryTransferMessage", () => {
  test("generates correct message", () => {
    expect(createRegistryTransferMessage("my-app", validUuid, validDatetime)).toBe(
      `capsule-registry:transfer:my-app:${validUuid}:${validDatetime}`,
    );
  });
});

test("DEFAULT_REGISTRY_SERVER is correct", () => {
  expect(DEFAULT_REGISTRY_SERVER).toBe("https://registry.usecapsule.net");
});

test("REGISTRY_ACTION_MAX_SKEW_MS is 5 minutes", () => {
  expect(REGISTRY_ACTION_MAX_SKEW_MS).toBe(300_000);
});

test("REGISTRY_TOMBSTONE_MESSAGE is set", () => {
  expect(REGISTRY_TOMBSTONE_MESSAGE).toBeTruthy();
});
