import { Hono } from "hono";
import { verifyWebhook, type DisputeEvent, type PayPalClient } from "../paypal/verify-webhook.ts";

export type WebhookDesk = {
  client: PayPalClient;
  webhookId: string;
  frozen: ReadonlySet<string>;
  review: (disputeId: string) => Promise<{ ok: boolean; error?: string }>;
};

// note: the only route that listens beyond this machine; approve and every write stay on 127.0.0.1
export function buildWebhookRoutes(desk: WebhookDesk): Hono {
  const seen = new Set<string>();
  let queue: Promise<void> = Promise.resolve();
  const app = new Hono();
  app.post("/webhooks/paypal", async (c) => {
    const checked = await verifyWebhook(desk.client, desk.webhookId, c.req.raw.headers, await c.req.text());
    if (!checked.ok) {
      console.log(`[webhook] reject status=${checked.status} reason=${JSON.stringify(checked.error)}`);
      return c.json({ error: checked.error }, checked.status);
    }
    const { event } = checked;
    // threat: paypal retries until it gets a 2xx, and a replayed event must not run the agent twice
    if (seen.has(event.eventId)) return c.json({ status: "duplicate" });
    seen.add(event.eventId);
    if (desk.frozen.has(event.disputeId)) {
      console.log(`[webhook] skip frozen dispute=${event.disputeId} event=${event.eventType}`);
      return c.json({ status: "frozen" });
    }
    console.log(`[webhook] queue dispute=${event.disputeId} event=${event.eventType} id=${event.eventId}`);
    // note: answered before the review runs; a model call takes longer than paypal waits
    queue = queue.then(() => runReview(desk, event));
    return c.json({ status: "queued" });
  });
  return app;
}

async function runReview(desk: WebhookDesk, event: DisputeEvent): Promise<void> {
  const reviewed = await desk.review(event.disputeId);
  console.log(`[webhook] reviewed dispute=${event.disputeId} ok=${reviewed.ok}${reviewed.error ? ` error=${JSON.stringify(reviewed.error)}` : ""}`);
}
