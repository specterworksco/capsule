import {
  DEFAULT_REGISTRY_SERVER,
  RegistryAppInfoResponseSchema,
  RegistryPublishResponseSchema,
  RegistryResolveResponseSchema,
  type RegistryAppInfoResponse,
  type RegistryPublishResponse,
  type RegistryResolveResponse,
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
