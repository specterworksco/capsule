import { Hono } from "hono";
import { PublishRequestSchema } from "@capsule/shared";
import { verifyContentHashSignature } from "../crypto";
import { getCertificate, putCapsule, type Env } from "../kv";

export const publishRoute = new Hono<{ Bindings: Env }>();

publishRoute.post("/", async (c) => {
  const parsed = PublishRequestSchema.safeParse(await c.req.json().catch(() => undefined));

  if (!parsed.success) {
    return c.json({ error: "Invalid publish request" }, 400);
  }

  const certificate = await getCertificate(c.env, parsed.data.certificateId);
  if (!certificate) {
    return c.json({ error: "Unknown certificate" }, 404);
  }

  if (certificate.revokedAt) {
    return c.json({ error: "Certificate revoked" }, 403);
  }

  const valid = await verifyContentHashSignature(parsed.data.contentHash, parsed.data.signature, certificate.publicKey);
  if (!valid) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const publishedAt = new Date().toISOString();
  await putCapsule(c.env, parsed.data.contentHash, {
    certificateId: certificate.certificateId,
    author: certificate.author,
    publicKey: certificate.publicKey,
    publishedAt,
  });

  return c.json({ success: true, author: certificate.author });
});
