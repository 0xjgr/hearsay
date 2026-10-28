import { serve } from "@hono/node-server";
import { z } from "zod";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { loadStore } from "../bench/load-fixture.ts";
import { locateLedger } from "../ledger/ledger-file.ts";
import { openToolkit } from "../paypal/toolkit.ts";
import { buildDeskRoutes } from "./desk-routes.ts";
import { pollDisputes } from "./poll-disputes.ts";
import type { Desk } from "./review-dispute.ts";

const SettingsSchema = z.object({
  DESK_PORT: z.coerce.number().int().default(8787),
  // threat: the approve route moves money; nothing outside this machine reaches it
  DESK_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  DESK_SEND: z.enum(["0", "1"]).default("0"),
  DESK_POLL_SECONDS: z.coerce.number().int().min(0).default(0),
  DESK_FROZEN: z.string().default(""),
});

const settings = SettingsSchema.parse(process.env);
const desk: Desk = {
  toolkit: openToolkit(process.env),
  store: loadStore(),
  endpoint: readModelEndpoint(process.env),
  ledgerPath: locateLedger("live"),
  send: settings.DESK_SEND === "1",
  frozen: new Set(settings.DESK_FROZEN.split(",").map((id) => id.trim()).filter((id) => id !== "")),
};

serve({ fetch: buildDeskRoutes(desk).fetch, hostname: settings.DESK_HOST, port: settings.DESK_PORT }, (info) => {
  console.log(`[desk] listening http://${info.address}:${info.port} send=${desk.send} frozen=${[...desk.frozen].join(",") || 0} poll=${settings.DESK_POLL_SECONDS}s`);
});
if (settings.DESK_POLL_SECONDS > 0) pollDisputes(desk, settings.DESK_POLL_SECONDS);
