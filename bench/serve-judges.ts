import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import { buildDemoDesk } from "../desk/demo-desk.ts";
import type { ReviewEntry } from "../ledger/ledger-entry.ts";
import { readLedger } from "../ledger/ledger-file.ts";
import { RECORDED_PATH } from "./bench-cases.ts";
import { buildBenchRoutes } from "./bench-routes.ts";
import { buildCorpus } from "./build-corpus.ts";
import { loadStore } from "./load-fixture.ts";

const SettingsSchema = z.object({
  // note: render hands the port in PORT and expects 0.0.0.0
  PORT: z.coerce.number().int().default(8788),
  JUDGES_HOST: z.string().default("127.0.0.1"),
});

const settings = SettingsSchema.parse(process.env);
const store = loadStore();
const corpus = buildCorpus();
const recorded = readLedger(RECORDED_PATH).entries.filter((e): e is ReviewEntry => e.outcome === "judged" || e.outcome === "agent-error");
const app = new Hono();
// threat: this server is public, so it mounts the bench and nothing that reads or writes paypal
app.route("/", buildBenchRoutes(store));
app.get("/api/mode", (c) => c.json({ mode: "judges" }));
// note: built per request so the recorded disputes always sit around today on the board
app.get("/api/demo/desk", (c) => c.json(buildDemoDesk(corpus, recorded, store, new Date())));
app.all("/api/*", (c) => c.json({ error: "not on the judges server" }, 404));
// note: vite puts a content hash in every asset name, so they never change under a url
app.use("/assets/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=31536000, immutable");
});
app.use("/*", serveStatic({ root: "./desk/ui/dist" }));
app.get("/*", serveStatic({ path: "./desk/ui/dist/index.html" }));

serve({ fetch: app.fetch, hostname: settings.JUDGES_HOST, port: settings.PORT }, (info) => {
  console.log(`[judges] listening http://${info.address}:${info.port}`);
});
