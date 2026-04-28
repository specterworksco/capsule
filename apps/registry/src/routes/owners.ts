import { Hono } from "hono";
import { jsonError } from "../http";
import { listOwnedApps } from "../kv";
import type { Env } from "../types";

export const ownersRoute = new Hono<{ Bindings: Env }>();

ownersRoute.get("/:certificateId/apps", async (c) => {
  const certificateId = c.req.param("certificateId");
  if (!isUuid(certificateId)) {
    return jsonError(c, "Invalid certificateId", 400);
  }

  const packages = await listOwnedApps(c.env, certificateId);
  packages.sort();

  return c.json({
    certificateId,
    packages,
  });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
