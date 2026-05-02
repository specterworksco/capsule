import { describe, expect, test } from "bun:test";
import {
  AuthorSchema,
  CertificateRequestSchema,
  CertificateResponseSchema,
  CertificateRecordSchema,
  PublishRequestSchema,
  PublishResponseSchema,
  VerifyResponseSchema,
  CertificateRevokeRequestSchema,
  CertificateRevokeResponseSchema,
  CapsuleSignatureSchema,
  createCertificateRevokeMessage,
  DEFAULT_KEYRING_SERVER,
  KEYRING_ACTION_MAX_SKEW_MS,
} from "../../../packages/shared/src/keyring";

const validAuthor = { name: "Alice", email: "alice@example.com" };
const validUuid = "550e8400-e29b-41d4-a716-446655440000";
const validDatetime = "2025-01-01T00:00:00.000Z";
const validHex64 = "a".repeat(64);

describe("AuthorSchema", () => {
  test("accepts valid author", () => {
    expect(AuthorSchema.parse(validAuthor)).toEqual(validAuthor);
  });

  test("rejects empty name", () => {
    expect(() => AuthorSchema.parse({ ...validAuthor, name: "" })).toThrow();
  });

  test("rejects invalid email", () => {
    expect(() => AuthorSchema.parse({ ...validAuthor, email: "not-email" })).toThrow();
  });

  test("rejects empty email", () => {
    expect(() => AuthorSchema.parse({ ...validAuthor, email: "" })).toThrow();
  });
});

describe("CertificateRequestSchema", () => {
  test("is same as AuthorSchema", () => {
    expect(CertificateRequestSchema.parse(validAuthor)).toEqual(validAuthor);
  });
});

describe("CertificateResponseSchema", () => {
  const valid = { certificateId: validUuid, publicKey: "abc", privateKey: "def", issuedAt: validDatetime, author: validAuthor };

  test("accepts valid response", () => {
    expect(CertificateResponseSchema.parse(valid)).toEqual(valid);
  });

  test("rejects non-uuid certificateId", () => {
    expect(() => CertificateResponseSchema.parse({ ...valid, certificateId: "not-uuid" })).toThrow();
  });

  test("rejects non-datetime issuedAt", () => {
    expect(() => CertificateResponseSchema.parse({ ...valid, issuedAt: "not-datetime" })).toThrow();
  });

  test("rejects missing privateKey/publicKey", () => {
    const { privateKey: _, ...noPrivate } = valid;
    expect(() => CertificateResponseSchema.parse(noPrivate)).toThrow();
    const { publicKey: _2, ...noPublic } = valid;
    expect(() => CertificateResponseSchema.parse(noPublic)).toThrow();
  });
});

describe("CertificateRecordSchema", () => {
  const valid = { certificateId: validUuid, publicKey: "abc", issuedAt: validDatetime, author: validAuthor };

  test("accepts valid record", () => {
    expect(CertificateRecordSchema.parse(valid)).toEqual(valid);
  });

  test("accepts record with optional revokedAt", () => {
    const withRevoked = { ...valid, revokedAt: validDatetime };
    expect(CertificateRecordSchema.parse(withRevoked).revokedAt).toBe(validDatetime);
  });

  test("accepts record with replacedByCertificateId", () => {
    const withReplace = { ...valid, replacedByCertificateId: validUuid };
    expect(CertificateRecordSchema.parse(withReplace).replacedByCertificateId).toBe(validUuid);
  });
});

