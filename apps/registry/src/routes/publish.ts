import { Hono } from "hono";
import { REGISTRY_TOMBSTONE_MESSAGE } from "@capsule/shared";
import { computeContentHash } from "../crypto";
import { downloadUrl, jsonError, MAX_UPLOAD_BYTES } from "../http";
import { verifyCapsuleHash } from "../keyring";
import { addOwnedApp, addToSearchIndex, getApp, getVersion, putApp, putVersion } from "../kv";
import { appObjectKey, putAppObject } from "../r2";
import { compareVersions } from "../semver";
import type { Env } from "../types";
import { readCapsuleContent } from "../zip";

export const publishRoute = new Hono<{ Bindings: Env }>();

publishRoute.post("/", async (c) => {
  const contentLength = Number.parseInt(c.req.header("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return jsonError(c, "Capsule upload exceeds the 10 MB limit", 413);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return jsonError(c, "Invalid multipart/form-data request", 400);
  }

  const file = form.get("file");
  const certificateId = form.get("certificateId");
  const signature = form.get("signature");

  if (!isUploadedFile(file)) {
    return jsonError(c, "Missing file", 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(c, "Capsule file exceeds the 10 MB limit", 413);
  }

  if (typeof certificateId !== "string" || !isUuid(certificateId)) {
    return jsonError(c, "Invalid certificateId", 400);
  }

  if (typeof signature !== "string" || signature.length === 0) {
    return jsonError(c, "Invalid signature", 400);
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  let content;
  try {
    content = readCapsuleContent(fileBytes);
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : "Invalid capsule archive", 400);
  }

  const hash = await computeContentHash(content.manifestBytes, content.bundleBytes);
  let keyring;
  try {
    keyring = await verifyCapsuleHash(c.env, hash);
  } catch {
    return jsonError(c, "Capsule is not signed or not registered in the keyring", 403);
  }

  if (!keyring.verified) {
    return jsonError(c, "Capsule is not signed or not registered in the keyring", 403);
  }

  if (keyring.certificateId !== certificateId) {
    return jsonError(c, "Capsule was signed by a different publisher certificate", 403);
  }

  if (keyring.revokedAt) {
    return jsonError(c, "Certificate revoked", 403);
  }

  const { name, version } = content.manifest;
  const existingApp = await getApp(c.env, name);
  if (existingApp?.state === "tombstoned") {
    return jsonError(c, existingApp.tombstoneMessage || REGISTRY_TOMBSTONE_MESSAGE, 410);
  }

  if (existingApp && existingApp.certificateId !== certificateId) {
    return jsonError(c, "Package name owned by another publisher", 403);
  }

  const existingVersion = await getVersion(c.env, name, version);
  if (existingVersion) {
    return jsonError(c, "Package version already exists", 409);
  }

  const now = new Date().toISOString();
  const r2Key = appObjectKey(name, version);
  await putAppObject(c.env, r2Key, fileBytes);
  await putVersion(c.env, name, version, { r2Key, hash, publishedAt: now });

  const latestVersion = existingApp && compareVersions(existingApp.latestVersion, version) > 0 ? existingApp.latestVersion : version;
  await putApp(c.env, name, {
    state: "active",
    latestVersion,
    certificateId,
    author: keyring.author,
    createdAt: existingApp?.createdAt ?? now,
    updatedAt: now,
  });
  await addOwnedApp(c.env, certificateId, name);
  await addToSearchIndex(c.env, {
    name,
    description: content.manifest.description,
    author: content.manifest.author,
    latestVersion,
  });

  return c.json({ success: true, name, version, downloadUrl: downloadUrl(c, name, version) });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUploadedFile(value: unknown): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "size" in value;
}
