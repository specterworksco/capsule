import { REGISTRY_TOMBSTONE_MESSAGE, RegistryRemoveRequestSchema, createRegistryRemoveMessage } from "@capsule/shared";
import { Hono } from "hono";
import { verifyRegistryRemoveOwnership } from "../auth";
import { jsonError, parseName } from "../http";
import { deleteVersion, getApp, listVersionRecords, putApp, removeOwnedApp } from "../kv";
import { deleteAppObject } from "../r2";
import type { Env } from "../types";

export const removeRoute = new Hono<{ Bindings: Env }>();

removeRoute.post("/:name", async (c) => {
  const name = parseName(c.req.param("name"));
  if (!name) {
    return jsonError(c, "Invalid package name", 400);
  }

  const app = await getApp(c.env, name);
  if (!app) {
    return jsonError(c, "Unknown package", 404);
  }

  if (app.state === "tombstoned") {
    return jsonError(c, app.tombstoneMessage, 410);
  }

  const parsed = RegistryRemoveRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) {
    return jsonError(c, "Invalid remove request", 400);
  }

  if (parsed.data.certificateId !== app.certificateId) {
    return jsonError(c, "Package name owned by another publisher", 403);
  }

  const message = createRegistryRemoveMessage(name, parsed.data.issuedAt);
  const verified = await verifyRegistryRemoveOwnership(c.env, name, parsed.data, message);
  if (!verified.ok) {
    return jsonError(c, verified.error, verified.status);
  }

  const versions = await listVersionRecords(c.env, name);
  await Promise.all(
    versions.map(async (version) => {
      await deleteAppObject(c.env, version.r2Key);
      await deleteVersion(c.env, name, version.version);
    }),
  );

  const tombstonedAt = new Date().toISOString();
  await putApp(c.env, name, {
    state: "tombstoned",
    certificateId: app.certificateId,
    author: app.author,
    createdAt: app.createdAt,
    updatedAt: tombstonedAt,
    tombstonedAt,
    tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE,
  });
  await removeOwnedApp(c.env, app.certificateId, name);

  return c.json({
    success: true,
    name,
    tombstonedAt,
    tombstoneMessage: REGISTRY_TOMBSTONE_MESSAGE,
  });
});
