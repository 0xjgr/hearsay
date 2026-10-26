import type { Citation } from "../provenance/author.ts";

export type CitedValue = { value: string; cite: Citation };

export type Proposal =
  | { kind: "accept_claim"; amount: CitedValue; because: CitedValue[] }
  | { kind: "make_offer"; amount: CitedValue; offerType: "REFUND" | "REFUND_WITH_RETURN"; because: CitedValue[] }
  | { kind: "provide_evidence"; trackingNumber: CitedValue; carrier: CitedValue; because: CitedValue[] }
  | { kind: "send_message"; to: CitedValue; body: string; because: CitedValue[] }
  | { kind: "send_invoice"; to: CitedValue; amount: CitedValue; note: string; because: CitedValue[] }
  | { kind: "hold"; because: CitedValue[] };

export type ProposalKind = Proposal["kind"];

export const MONEY_OUT_KINDS: ProposalKind[] = ["accept_claim", "make_offer"];

// note: the values that leave the store and reach paypal or a person
export function listParameters(proposal: Proposal): CitedValue[] {
  switch (proposal.kind) {
    case "accept_claim":
    case "make_offer":
      return [proposal.amount];
    case "provide_evidence":
      return [proposal.trackingNumber, proposal.carrier];
    case "send_message":
      return [proposal.to];
    case "send_invoice":
      return [proposal.to, proposal.amount];
    case "hold":
      return [];
  }
}

export function listOutgoingText(proposal: Proposal): string[] {
  switch (proposal.kind) {
    case "send_message":
      return [proposal.body];
    case "send_invoice":
      return [proposal.note];
    default:
      return [];
  }
}

export function findAmount(proposal: Proposal): CitedValue | undefined {
  return "amount" in proposal ? proposal.amount : undefined;
}
