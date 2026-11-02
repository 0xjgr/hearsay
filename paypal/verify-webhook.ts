import { z } from "zod";
import type { Toolkit } from "./toolkit.ts";

export type PayPalClient = Pick<Toolkit["client"], "getHeaders" | "getBaseUrl">;

const DisputeEventSchema = z.object({
  id: z.string(),
  event_type: z.string().startsWith("CUSTOMER.DISPUTE."),
  resource: z.looseObject({ dispute_id: z.string() }),
});

export type DisputeEvent = { eventId: string; eventType: string; disputeId: string };
export type WebhookCheck = { ok: true; event: DisputeEvent } | { ok: false; status: 400 | 401 | 502; error: string };

const SIGNATURE_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

const VerifyReplySchema = z.object({ verification_status: z.enum(["SUCCESS", "FAILURE"]) });

// threat: a forged notification that makes the desk act on a dispute; only paypal's own
// verify call decides, and an event that fails it never reaches the agent
export async function verifyWebhook(client: PayPalClient, webhookId: string, headers: Headers, rawBody: string): Promise<WebhookCheck> {
  const signature: Record<string, string> = {};
  for (const [field, header] of Object.entries(SIGNATURE_HEADERS)) {
    const value = headers.get(header);
    if (value === null) return { ok: false, status: 401, error: `missing ${header}` };
    signature[field] = value;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "body is not json" };
  }
  const event = DisputeEventSchema.safeParse(parsed);
  if (!event.success) return { ok: false, status: 400, error: "not a dispute event" };

  // note: the event goes back byte for byte; re-serializing can change number formatting
  // and paypal then reports FAILURE for a genuine notification
  const body = `{${Object.entries({ ...signature, webhook_id: webhookId })
    .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
    .join(",")},"webhook_event":${rawBody}}`;
  let response: Response;
  try {
    response = await fetch(`${client.getBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: await client.getHeaders(),
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { ok: false, status: 502, error: `verify call failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) return { ok: false, status: 502, error: `verify call ${response.status}` };
  const reply = VerifyReplySchema.safeParse(await response.json());
  if (!reply.success || reply.data.verification_status !== "SUCCESS") return { ok: false, status: 401, error: "signature did not verify" };
  return { ok: true, event: { eventId: event.data.id, eventType: event.data.event_type, disputeId: event.data.resource.dispute_id } };
}
