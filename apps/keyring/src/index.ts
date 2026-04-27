import { Hono } from "hono";
import { cors } from "hono/cors";
import { certificatesRoute } from "./routes/certificates";
import { publishRoute } from "./routes/publish";
import { verifyRoute } from "./routes/verify";
import type { Env } from "./kv";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());
app.get("/", (c) => c.json({ name: "capsule-keyring", status: "ok" }));
app.route("/certificates", certificatesRoute);
app.route("/publish", publishRoute);
app.route("/verify", verifyRoute);

export default app;
