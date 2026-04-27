import { Hono } from "hono";
import { cors } from "hono/cors";
import { appsRoute } from "./routes/apps";
import { downloadRoute } from "./routes/download";
import { publishRoute } from "./routes/publish";
import { resolveRoute } from "./routes/resolve";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());
app.get("/", (c) => c.json({ name: "capsule-registry", status: "ok" }));
app.route("/publish", publishRoute);
app.route("/resolve", resolveRoute);
app.route("/download", downloadRoute);
app.route("/apps", appsRoute);

export default app;
