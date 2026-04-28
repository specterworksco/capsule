import { Hono } from "hono";
import {
  CertificateRevokeRequestSchema,
  KEYRING_ACTION_MAX_SKEW_MS,
  createCertificateRevokeMessage,
} from "@capsule/shared";
import { verifySignedMessage } from "../crypto";
import { getCertificate, revokeCertificate, type Env } from "../kv";

export const revokeRoute = new Hono<{ Bindings: Env }>();

revokeRoute.post("/:certificateId/revoke", async (c) => {
  const certificateId = c.req.param("certificateId");
  if (!isUuid(certificateId)) {
    return c.json({ error: "Invalid certificateId" }, 400);
  }

  const parsed = CertificateRevokeRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) {
    return c.json({ error: "Invalid revoke request" }, 400);
  }

  const certificate = await getCertificate(c.env, certificateId);
  if (!certificate) {
    return c.json({ error: "Unknown certificate" }, 404);
  }

  if (certificate.revokedAt) {
    return c.json({ error: "Certificate already revoked" }, 409);
  }

  if (parsed.data.replacementCertificateId) {
    const replacement = await getCertificate(c.env, parsed.data.replacementCertificateId);
    if (!replacement) {
      return c.json({ error: "Unknown replacement certificate" }, 404);
    }

    if (replacement.revokedAt) {
      return c.json({ error: "Replacement certificate is revoked" }, 409);
    }

    if (replacement.certificateId === certificate.certificateId) {
      return c.json({ error: "Replacement certificate must be different" }, 400);
    }
  }

  if (!isFreshTimestamp(parsed.data.issuedAt, KEYRING_ACTION_MAX_SKEW_MS)) {
    return c.json({ error: "Request timestamp expired" }, 400);
  }

  const message = createCertificateRevokeMessage(certificateId, parsed.data.replacementCertificateId, parsed.data.issuedAt);
  const valid = await verifySignedMessage(message, parsed.data.signature, certificate.publicKey);
  if (!valid) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const revokedAt = new Date().toISOString();
  await revokeCertificate(c.env, certificateId, revokedAt, parsed.data.replacementCertificateId);

  return c.json({
    success: true,
    certificateId,
    revokedAt,
    replacedByCertificateId: parsed.data.replacementCertificateId,
  });
});

function isFreshTimestamp(value: string, maxSkewMs: number): boolean {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return false;
  }

  return Math.abs(Date.now() - time) <= maxSkewMs;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
