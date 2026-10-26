import type { Citation, Docket, Fact } from "../provenance/author.ts";
import { toPattern } from "../provenance/authorship-map.ts";

// note: the agent sees a short list of paypal facts; everything the buyer wrote is shown
const SHOWN_PAYPAL_PATTERNS = new Set([
  "paypal:dispute_id",
  "paypal:status",
  "paypal:dispute_life_cycle_stage",
  "paypal:seller_response_due_date",
  "paypal:dispute_amount.value",
  "paypal:dispute_amount.currency_code",
  "paypal:refund_details.allowed_refund_amount.value",
  "paypal:allowed_response_options.accept_claim.accept_claim_types[]",
  "paypal:allowed_response_options.make_offer.offer_types[]",
  "paypal:disputed_transactions[].seller_transaction_id",
  "paypal:disputed_transactions[].gross_amount.value",
  "paypal:disputed_transactions[].buyer.email",
]);

export type DocketView = { text: string; citable: Citation[] };

export function renderDocket(docket: Docket): DocketView {
  const paypal = docket.facts.filter((f) => SHOWN_PAYPAL_PATTERNS.has(toPattern(f.key)));
  const merchant = docket.facts.filter((f) => f.key.startsWith("merchant:"));
  const text = [
    "PAYPAL FACTS",
    ...paypal.map(renderFact),
    "",
    "STORE RECORDS AND POLICY",
    ...merchant.map(renderFact),
    "",
    "WRITTEN OR PICKED BY THE BUYER",
    // threat: buyer text could fake a section header, so every line carries its id
    ...docket.segments.map((s) => `[${s.id}] (${s.path}) ${JSON.stringify(s.text.trim())}`),
  ].join("\n");
  const citable: Citation[] = [...paypal, ...merchant].map((f) => f.key);
  return { text, citable: [...citable, ...docket.segments.map((s) => s.id)] };
}

function renderFact(fact: Fact): string {
  return `${fact.key} = ${fact.value}`;
}
