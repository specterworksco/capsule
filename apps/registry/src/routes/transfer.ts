import { RegistryTransferRequestSchema, createRegistryTransferMessage } from "@capsule/shared";
import { Hono } from "hono";
import { verifyRegistryTransferOwnership } from "../auth";
import { jsonError, parseName } from "../http";
import { addOwnedApp, getApp, putApp, removeOwnedApp } from "../kv";
import { getCertificateRecord } from "../keyring";
import type { Env } from "../types";

export const transferRoute = new Hono<{ Bindings: Env }>();

transferRoute.post("/:name/transfer", async (c) => {
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

  const parsed = RegistryTransferRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) {
    return jsonError(c, "Invalid transfer request", 400);
  }

  if (parsed.data.certificateId !== app.certificateId) {
    return jsonError(c, "Package name owned by another publisher", 403);
  }

  if (parsed.data.certificateId === parsed.data.toCertificateId) {
    return jsonError(c, "Destination certificate must be different", 400);
  }

  const message = createRegistryTransferMessage(name, parsed.data.toCertificateId, parsed.data.issuedAt);
  const verified = await verifyRegistryTransferOwnership(c.env, name, parsed.data, message);
  if (!verified.ok) {
    return jsonError(c, verified.error, verified.status);
  }

  const destination = await getCertificateRecord(c.env, parsed.data.toCertificateId);
  const updatedAt = new Date().toISOString();
  await putApp(c.env, name, {
    ...app,
    certificateId: destination.certificateId,
    author: destination.author,
    updatedAt,
  });
  await removeOwnedApp(c.env, parsed.data.certificateId, name);
  await addOwnedApp(c.env, destination.certificateId, name);

  return c.json({
    success: true,
    name,
    certificateId: parsed.data.certificateId,
    toCertificateId: destination.certificateId,
  });
});
