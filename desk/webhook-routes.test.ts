import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWebhookRoutes } from "./webhook-routes.ts";

const CLIENT = { getBaseUrl: () => "https://api-m.sandbox.paypal.com", getHeaders: async () => ({ "Content-Type": "application/json" }) };
const SIGNED = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "c2ln",
  "paypal-transmission-time": "2026-11-02T10:00:00Z",
};
// note: 21.00 must survive as written, the verify body is checked byte for byte
const EVENT = '{"id":"WH-1","event_type":"CUSTOMER.DISPUTE.CREATED","resource":{"dispute_id":"PP-R-NEW-1","dispute_amount":{"value":21.00}}}';

function openDesk(status: "SUCCESS" | "FAILURE", frozen: string[] = []) {
  const verifyBodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      verifyBodies.push(init.body);
      return new Response(JSON.stringify({ verification_status: status }), { status: 200 });
    }),
  );
  const reviewed: string[] = [];
  const app = buildWebhookRoutes({ client: CLIENT, webhookId: "WH123", frozen: new Set(frozen), review: async (id) => (reviewed.push(id), { ok: true }) });
  const post = (headers: Record<string, string>, body = EVENT) => app.request("/webhooks/paypal", { method: "POST", headers, body });
  return { post, reviewed, verifyBodies };
}

afterEach(() => vi.unstubAllGlobals());

describe("webhook route", () => {
  it("refuses a notification without paypal's signature headers", async () => {
    const { post, reviewed, verifyBodies } = openDesk("SUCCESS");
    expect((await post({})).status).toBe(401);
    expect(verifyBodies).toEqual([]);
    expect(reviewed).toEqual([]);
  });

  it("refuses a notification paypal does not verify", async () => {
    const { post, reviewed } = openDesk("FAILURE");
    expect((await post(SIGNED)).status).toBe(401);
    await Promise.resolve();
    expect(reviewed).toEqual([]);
  });

  it("sends the event back to paypal exactly as it arrived", async () => {
    const { post, verifyBodies } = openDesk("SUCCESS");
    await post(SIGNED);
    expect(verifyBodies[0]).toContain(`"webhook_id":"WH123","webhook_event":${EVENT}}`);
    expect(JSON.parse(verifyBodies[0]!).transmission_id).toBe("tx-1");
  });

  it("queues one review per event and ignores the retry", async () => {
    const { post, reviewed } = openDesk("SUCCESS");
    expect(await (await post(SIGNED)).json()).toEqual({ status: "queued" });
    expect(await (await post(SIGNED)).json()).toEqual({ status: "duplicate" });
    await vi.waitFor(() => expect(reviewed).toEqual(["PP-R-NEW-1"]));
  });

  it("never reviews a frozen dispute", async () => {
    const { post, reviewed } = openDesk("SUCCESS", ["PP-R-NEW-1"]);
    expect(await (await post(SIGNED)).json()).toEqual({ status: "frozen" });
    expect(reviewed).toEqual([]);
  });

  it("ignores events that are not about disputes", async () => {
    const { post } = openDesk("SUCCESS");
    const res = await post(SIGNED, '{"id":"WH-2","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"X"}}');
    expect(res.status).toBe(400);
  });
});
