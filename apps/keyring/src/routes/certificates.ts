import { Hono } from "hono";
import { CertificateRequestSchema } from "@capsule/shared";
import { generateCertificateKeyPair } from "../crypto";
import { getCertificate, getCertificateCount, putCertificate, putCertificateCount, type Env } from "../kv";

export const certificatesRoute = new Hono<{ Bindings: Env }>();

certificatesRoute.get("/:certificateId", async (c) => {
  const certificateId = c.req.param("certificateId");
  if (!isUuid(certificateId)) {
    return c.json({ error: "Invalid certificateId" }, 400);
  }

  const certificate = await getCertificate(c.env, certificateId);
  if (!certificate) {
    return c.json({ error: "Unknown certificate" }, 404);
  }

  return c.json(certificate);
});

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
