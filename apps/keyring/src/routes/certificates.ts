import { Hono } from "hono";
import { CertificateRequestSchema } from "@capsule/shared";
import { generateCertificateKeyPair } from "../crypto";
import { getCertificateCount, putCertificate, putCertificateCount, type Env } from "../kv";

export const certificatesRoute = new Hono<{ Bindings: Env }>();

certificatesRoute.post("/", async (c) => {
  const parsed = CertificateRequestSchema.safeParse(await c.req.json().catch(() => undefined));

  if (!parsed.success) {
    return c.json({ error: "Invalid certificate request" }, 400);
  }

  const author = parsed.data;
  const count = await getCertificateCount(c.env, author.email);

  if (count >= 3) {
    return c.json({ error: "Certificate limit reached for this email" }, 429);
  }

  const certificateId = crypto.randomUUID();
  const issuedAt = new Date().toISOString();
  const keyPair = await generateCertificateKeyPair();

  await putCertificate(c.env, {
    certificateId,
    publicKey: keyPair.publicKey,
    author,
    issuedAt,
  });
  await putCertificateCount(c.env, author.email, count + 1);

  return c.json({
    certificateId,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    issuedAt,
    author,
  });
});
