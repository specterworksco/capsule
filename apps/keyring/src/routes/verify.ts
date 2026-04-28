import { Hono } from "hono";
import { getCapsule, getCertificate, type Env } from "../kv";

export const verifyRoute = new Hono<{ Bindings: Env }>();

verifyRoute.get("/:contentHash", async (c) => {
  const contentHash = c.req.param("contentHash");

  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    return c.json({ verified: false }, 400);
  }

  const capsule = await getCapsule(c.env, contentHash);
  if (!capsule) {
    return c.json({ verified: false });
  }

  const certificate = await getCertificate(c.env, capsule.certificateId);

  return c.json({
    verified: true,
    certificateId: capsule.certificateId,
    author: capsule.author,
    publishedAt: capsule.publishedAt,
    publicKey: capsule.publicKey,
    revokedAt: certificate?.revokedAt,
    replacedByCertificateId: certificate?.replacedByCertificateId,
  });
});
