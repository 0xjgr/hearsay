import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import { buildBenchRoutes } from "./bench-routes.ts";
import { loadStore } from "./load-fixture.ts";

const SettingsSchema = z.object({
  // note: render hands the port in PORT and expects 0.0.0.0
  PORT: z.coerce.number().int().default(8788),
  JUDGES_HOST: z.string().default("127.0.0.1"),
});

const settings = SettingsSchema.parse(process.env);
const app = new Hono();
// threat: this server is public, so it mounts the bench and nothing that reads or writes paypal
app.route("/", buildBenchRoutes(loadStore()));
app.get("/api/mode", (c) => c.json({ mode: "judges" }));
app.all("/api/*", (c) => c.json({ error: "not on the judges server" }, 404));
app.use("/*", serveStatic({ root: "./desk/ui/dist" }));
app.get("/*", serveStatic({ path: "./desk/ui/dist/index.html" }));

serve({ fetch: app.fetch, hostname: settings.JUDGES_HOST, port: settings.PORT }, (info) => {
  console.log(`[judges] listening http://${info.address}:${info.port}`);
});
