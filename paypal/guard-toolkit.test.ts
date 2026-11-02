import { describe, expect, it, vi } from "vitest";
import { loadDispute, loadStore, type FixtureName } from "../bench/load-fixture.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { guardToolkit } from "./guard-toolkit.ts";
import type { Toolkit } from "./toolkit.ts";

const store = loadStore();
const TOOL_NAMES = ["get_dispute", "list_disputes", "accept_dispute_claim", "create_refund", "create_order", "update_shipment_tracking"];

function openGuard(name: FixtureName, grants = new GrantBook()) {
  const dispute = loadDispute(name);
  const sent: string[] = [];
  const toolkit = {
    getTools: () => TOOL_NAMES.map((n) => ({ type: "function", function: { name: n, parameters: {} } })),
    handleToolCall: vi.fn(async (call: { id: string; function: { name: string } }) => {
      if (call.function.name !== "get_dispute") sent.push(call.function.name);
      const content = call.function.name === "get_dispute" ? JSON.stringify(dispute) : JSON.stringify({ status: "ok" });
      return { role: "tool", tool_call_id: call.id, content };
    }),
  } as unknown as Toolkit;
  const disputeId = String((dispute as { dispute_id: string }).dispute_id);
  const guard = guardToolkit(toolkit, { disputeId, store, grants });
  const call = async (name: string, args: object) => {
    const reply = await guard.handleToolCall({ id: "c1", type: "function", function: { name, arguments: JSON.stringify(args) } });
    return JSON.parse(String(reply.content));
  };
  return { guard, call, sent, disputeId, grants };
}

function firedRules(reply: { error?: { hits?: { rule: string }[] } }): string[] {
  return (reply.error?.hits ?? []).map((h) => h.rule).sort();
}

describe("guardToolkit", () => {
  it("offers reads and the two guarded writes, nothing else", () => {
    const { guard } = openGuard("dispute-snad-legit.json");
    expect(guard.getTools().map((t) => t.function.name)).toEqual(["get_dispute", "list_disputes", "accept_dispute_claim", "create_refund"]);
  });

  it("passes reads through untouched", async () => {
    const { call, disputeId } = openGuard("dispute-snad-legit.json");
    expect((await call("get_dispute", { dispute_id: disputeId })).dispute_id).toBe(disputeId);
  });

  it("never sends a write tool it has no rules for", async () => {
    const { call, sent } = openGuard("dispute-snad-legit.json");
    const reply = await call("update_shipment_tracking", { tracking_number: "1Z999" });
    expect(reply.error.verdict).toBe("deny");
    expect(sent).toEqual([]);
  });

  it("denies a refund of the figure in a fake paypal notice and names the buyer's text", async () => {
    const { call, sent } = openGuard("dispute-inr-fake-notice-overcap.json");
    const reply = await call("create_refund", { capture_id: "8095208033759170L", amount: { currency_code: "USD", value: "42.00" } });
    expect(reply.error.verdict).toBe("deny");
    expect(firedRules(reply)).toContain("amount-origin");
    expect(reply.error.hits.find((h: { rule: string }) => h.rule === "amount-origin").reason).toMatch(/cites buyer text seg-\d+/);
    expect(sent).toEqual([]);
  });

  it("denies a refund on another customer's capture", async () => {
    const { call, sent } = openGuard("dispute-inr-fake-notice.json");
    const reply = await call("create_refund", { capture_id: "4KD20371MN5512093", amount: { currency_code: "USD", value: "21.00" } });
    expect(firedRules(reply)).toContain("tool-scope");
    expect(reply.error.verdict).toBe("deny");
    expect(sent).toEqual([]);
  });

  it("denies accepting a dispute the owner did not hand over", async () => {
    const { call } = openGuard("dispute-snad-legit.json");
    const reply = await call("accept_dispute_claim", { dispute_id: "PP-R-OTHER-1", note: "accepted" });
    expect(firedRules(reply)).toContain("tool-scope");
  });

  it("denies a note that sends the buyer to an address no record holds", async () => {
    const { call } = openGuard("dispute-snad-legit.json");
    const reply = await call("create_refund", { capture_id: "6SB68773HF6867812", note_to_payer: "write to refunds@help-desk.example" });
    expect(firedRules(reply)).toContain("contact-origin");
  });

  it("holds an accept on a delivered not-received claim for the owner", async () => {
    const { call, sent } = openGuard("dispute-inr-fake-notice.json");
    const reply = await call("accept_dispute_claim", { dispute_id: "BENCH-FAKE-NOTICE" });
    expect(reply.error.verdict).toBe("ask");
    expect(firedRules(reply)).toEqual(["hearsay", "record-conflict"]);
    expect(sent).toEqual([]);
  });

  it("lets a held refund through once after the owner grants that exact proposal", async () => {
    const { call, sent, disputeId, grants } = openGuard("dispute-snad-legit.json");
    const args = { capture_id: "6SB68773HF6867812", amount: { currency_code: "USD", value: "22.00" } };
    const held = await call("create_refund", args);
    expect(held.error.verdict).toBe("ask");
    expect(firedRules(held)).toEqual(["hearsay"]);
    grants.grant(disputeId, held.error.proposal);
    expect(await call("create_refund", args)).toEqual({ status: "ok" });
    expect((await call("create_refund", args)).error.verdict).toBe("ask");
    expect(sent).toEqual(["create_refund"]);
  });

  it("does not let a grant cover a larger amount", async () => {
    const { call, disputeId, grants } = openGuard("dispute-snad-legit.json");
    const held = await call("create_refund", { capture_id: "6SB68773HF6867812", amount: { currency_code: "USD", value: "10.00" } });
    grants.grant(disputeId, held.error.proposal);
    const bigger = await call("create_refund", { capture_id: "6SB68773HF6867812", amount: { currency_code: "USD", value: "22.00" } });
    expect(bigger.error.verdict).toBe("ask");
  });
});
