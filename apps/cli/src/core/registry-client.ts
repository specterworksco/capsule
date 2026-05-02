import {
  DEFAULT_REGISTRY_SERVER,
  RegistryAppInfoResponseSchema,
  RegistryOwnedPackagesResponseSchema,
  RegistryPublishResponseSchema,
  RegistryRemoveResponseSchema,
  RegistryResolveResponseSchema,
  RegistrySearchResponseSchema,
  RegistryTransferResponseSchema,
  type RegistryAppInfoResponse,
  type RegistryOwnedPackagesResponse,
  type RegistryPublishResponse,
  type RegistryRemoveRequest,
  type RegistryRemoveResponse,
  type RegistryResolveResponse,
  type RegistrySearchResponse,
  type RegistryTransferRequest,
  type RegistryTransferResponse,
} from "@capsule/shared";

export function resolveRegistryServer(value?: string): string {
  const server = value || process.env.CAPSULE_REGISTRY_SERVER || DEFAULT_REGISTRY_SERVER;

  if (!URL.canParse(server)) {
    throw new Error(`Invalid registry server URL: ${server}`);
  }

  return server.replace(/\/+$/, "");
}

export async function publishToRegistry(
  server: string,
  request: { bytes: Uint8Array; fileName: string; certificateId: string; signature: string },
): Promise<RegistryPublishResponse> {
  const form = new FormData();
  form.set("file", new Blob([request.bytes], { type: "application/vnd.capsule.app" }), request.fileName);
  form.set("certificateId", request.certificateId);
  form.set("signature", request.signature);

  const response = await fetch(`${server}/publish`, { method: "POST", body: form });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Registry publish failed: ${response.status} ${message}`);
  }

  return RegistryPublishResponseSchema.parse(await response.json());
}

export async function resolvePackage(server: string, name: string): Promise<RegistryResolveResponse> {
  const response = await fetch(`${server}/resolve/${encodeURIComponent(name)}`);
  if (response.status === 410) {
    return RegistryResolveResponseSchema.parse(await response.json());
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Registry resolve failed: ${response.status} ${message}`);
  }

  return RegistryResolveResponseSchema.parse(await response.json());
}

export async function getPackageInfo(server: string, name: string): Promise<RegistryAppInfoResponse> {
  const response = await fetch(`${server}/apps/${encodeURIComponent(name)}`);
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Registry info failed: ${response.status} ${message}`);
  }

  return RegistryAppInfoResponseSchema.parse(await response.json());
}

export async function removePackage(server: string, name: string, request: RegistryRemoveRequest): Promise<RegistryRemoveResponse> {
  const response = await fetch(`${server}/apps/${encodeURIComponent(name)}/remove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Registry remove failed: ${response.status} ${message}`);
  }

  return RegistryRemoveResponseSchema.parse(await response.json());
}

export async function transferPackage(
  server: string,
  name: string,
  request: RegistryTransferRequest,
): Promise<RegistryTransferResponse> {
  const response = await fetch(`${server}/apps/${encodeURIComponent(name)}/transfer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Registry transfer failed: ${response.status} ${message}`);
  }

  return RegistryTransferResponseSchema.parse(await response.json());
}

export async function listOwnedPackages(server: string, certificateId: string): Promise<RegistryOwnedPackagesResponse> {
  const response = await fetch(`${server}/owners/${encodeURIComponent(certificateId)}/apps`);
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Registry owner lookup failed: ${response.status} ${message}`);
  }

  return RegistryOwnedPackagesResponseSchema.parse(await response.json());
}

export async function searchPackages(server: string, query: string): Promise<RegistrySearchResponse> {
  const response = await fetch(`${server}/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Registry search failed: ${response.status} ${message}`);
  }

  return RegistrySearchResponseSchema.parse(await response.json());
}
