import { serve } from "@hono/node-server";
import { z } from "zod";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { loadStore } from "../bench/load-fixture.ts";
import { locateLedger } from "../ledger/ledger-file.ts";
import { openToolkit } from "../paypal/toolkit.ts";
import { buildDeskRoutes } from "./desk-routes.ts";
import { pollDisputes } from "./poll-disputes.ts";
import { reviewDispute, type Desk } from "./review-dispute.ts";
import { buildWebhookRoutes } from "./webhook-routes.ts";

const SettingsSchema = z.object({
  DESK_PORT: z.coerce.number().int().default(8787),
  // threat: the approve route moves money; nothing outside this machine reaches it
  DESK_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  DESK_SEND: z.enum(["0", "1"]).default("0"),
  DESK_POLL_SECONDS: z.coerce.number().int().min(0).default(0),
  DESK_FROZEN: z.string().default(""),
  // note: both or neither; the id is the one the developer dashboard shows for this url
  DESK_WEBHOOK_PORT: z.coerce.number().int().optional(),
  PAYPAL_WEBHOOK_ID: z.string().regex(/^[A-Za-z0-9]+$/).optional(),
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

if (settings.DESK_WEBHOOK_PORT !== undefined && settings.PAYPAL_WEBHOOK_ID !== undefined) {
  const webhooks = buildWebhookRoutes({
    client: desk.toolkit.client,
    webhookId: settings.PAYPAL_WEBHOOK_ID,
    frozen: desk.frozen,
    review: (disputeId) => reviewDispute(desk, { disputeId, warnModel: false }),
  });
  // threat: this listener is public, so it serves the signed webhook route and nothing else
  serve({ fetch: webhooks.fetch, hostname: "0.0.0.0", port: settings.DESK_WEBHOOK_PORT }, (info) => {
    console.log(`[webhook] listening http://${info.address}:${info.port}/webhooks/paypal webhook_id=${settings.PAYPAL_WEBHOOK_ID}`);
  });
}
