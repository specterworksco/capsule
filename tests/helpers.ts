import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCapsuleArchive } from "../apps/cli/src/core/archive";
import { computeContentHash, signContentHash } from "../apps/cli/src/core/crypto";
import keyringApp from "../apps/keyring/src/index";
import registryApp from "../apps/registry/src/index";
import type { CertificateResponse, Manifest } from "../packages/shared/src/index";

type KvEntry = {
  value: string;
};

export class MemoryKV {
  private entries = new Map<string, KvEntry>();

  async get<T = string>(key: string, type?: "json" | "text"): Promise<T | string | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }

    if (type === "json") {
      return JSON.parse(entry.value) as T;
    }

    return entry.value;
  }

  async put(key: string, value: string): Promise<void> {
    this.entries.set(key, { value });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const prefix = options?.prefix ?? "";
    return {
      keys: Array.from(this.entries.keys())
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((name) => ({ name })),
    };
  }
}

type MemoryR2Object = {
  key: string;
  bytes: Uint8Array;
  body: ReadableStream<Uint8Array>;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
};

export class MemoryR2 {
  private objects = new Map<string, { bytes: Uint8Array; httpMetadata?: { contentType?: string } }>();

  async put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void> {
    this.objects.set(key, { bytes: new Uint8Array(value), httpMetadata: options?.httpMetadata });
  }

  async get(key: string): Promise<MemoryR2Object | null> {
    const object = this.objects.get(key);
    if (!object) {
      return null;
    }

    return {
      key,
      bytes: object.bytes,
      body: new Response(object.bytes).body as ReadableStream<Uint8Array>,
      httpEtag: `"${key}"`,
      httpMetadata: object.httpMetadata,
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }
}

export type TestEnv = {
  keyringEnv: { CAPSULE_KEYRING: MemoryKV };
  registryEnv: { CAPSULE_REGISTRY: MemoryKV; CAPSULE_APPS: MemoryR2; KEYRING_SERVER: string };
  keyringUrl: string;
  registryUrl: string;
  close: () => void;
};

export function createTestEnv(): TestEnv {
  const keyringEnv = { CAPSULE_KEYRING: new MemoryKV() };
  const keyringServer = Bun.serve({
    port: 0,
    fetch: (request) => keyringApp.fetch(request, keyringEnv as never),
  });
  const keyringUrl = `http://127.0.0.1:${keyringServer.port}`;
  const registryEnv = {
    CAPSULE_REGISTRY: new MemoryKV(),
    CAPSULE_APPS: new MemoryR2(),
    KEYRING_SERVER: keyringUrl,
  };
  const registryServer = Bun.serve({
    port: 0,
    fetch: (request) => registryApp.fetch(request, registryEnv as never),
  });

  return {
    keyringEnv,
    registryEnv,
    keyringUrl,
    registryUrl: `http://127.0.0.1:${registryServer.port}`,
    close() {
      registryServer.stop(true);
      keyringServer.stop(true);
    },
  };
}

export async function requestCertificate(baseUrl: string, author = uniqueAuthor()): Promise<CertificateResponse> {
  const response = await fetch(`${baseUrl}/certificates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(author),
  });

  if (!response.ok) {
    throw new Error(`Certificate request failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function createSignedCapsule(certificate: CertificateResponse, manifest?: Partial<Manifest>) {
  const resolvedManifest: Manifest = {
    name: manifest?.name ?? `pkg-${crypto.randomUUID().slice(0, 8)}`,
    version: manifest?.version ?? "1.0.0",
    author: manifest?.author ?? `${certificate.author.name} <${certificate.author.email}>`,
    description: manifest?.description,
    entry: "bundle.js",
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(resolvedManifest, null, 2));
  const bundleBytes = new TextEncoder().encode("export default async function main() { console.log('hello from capsule') }\n");
  const contentHash = await computeContentHash(manifestBytes, bundleBytes);
  const signature = await signContentHash(contentHash, certificate.privateKey);
  const bytes = createCapsuleArchive({
    "manifest.json": manifestBytes,
    "bundle.js": bundleBytes,
    "capsule.sig": JSON.stringify(
      {
        certificateId: certificate.certificateId,
        signature,
        publicKey: certificate.publicKey,
      },
      null,
      2,
    ),
  });

  return { manifest: resolvedManifest, bytes, contentHash, signature };
}

export async function publishToKeyring(baseUrl: string, certificate: CertificateResponse, contentHash: string, signature: string) {
  const response = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ certificateId: certificate.certificateId, contentHash, signature }),
  });

  if (!response.ok) {
    throw new Error(`Keyring publish failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function publishToRegistry(baseUrl: string, certificate: CertificateResponse, capsule: { bytes: Uint8Array; signature: string; manifest: Manifest }) {
  const form = new FormData();
  form.set("file", new Blob([capsule.bytes], { type: "application/vnd.capsule.app" }), `${capsule.manifest.name}.capsule.app`);
  form.set("certificateId", certificate.certificateId);
  form.set("signature", capsule.signature);

  const response = await fetch(`${baseUrl}/publish`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`Registry publish failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function withTempHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const previousCapsuleHome = process.env.CAPSULE_HOME;
  const home = await mkdtemp(join(tmpdir(), "capsule-test-home-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CAPSULE_HOME = join(home, ".capsule");

  try {
    return await run(home);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }

    if (previousCapsuleHome === undefined) {
      delete process.env.CAPSULE_HOME;
    } else {
      process.env.CAPSULE_HOME = previousCapsuleHome;
    }

    await rm(home, { recursive: true, force: true });
  }
}

function uniqueAuthor() {
  const id = crypto.randomUUID().slice(0, 8);
  return { name: `Test ${id}`, email: `test-${id}@example.com` };
}
