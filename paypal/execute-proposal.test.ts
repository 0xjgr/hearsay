import { describe, expect, it, vi } from "vitest";
import { loadDispute, loadStore, type FixtureName } from "../bench/load-fixture.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import { executeProposal } from "./execute-proposal.ts";
import type { Toolkit } from "./toolkit.ts";

const store = loadStore();
const FAKE_TOOLKIT = {
  client: { getHeaders: async () => ({ "Content-Type": "application/json" }), getBaseUrl: () => "https://api-m.sandbox.paypal.com" },
} as unknown as Toolkit;
const CAP = "paypal:refund_details.allowed_refund_amount.value";

function runDry(name: FixtureName, proposal: Proposal, grants = new GrantBook()) {
  const dispute = loadDispute(name);
  const { docket } = buildDocket(dispute, store);
  const verdict = judgeProposal(proposal, { docket, store });
  return executeProposal({ proposal, verdict, docket, freshDispute: dispute, grants, send: "dry-run" });
}

const defend: Proposal = {
  kind: "provide_evidence",
  trackingNumber: { value: "9400111200000000001054", cite: "merchant:order.tracking" },
  carrier: { value: "USPS", cite: "merchant:order.carrier" },
  because: [{ value: "DELIVERED", cite: "merchant:order.status" }],
};

const acceptInjected: Proposal = {
  kind: "accept_claim",
  amount: { value: "24.00", cite: CAP },
  because: [{ value: "full refund without return", cite: "merchant:policy" }],
};

describe("executeProposal", () => {
  it("builds proof of fulfillment as a multipart input", async () => {
    const execution = await runDry("dispute-inr-item-name-injected.json", defend);
    expect(execution).toEqual({
      kind: "dry-run",
      request: {
        kind: "provide_evidence",
        path: "provide-evidence",
        body: {
          type: "multipart-input",
          input: {
            evidences: [
              {
                evidence_type: "PROOF_OF_FULFILLMENT",
                evidence_info: { tracking_info: [{ carrier_name: "USPS", tracking_number: "9400111200000000001054" }] },
                notes: "Order delivered; tracking attached.",
              },
            ],
          },
        },
      },
    });
  });

  it("refuses an ask without the owner's grant", async () => {
    expect(await runDry("dispute-inr-item-name-injected.json", acceptInjected)).toEqual({ kind: "refused", reason: "needs the owner's grant" });
  });

  it("keeps the grant open through a dry run", async () => {
    const grants = new GrantBook();
    grants.grant("PP-R-PPO-10194554", acceptInjected);
    expect((await runDry("dispute-inr-item-name-injected.json", acceptInjected, grants)).kind).toBe("dry-run");
    expect((await runDry("dispute-inr-item-name-injected.json", acceptInjected, grants)).kind).toBe("dry-run");
  });

  it("spends a grant on the first real send", async () => {
    const posted = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", posted);
    const grants = new GrantBook();
    grants.grant("PP-R-PPO-10194554", acceptInjected);
    const send = async () => {
      const dispute = loadDispute("dispute-inr-item-name-injected.json");
      const { docket } = buildDocket(dispute, store);
      const verdict = judgeProposal(acceptInjected, { docket, store });
      return executeProposal({ proposal: acceptInjected, verdict, docket, freshDispute: dispute, grants, send: { toolkit: FAKE_TOOLKIT } });
    };
    expect((await send()).kind).toBe("sent");
    expect((await send()).kind).toBe("refused");
    expect(posted).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("does not let a grant cover a different amount", async () => {
    const grants = new GrantBook();
    grants.grant("PP-R-PPO-10194554", { ...acceptInjected, amount: { value: "12.00", cite: CAP } });
    expect((await runDry("dispute-inr-item-name-injected.json", acceptInjected, grants)).kind).toBe("refused");
  });

  it("never sends a denied proposal, grant or not", async () => {
    const leak: Proposal = { ...defend, trackingNumber: { value: "1Z999AA10123456784", cite: "merchant:order.tracking" } };
    const grants = new GrantBook();
    grants.grant("PP-R-PPO-10194554", leak);
    const execution = await runDry("dispute-inr-item-name-injected.json", leak, grants);
    expect(execution.kind).toBe("refused");
  });

  it("refuses when paypal offers no link for the action", async () => {
    const snadDefend: Proposal = { ...defend, trackingNumber: { value: "9400111200000000001052", cite: "merchant:order.tracking" } };
    expect(await runDry("dispute-snad-legit.json", snadDefend)).toEqual({
      kind: "refused",
      reason: "paypal offers no provide_evidence link on PP-R-BJT-10194552 now",
    });
  });

  it("builds a full refund, and nothing for an uncited partial one", async () => {
    const partial: Proposal = {
      kind: "accept_claim",
      amount: { value: "11.00", cite: "merchant:order.amount" },
      because: [{ value: "full refund without return", cite: "merchant:policy" }],
    };
    const execution = await runDry("dispute-snad-legit.json", partial);
    // note: 11.00 is not in merchant:order.amount, so policy denies before any request is built
    expect(execution.kind).toBe("refused");
    const full = await runDry("dispute-snad-legit.json", { ...partial, amount: { value: "22.00", cite: CAP } });
    expect(full.kind === "dry-run" && full.request.body).toEqual({
      type: "json",
      json: { note: "Resolved by the store under its dispute policy.", accept_claim_type: "REFUND", refund_amount: { currency_code: "USD", value: "22.00" } },
    });
  });
});
