import { Hono } from "hono";
import { cors } from "hono/cors";
import { appsRoute } from "./routes/apps";
import { downloadRoute } from "./routes/download";
import { ownersRoute } from "./routes/owners";
import { publishRoute } from "./routes/publish";
import { removeRoute } from "./routes/remove";
import { resolveRoute } from "./routes/resolve";
import { transferRoute } from "./routes/transfer";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());
app.get("/", (c) => c.json({ name: "capsule-registry", status: "ok" }));
app.route("/publish", publishRoute);
app.route("/resolve", resolveRoute);
app.route("/download", downloadRoute);
app.route("/apps", appsRoute);
app.route("/apps", removeRoute);
app.route("/apps", transferRoute);
app.route("/owners", ownersRoute);

export default app;
