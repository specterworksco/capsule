import { Hono } from "hono";
import { jsonError, parseName } from "../http";
import { getApp, listVersions } from "../kv";
import type { Env } from "../types";

export const appsRoute = new Hono<{ Bindings: Env }>();

appsRoute.get("/:name", async (c) => {
  const name = parseName(c.req.param("name"));
  if (!name) {
    return jsonError(c, "Invalid package name", 400);
  }

  const app = await getApp(c.env, name);
  if (!app) {
    return jsonError(c, "Unknown package", 404);
  }

  const versions = await listVersions(c.env, name);
  versions.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return c.json({
    name,
    author: app.author,
    latestVersion: app.latestVersion,
    versions,
  });
});
