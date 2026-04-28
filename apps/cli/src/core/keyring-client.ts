import {
  CertificateRecordSchema,
  CertificateRevokeResponseSchema,
  CertificateResponseSchema,
  DEFAULT_KEYRING_SERVER,
  PublishResponseSchema,
  VerifyResponseSchema,
  type CertificateRecord,
  type CertificateRequest,
  type CertificateRevokeRequest,
  type CertificateRevokeResponse,
  type CertificateResponse,
  type PublishRequest,
  type PublishResponse,
  type VerifyResponse,
} from "@capsule/shared";

export function resolveKeyringServer(value?: string): string {
  const server = value || process.env.CAPSULE_KEYRING_SERVER || DEFAULT_KEYRING_SERVER;

  if (!URL.canParse(server)) {
    throw new Error(`Invalid keyring server URL: ${server}`);
  }

  return server.replace(/\/+$/, "");
}

export async function requestCertificate(server: string, request: CertificateRequest): Promise<CertificateResponse> {
  const response = await postJson(`${server}/certificates`, request);
  return CertificateResponseSchema.parse(response);
}

export async function getCertificateRecord(server: string, certificateId: string): Promise<CertificateRecord> {
  const response = await fetch(`${server}/certificates/${certificateId}`);

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Keyring certificate lookup failed: ${response.status} ${message}`);
  }

  return CertificateRecordSchema.parse(await response.json());
}

export async function revokeCertificate(
  server: string,
  certificateId: string,
  request: CertificateRevokeRequest,
): Promise<CertificateRevokeResponse> {
  const response = await postJson(`${server}/certificates/${certificateId}/revoke`, request);
  return CertificateRevokeResponseSchema.parse(response);
}

export async function publishCapsule(server: string, request: PublishRequest): Promise<PublishResponse> {
  const response = await postJson(`${server}/publish`, request);
  return PublishResponseSchema.parse(response);
}

export async function verifyCapsule(server: string, contentHash: string): Promise<VerifyResponse> {
  const response = await fetch(`${server}/verify/${contentHash}`);

  if (!response.ok) {
    throw new Error(`Keyring verification failed: ${response.status} ${response.statusText}`);
  }

  return VerifyResponseSchema.parse(await response.json());
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Keyring request failed: ${response.status} ${message}`);
  }

  return response.json();
}
