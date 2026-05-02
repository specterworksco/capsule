import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { REGISTRY_TOMBSTONE_MESSAGE, createRegistryRemoveMessage, createRegistryTransferMessage, type RegistrySearchResponse } from "../packages/shared/src/registry";
import { signMessage } from "../apps/cli/src/core/crypto";
import {
  createSignedCapsule,
  createTestEnv,
  publishToKeyring,
  publishToRegistry,
  requestCertificate,
  type TestEnv,
} from "./helpers";

describe("registry server", () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    env.close();
  });

  test("publishes, resolves, downloads, and reports package metadata", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "hello-registry", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);

    const published = await publishToRegistry(env.registryUrl, certificate, capsule);
    expect(published).toMatchObject({ success: true, name: "hello-registry", version: "1.0.0" });

    const resolved = await (await fetch(`${env.registryUrl}/resolve/hello-registry`)).json();
    expect(resolved).toMatchObject({
      state: "active",
      name: "hello-registry",
      version: "1.0.0",
      certificateId: certificate.certificateId,
      hash: capsule.contentHash,
    });

    const download = await fetch(resolved.downloadUrl);
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(capsule.bytes);

    const info = await (await fetch(`${env.registryUrl}/apps/hello-registry`)).json();
    expect(info).toMatchObject({
      state: "active",
      name: "hello-registry",
      latestVersion: "1.0.0",
      certificateId: certificate.certificateId,
    });
    expect(info.versions).toHaveLength(1);

    const owned = await (await fetch(`${env.registryUrl}/owners/${certificate.certificateId}/apps`)).json();
    expect(owned.packages).toEqual(["hello-registry"]);
  });

  test("rejects publishes from non-owner certificates", async () => {
    const owner = await requestCertificate(env.keyringUrl);
    const other = await requestCertificate(env.keyringUrl);
    const first = await createSignedCapsule(owner, { name: "owned-app", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, owner, first.contentHash, first.signature);
    await publishToRegistry(env.registryUrl, owner, first);

    const second = await createSignedCapsule(other, { name: "owned-app", version: "1.1.0" });
    await publishToKeyring(env.keyringUrl, other, second.contentHash, second.signature);
    const form = new FormData();
    form.set("file", new Blob([second.bytes]), "owned-app.capsule.app");
    form.set("certificateId", other.certificateId);
    form.set("signature", second.signature);

    const response = await fetch(`${env.registryUrl}/publish`, { method: "POST", body: form });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Package name owned by another publisher" });
  });

  test("transfers package ownership to another active certificate", async () => {
    const owner = await requestCertificate(env.keyringUrl);
    const destination = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(owner, { name: "transfer-me", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, owner, capsule.contentHash, capsule.signature);
    await publishToRegistry(env.registryUrl, owner, capsule);

    const issuedAt = new Date().toISOString();
    const signature = await signMessage(createRegistryTransferMessage("transfer-me", destination.certificateId, issuedAt), owner.privateKey);
    const response = await fetch(`${env.registryUrl}/apps/transfer-me/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificateId: owner.certificateId,
        toCertificateId: destination.certificateId,
        issuedAt,
        signature,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, name: "transfer-me", toCertificateId: destination.certificateId });

    const info = await (await fetch(`${env.registryUrl}/apps/transfer-me`)).json();
    expect(info.certificateId).toBe(destination.certificateId);
    expect(info.author).toEqual(destination.author);

    const oldOwner = await (await fetch(`${env.registryUrl}/owners/${owner.certificateId}/apps`)).json();
    const newOwner = await (await fetch(`${env.registryUrl}/owners/${destination.certificateId}/apps`)).json();
    expect(oldOwner.packages).toEqual([]);
    expect(newOwner.packages).toEqual(["transfer-me"]);
  });

  test("maintains search index and serves search results", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const appA = await createSignedCapsule(certificate, { name: "search-alpha", version: "1.0.0", description: "Alpha app", author: certificate.author.name });
    const appB = await createSignedCapsule(certificate, { name: "search-beta", version: "1.0.0", description: "Beta app", author: certificate.author.name });
    await publishToKeyring(env.keyringUrl, certificate, appA.contentHash, appA.signature);
    await publishToKeyring(env.keyringUrl, certificate, appB.contentHash, appB.signature);
    await publishToRegistry(env.registryUrl, certificate, appA);
    await publishToRegistry(env.registryUrl, certificate, appB);

    // Empty query returns both
    const allRes = await (await fetch(`${env.registryUrl}/search`)).json() as RegistrySearchResponse;
    expect(allRes.results).toHaveLength(2);
    expect(allRes.results.map((r) => r.name).sort()).toEqual(["search-alpha", "search-beta"]);

    // Search by name
    const nameRes = await (await fetch(`${env.registryUrl}/search?q=alpha`)).json() as RegistrySearchResponse;
    expect(nameRes.results).toHaveLength(1);
    expect(nameRes.results[0].name).toBe("search-alpha");
    expect(nameRes.results[0].description).toBe("Alpha app");

    // Search by description
    const descRes = await (await fetch(`${env.registryUrl}/search?q=Beta`)).json() as RegistrySearchResponse;
    expect(descRes.results).toHaveLength(1);
    expect(descRes.results[0].name).toBe("search-beta");

    // No matches
    const noRes = await (await fetch(`${env.registryUrl}/search?q=notfound`)).json() as RegistrySearchResponse;
    expect(noRes.results).toHaveLength(0);

    // After tombstone, search index is purged
    const issuedAt = new Date().toISOString();
    const signature = await signMessage(createRegistryRemoveMessage("search-alpha", issuedAt), certificate.privateKey);
    await fetch(`${env.registryUrl}/apps/search-alpha/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificateId: certificate.certificateId, issuedAt, signature }),
    });

    const afterRemove = await (await fetch(`${env.registryUrl}/search`)).json() as RegistrySearchResponse;
    expect(afterRemove.results).toHaveLength(1);
    expect(afterRemove.results[0].name).toBe("search-beta");
  });

  test("tombstones packages, deletes R2 files, and blocks future downloads", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "remove-me", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);
    await publishToRegistry(env.registryUrl, certificate, capsule);
    expect(env.registryEnv.CAPSULE_APPS.has("apps/remove-me/1.0.0.capsule.app")).toBe(true);

    const issuedAt = new Date().toISOString();
    const signature = await signMessage(createRegistryRemoveMessage("remove-me", issuedAt), certificate.privateKey);
    const response = await fetch(`${env.registryUrl}/apps/remove-me/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificateId: certificate.certificateId, issuedAt, signature }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, name: "remove-me", tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE });
    expect(env.registryEnv.CAPSULE_APPS.has("apps/remove-me/1.0.0.capsule.app")).toBe(false);

    const resolve = await fetch(`${env.registryUrl}/resolve/remove-me`);
    expect(resolve.status).toBe(410);
    expect(await resolve.json()).toMatchObject({ state: "tombstoned", tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE });

    const download = await fetch(`${env.registryUrl}/download/remove-me/1.0.0`);
    expect(download.status).toBe(410);
    expect(await download.json()).toEqual({ error: REGISTRY_TOMBSTONE_MESSAGE });

    const info = await (await fetch(`${env.registryUrl}/apps/remove-me`)).json();
    expect(info).toMatchObject({ state: "tombstoned", name: "remove-me", tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE });

    const replacement = await createSignedCapsule(certificate, { name: "remove-me", version: "2.0.0" });
    await publishToKeyring(env.keyringUrl, certificate, replacement.contentHash, replacement.signature);
    const form = new FormData();
    form.set("file", new Blob([replacement.bytes]), "remove-me.capsule.app");
    form.set("certificateId", certificate.certificateId);
    form.set("signature", replacement.signature);
    const republish = await fetch(`${env.registryUrl}/publish`, { method: "POST", body: form });
    expect(republish.status).toBe(410);
    expect(await republish.json()).toEqual({ error: REGISTRY_TOMBSTONE_MESSAGE });
  });
});
