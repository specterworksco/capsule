import { Hono } from "hono";
import { getCapsule, type Env } from "../kv";

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

  return c.json({
    verified: true,
    certificateId: capsule.certificateId,
    author: capsule.author,
    publishedAt: capsule.publishedAt,
    publicKey: capsule.publicKey,
  });
});
