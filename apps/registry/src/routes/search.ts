import { Hono } from "hono";
import { RegistrySearchIndexEntrySchema, type RegistrySearchResponse } from "@capsule/shared";
import { getSearchIndex, putSearchIndex } from "../kv";
import type { Env } from "../types";

export const searchRoute = new Hono<{ Bindings: Env }>();

searchRoute.get("/", async (c) => {
  const query = (c.req.query("q") ?? "").trim().toLowerCase();

  const indexRaw = await getSearchIndex(c.env);
  if (!indexRaw) {
    return c.json<RegistrySearchResponse>({ query, results: [] });
  }

  const parsed = RegistrySearchIndexEntrySchema.array().safeParse(indexRaw);
  if (!parsed.success) {
    return c.json<RegistrySearchResponse>({ query, results: [] });
  }

  const allApps = parsed.data;

  let results = allApps;
  if (query) {
    results = allApps.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        (app.description ?? "").toLowerCase().includes(query) ||
        (app.author ?? "").toLowerCase().includes(query),
    );
  }

  // Sort by name for consistent output
  results.sort((a, b) => a.name.localeCompare(b.name));

  return c.json<RegistrySearchResponse>({
    query,
    results: results.slice(0, 50), // Limit to 50 results
  });
});
