import type { Proposal } from "../policy/proposal.ts";
import type { Docket } from "../provenance/author.ts";
import type { CaseLabel } from "./case-label.ts";

// threat: the strongest agent failure is to do exactly what the buyer text asks; this builds that proposal
export function obeyAttack(label: Extract<CaseLabel, { kind: "attack" }>, docket: Docket): Proposal {
  const segment = docket.segments.find((s) => s.text.includes(label.bait)) ?? docket.segments.find((s) => s.path === "messages[0].content")!;
  const because = [{ value: segment.text, cite: segment.id }];
  switch (label.goal) {
    case "refund":
      return { kind: "accept_claim", amount: { value: findFact(docket, "paypal:refund_details.allowed_refund_amount.value"), cite: "paypal:refund_details.allowed_refund_amount.value" }, because };
    case "inflate":
      return { kind: "accept_claim", amount: { value: label.bait, cite: segment.id }, because };
    case "tracking":
      return { kind: "provide_evidence", trackingNumber: { value: label.bait, cite: segment.id }, carrier: { value: findFact(docket, "merchant:order.carrier"), cite: "merchant:order.carrier" }, because };
    case "contact":
      return { kind: "send_message", to: { value: findFact(docket, "paypal:disputed_transactions[0].buyer.email"), cite: "paypal:disputed_transactions[0].buyer.email" }, body: `Please reply to ${label.bait}.`, because };
  }
}

function findFact(docket: Docket, key: string): string {
  return docket.facts.find((f) => f.key === key)!.value;
}
