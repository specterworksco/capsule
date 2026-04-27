import type { Author } from "@capsule/shared";

export type Env = {
  CAPSULE_KEYRING: KVNamespace;
};

export type StoredCertificate = {
  certificateId: string;
  publicKey: string;
  author: Author;
  issuedAt: string;
};

export type StoredCapsule = {
  certificateId: string;
  author: Author;
  publicKey: string;
  publishedAt: string;
};

export async function getCertificate(env: Env, certificateId: string): Promise<StoredCertificate | null> {
  return env.CAPSULE_KEYRING.get<StoredCertificate>(`cert:${certificateId}`, "json");
}

export async function putCertificate(env: Env, certificate: StoredCertificate): Promise<void> {
  await env.CAPSULE_KEYRING.put(`cert:${certificate.certificateId}`, JSON.stringify(certificate));
}

export async function getCertificateCount(env: Env, email: string): Promise<number> {
  const count = await env.CAPSULE_KEYRING.get(`cert-count:${normalizeEmail(email)}`);
  return count ? Number.parseInt(count, 10) || 0 : 0;
}

export async function putCertificateCount(env: Env, email: string, count: number): Promise<void> {
  await env.CAPSULE_KEYRING.put(`cert-count:${normalizeEmail(email)}`, count.toString());
}

export async function getCapsule(env: Env, contentHash: string): Promise<StoredCapsule | null> {
  return env.CAPSULE_KEYRING.get<StoredCapsule>(`capsule:${contentHash}`, "json");
}

export async function putCapsule(env: Env, contentHash: string, capsule: StoredCapsule): Promise<void> {
  await env.CAPSULE_KEYRING.put(`capsule:${contentHash}`, JSON.stringify(capsule));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
