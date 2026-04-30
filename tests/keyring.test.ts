import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCertificateRevokeMessage } from "../packages/shared/src/keyring";
import { signMessage } from "../apps/cli/src/core/crypto";
import { createSignedCapsule, createTestEnv, publishToKeyring, requestCertificate, type TestEnv } from "./helpers";

describe("keyring server", () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    env.close();
  });

  test("issues certificates and exposes only the public record", async () => {
    const certificate = await requestCertificate(env.keyringUrl, { name: "Jane Dev", email: "jane@example.com" });

    expect(certificate.privateKey).toBeString();
    expect(certificate.certificateId).toBeString();

    const response = await fetch(`${env.keyringUrl}/certificates/${certificate.certificateId}`);
    expect(response.status).toBe(200);
    const record = await response.json();

    expect(record.certificateId).toBe(certificate.certificateId);
    expect(record.publicKey).toBe(certificate.publicKey);
    expect(record.author).toEqual(certificate.author);
    expect(record.privateKey).toBeUndefined();
    expect(record.revokedAt).toBeUndefined();
  });

  test("publishes and verifies a signed content hash", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "signed-app" });

    await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);

    const response = await fetch(`${env.keyringUrl}/verify/${capsule.contentHash}`);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.verified).toBe(true);
    expect(body.certificateId).toBe(certificate.certificateId);
    expect(body.author).toEqual(certificate.author);
    expect(body.publicKey).toBe(certificate.publicKey);
  });

  test("rejects invalid publish signatures", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "bad-signature" });

    const response = await fetch(`${env.keyringUrl}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificateId: certificate.certificateId,
        contentHash: capsule.contentHash,
        signature: capsule.signature.replace(/.$/, "A"),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid signature" });
  });

  test("revokes certificates and blocks future publishes", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const replacement = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "revoked-app" });
    await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);

    const issuedAt = new Date().toISOString();
    const signature = await signMessage(
      createCertificateRevokeMessage(certificate.certificateId, replacement.certificateId, issuedAt),
      certificate.privateKey,
    );
    const revoke = await fetch(`${env.keyringUrl}/certificates/${certificate.certificateId}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replacementCertificateId: replacement.certificateId, issuedAt, signature }),
    });

    expect(revoke.status).toBe(200);
    const revoked = await revoke.json();
    expect(revoked.success).toBe(true);
    expect(revoked.replacedByCertificateId).toBe(replacement.certificateId);

    const verified = await (await fetch(`${env.keyringUrl}/verify/${capsule.contentHash}`)).json();
    expect(verified.verified).toBe(true);
    expect(verified.revokedAt).toBeString();
    expect(verified.replacedByCertificateId).toBe(replacement.certificateId);

    const nextCapsule = await createSignedCapsule(certificate, { name: "blocked-app" });
    const publish = await fetch(`${env.keyringUrl}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificateId: certificate.certificateId,
        contentHash: nextCapsule.contentHash,
        signature: nextCapsule.signature,
      }),
    });

    expect(publish.status).toBe(403);
    expect(await publish.json()).toEqual({ error: "Certificate revoked" });
  });
});
