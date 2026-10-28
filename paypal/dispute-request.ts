import { findSource, type Docket } from "../provenance/author.ts";
import { parseCents } from "../policy/amount.ts";
import type { Proposal } from "../policy/proposal.ts";

export type WriteKind = Exclude<Proposal["kind"], "hold" | "send_invoice">;

export type DisputeRequest = {
  kind: WriteKind;
  path: string;
  body: { type: "json"; json: object } | { type: "multipart-input"; input: object };
};

export type BuiltRequest = { ok: true; request: DisputeRequest } | { ok: false; error: string };

const ALLOWED_REFUND = "paypal:refund_details.allowed_refund_amount.value";

// threat: notes we send are fixed text, so no buyer words leave in our name
const NOTE = "Resolved by the store under its dispute policy.";

// note: field names from the v1 reference examples; the current openapi file only
// lists the file parts. verified in sandbox: provide-evidence with an input part,
// send-message with a json body
export function buildRequest(proposal: Proposal, docket: Docket): BuiltRequest {
  const currency = findSource(docket, "paypal:dispute_amount.currency_code");
  if (currency === undefined) return { ok: false, error: "dispute has no currency" };
  const money = (value: string) => ({ currency_code: currency, value });
  switch (proposal.kind) {
    case "accept_claim": {
      const allowed = parseCents(findSource(docket, ALLOWED_REFUND) ?? "");
      const cents = parseCents(proposal.amount.value);
      if (allowed === undefined || cents === undefined) return { ok: false, error: "amount or refund cap is malformed" };
      const isPartial = cents < allowed;
      const json = {
        note: NOTE,
        accept_claim_type: isPartial ? "PARTIAL_REFUND" : "REFUND",
        refund_amount: money(proposal.amount.value),
      };
      return { ok: true, request: { kind: proposal.kind, path: "accept-claim", body: { type: "json", json } } };
    }
    case "make_offer": {
      const json = { note: NOTE, offer_type: proposal.offerType, offer_amount: money(proposal.amount.value) };
      return { ok: true, request: { kind: proposal.kind, path: "make-offer", body: { type: "json", json } } };
    }
    case "provide_evidence": {
      const evidence = {
        evidence_type: "PROOF_OF_FULFILLMENT",
        evidence_info: { tracking_info: [{ carrier_name: proposal.carrier.value, tracking_number: proposal.trackingNumber.value }] },
        notes: "Order delivered; tracking attached.",
      };
      return { ok: true, request: { kind: proposal.kind, path: "provide-evidence", body: { type: "multipart-input", input: { evidences: [evidence] } } } };
    }
    case "send_message":
      return { ok: true, request: { kind: proposal.kind, path: "send-message", body: { type: "json", json: { message: proposal.body } } } };
    case "send_invoice":
      // todo: invoices go through the toolkit invoicing tools, not the disputes api
      return { ok: false, error: "send_invoice is not wired to paypal yet" };
    case "hold":
      return { ok: false, error: "hold writes nothing to paypal" };
  }
}
