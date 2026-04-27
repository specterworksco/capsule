import { RegistryAppNameSchema, RegistryVersionSchema } from "@capsule/shared";
import type { Context } from "hono";
import type { Env } from "./types";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function jsonError(c: Context<{ Bindings: Env }>, message: string, status: 400 | 403 | 404 | 409 | 413 | 500) {
  return c.json({ error: message }, status);
}

export function getBaseUrl(c: Context<{ Bindings: Env }>): string {
  const url = new URL(c.req.url);
  return url.origin;
}

export function downloadUrl(c: Context<{ Bindings: Env }>, name: string, version: string): string {
  return `${getBaseUrl(c)}/download/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
}

export function parseName(value: string | undefined): string | null {
  const parsed = RegistryAppNameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseVersion(value: string | undefined): string | null {
  const parsed = RegistryVersionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
