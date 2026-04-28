import { Hono } from "hono";
import { jsonError, parseName, parseVersion } from "../http";
import { getApp, getVersion } from "../kv";
import { getAppObject } from "../r2";
import type { Env } from "../types";

export const downloadRoute = new Hono<{ Bindings: Env }>();

downloadRoute.get("/:name/:version", async (c) => {
  const name = parseName(c.req.param("name"));
  const version = parseVersion(c.req.param("version"));

  if (!name) {
    return jsonError(c, "Invalid package name", 400);
  }

  if (!version) {
    return jsonError(c, "Invalid package version", 400);
  }

  const app = await getApp(c.env, name);
  if (!app) {
    return jsonError(c, "Unknown package", 404);
  }

  if (app.state === "tombstoned") {
    return jsonError(c, app.tombstoneMessage, 410);
  }

  const metadata = await getVersion(c.env, name, version);
  if (!metadata) {
    return jsonError(c, "Unknown package version", 404);
  }

  const object = await getAppObject(c.env, metadata.r2Key);
  if (!object) {
    return jsonError(c, "Package file is missing", 500);
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/vnd.capsule.app",
      "etag": object.httpEtag,
    },
  });
});
