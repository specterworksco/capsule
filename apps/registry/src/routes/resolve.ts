import { Hono } from "hono";
import { downloadUrl, jsonError, parseName, parseVersion } from "../http";
import { getApp, getVersion } from "../kv";
import type { Env } from "../types";

export const resolveRoute = new Hono<{ Bindings: Env }>();

resolveRoute.get("/:name", async (c) => {
  const name = parseName(c.req.param("name"));
  if (!name) {
    return jsonError(c, "Invalid package name", 400);
  }

  const app = await getApp(c.env, name);
  if (!app) {
    return jsonError(c, "Unknown package", 404);
  }

  const version = await getVersion(c.env, name, app.latestVersion);
  if (!version) {
    return jsonError(c, "Package metadata is incomplete", 500);
  }

  return c.json({
    name,
    version: app.latestVersion,
    downloadUrl: downloadUrl(c, name, app.latestVersion),
    author: app.author,
    hash: version.hash,
  });
});

resolveRoute.get("/:name/:version", async (c) => {
  const name = parseName(c.req.param("name"));
  const requestedVersion = parseVersion(c.req.param("version"));

  if (!name) {
    return jsonError(c, "Invalid package name", 400);
  }

  if (!requestedVersion) {
    return jsonError(c, "Invalid package version", 400);
  }

  const app = await getApp(c.env, name);
  if (!app) {
    return jsonError(c, "Unknown package", 404);
  }

  const version = await getVersion(c.env, name, requestedVersion);
  if (!version) {
    return jsonError(c, "Unknown package version", 404);
  }

  return c.json({
    name,
    version: requestedVersion,
    downloadUrl: downloadUrl(c, name, requestedVersion),
    author: app.author,
    hash: version.hash,
  });
});
