import { REGISTRY_ACTION_MAX_SKEW_MS, type RegistryRemoveRequest, type RegistryTransferRequest } from "@capsule/shared";
import { verifySignedMessage } from "./crypto";
import { getCertificateRecord } from "./keyring";
import type { Env } from "./types";

export async function verifyRegistryRemoveOwnership(
  env: Env,
  name: string,
  request: RegistryRemoveRequest,
  message: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string }> {
  return verifyOwnershipMutation(env, name, request.certificateId, request.issuedAt, request.signature, message);
}

export async function verifyRegistryTransferOwnership(
  env: Env,
  name: string,
  request: RegistryTransferRequest,
  message: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string }> {
  const ownerCheck = await verifyOwnershipMutation(env, name, request.certificateId, request.issuedAt, request.signature, message);
  if (!ownerCheck.ok) {
    return ownerCheck;
  }

  try {
    const destination = await getCertificateRecord(env, request.toCertificateId);
    if (destination.revokedAt) {
      return { ok: false, status: 409, error: "Destination certificate is revoked" };
    }
  } catch {
    return { ok: false, status: 404, error: "Unknown destination certificate" };
  }

  return { ok: true };
}

async function verifyOwnershipMutation(
  env: Env,
  name: string,
  certificateId: string,
  issuedAt: string,
  signature: string,
  message: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string }> {
  if (!isFreshTimestamp(issuedAt, REGISTRY_ACTION_MAX_SKEW_MS)) {
    return { ok: false, status: 400, error: "Request timestamp expired" };
  }

  try {
    const certificate = await getCertificateRecord(env, certificateId);
    if (certificate.revokedAt) {
      return { ok: false, status: 409, error: "Certificate revoked" };
    }

    const valid = await verifySignedMessage(message, signature, certificate.publicKey);
    if (!valid) {
      return { ok: false, status: 403, error: `Invalid signature for package ${name}` };
    }
  } catch {
    return { ok: false, status: 404, error: "Unknown certificate" };
  }

  return { ok: true };
}

function isFreshTimestamp(value: string, maxSkewMs: number): boolean {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return false;
  }

  return Math.abs(Date.now() - time) <= maxSkewMs;
}
