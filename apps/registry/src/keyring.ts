import { CertificateRecordSchema, VerifyResponseSchema, type CertificateRecord, type VerifyResponse } from "@capsule/shared";
import type { Env } from "./types";

function getKeyringServer(env: Env): string {
  return (env.KEYRING_SERVER || "https://keyring.usecapsule.net").replace(/\/+$/, "");
}

export async function verifyCapsuleHash(env: Env, hash: string): Promise<VerifyResponse> {
  const server = getKeyringServer(env);
  const response = await fetch(`${server}/verify/${hash}`);

  if (!response.ok) {
    throw new Error(`Keyring verification failed: ${response.status}`);
  }

  return VerifyResponseSchema.parse(await response.json());
}

export async function getCertificateRecord(env: Env, certificateId: string): Promise<CertificateRecord> {
  const server = getKeyringServer(env);
  const response = await fetch(`${server}/certificates/${certificateId}`);

  if (!response.ok) {
    throw new Error(`Keyring certificate lookup failed: ${response.status}`);
  }

  return CertificateRecordSchema.parse(await response.json());
}