describe("PublishRequestSchema", () => {
  const valid = { contentHash: validHex64, signature: "sig", certificateId: validUuid };

  test("accepts valid publish request", () => {
    expect(PublishRequestSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid contentHash (not 64 hex chars)", () => {
    expect(() => PublishRequestSchema.parse({ ...valid, contentHash: "abc" })).toThrow();
    expect(() => PublishRequestSchema.parse({ ...valid, contentHash: "z" + "a".repeat(63) })).toThrow();
    expect(() => PublishRequestSchema.parse({ ...valid, contentHash: "a".repeat(63) })).toThrow();
  });

  test("rejects non-uuid certificateId", () => {
    expect(() => PublishRequestSchema.parse({ ...valid, certificateId: "bad" })).toThrow();
  });

  test("rejects empty signature", () => {
    expect(() => PublishRequestSchema.parse({ ...valid, signature: "" })).toThrow();
  });
});

describe("PublishResponseSchema", () => {
  test("accepts valid response", () => {
    expect(PublishResponseSchema.parse({ success: true as const, author: validAuthor })).toEqual({ success: true, author: validAuthor });
  });

  test("rejects success: false", () => {
    expect(() => PublishResponseSchema.parse({ success: false, author: validAuthor })).toThrow();
  });
});

describe("VerifyResponseSchema", () => {
  const verifiedPayload = {
    verified: true as const,
    certificateId: validUuid,
    author: validAuthor,
    publishedAt: validDatetime,
    publicKey: "key",
  };

  test("accepts verified response", () => {
    expect(VerifyResponseSchema.parse(verifiedPayload)).toEqual(verifiedPayload);
  });

  test("accepts verified response with optional fields", () => {
    const withOpts = { ...verifiedPayload, revokedAt: validDatetime, replacedByCertificateId: validUuid };
    expect(VerifyResponseSchema.parse(withOpts)).toEqual(withOpts);
  });

  test("accepts unverified response", () => {
    expect(VerifyResponseSchema.parse({ verified: false as const })).toEqual({ verified: false });
  });

  test("rejects unknown status", () => {
    expect(() => VerifyResponseSchema.parse({ verified: "maybe" })).toThrow();
  });
});

describe("CertificateRevokeRequestSchema", () => {
  const valid = { issuedAt: validDatetime, signature: "sig" };

  test("accepts minimal valid request", () => {
    expect(CertificateRevokeRequestSchema.parse(valid)).toEqual(valid);
  });

  test("accepts with replacementCertificateId", () => {
    const withReplace = { ...valid, replacementCertificateId: validUuid };
    expect(CertificateRevokeRequestSchema.parse(withReplace)).toEqual(withReplace);
  });

  test("rejects invalid issuedAt", () => {
    expect(() => CertificateRevokeRequestSchema.parse({ ...valid, issuedAt: "bad" })).toThrow();
  });

  test("rejects empty signature", () => {
    expect(() => CertificateRevokeRequestSchema.parse({ ...valid, signature: "" })).toThrow();
  });
});

describe("CertificateRevokeResponseSchema", () => {
  const valid = { success: true as const, certificateId: validUuid, revokedAt: validDatetime };

  test("accepts valid response", () => {
    expect(CertificateRevokeResponseSchema.parse(valid)).toEqual(valid);
  });

  test("accepts with replacedByCertificateId", () => {
    const withReplace = { ...valid, replacedByCertificateId: validUuid };
    expect(CertificateRevokeResponseSchema.parse(withReplace)).toEqual(withReplace);
  });
});

describe("CapsuleSignatureSchema", () => {
  const valid = { certificateId: validUuid, signature: "sig", publicKey: "key" };

  test("accepts valid signature", () => {
    expect(CapsuleSignatureSchema.parse(valid)).toEqual(valid);
  });

  test("rejects non-uuid certificateId", () => {
    expect(() => CapsuleSignatureSchema.parse({ ...valid, certificateId: "bad" })).toThrow();
  });

  test("rejects empty publicKey", () => {
    expect(() => CapsuleSignatureSchema.parse({ ...valid, publicKey: "" })).toThrow();
  });
});

describe("createCertificateRevokeMessage", () => {
  test("generates message with replacement", () => {
    const result = createCertificateRevokeMessage(validUuid, "other-uuid", validDatetime);
    expect(result).toBe(`capsule-keyring:revoke:${validUuid}:other-uuid:${validDatetime}`);
  });

  test("generates message without replacement", () => {
    const result = createCertificateRevokeMessage(validUuid, undefined, validDatetime);
    expect(result).toBe(`capsule-keyring:revoke:${validUuid}:none:${validDatetime}`);
  });
});

test("DEFAULT_KEYRING_SERVER is correct", () => {
  expect(DEFAULT_KEYRING_SERVER).toBe("https://keyring.usecapsule.net");
});

test("KEYRING_ACTION_MAX_SKEW_MS is 5 minutes", () => {
  expect(KEYRING_ACTION_MAX_SKEW_MS).toBe(300_000);
});
