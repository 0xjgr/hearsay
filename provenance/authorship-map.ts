import type { Author } from "./author.ts";

// note: paths use [] for any array index; built from the sandbox fixtures in bench/disputes
const PAYPAL_PATHS = [
  "dispute_id",
  "create_time",
  "update_time",
  "status",
  "dispute_state",
  "dispute_life_cycle_stage",
  "dispute_channel",
  "seller_response_due_date",
  // note: the buyer asks for an amount, but paypal caps it at the paid amount
  "dispute_amount.value",
  "dispute_amount.currency_code",
  "refund_details.allowed_refund_amount.value",
  "refund_details.allowed_refund_amount.currency_code",
  "allowed_response_options.accept_claim.accept_claim_types[]",
  "allowed_response_options.make_offer.offer_types[]",
  "disputed_transactions[].buyer_transaction_id",
  "disputed_transactions[].seller_transaction_id",
  "disputed_transactions[].create_time",
  "disputed_transactions[].transaction_status",
  "disputed_transactions[].gross_amount.value",
  "disputed_transactions[].gross_amount.currency_code",
  "disputed_transactions[].seller_protection_eligible",
  "disputed_transactions[].seller_protection_type",
  "disputed_transactions[].seller.email",
  "disputed_transactions[].seller.merchant_id",
  "disputed_transactions[].seller.name",
  "disputed_transactions[].buyer.email",
  "disputed_transactions[].buyer.payer_id",
  "fund_movements[].party",
  "fund_movements[].amount.value",
  "fund_movements[].amount.currency_code",
  "fund_movements[].initiated_time",
  "fund_movements[].type",
  "fund_movements[].reason",
  "extensions.buyer_contacted_time",
  "messages[].posted_by",
  "messages[].time_posted",
  "evidences[].evidence_type",
  "evidences[].source",
  "evidences[].date",
  "evidences[].dispute_life_cycle_stage",
  "evidences[].action_info.action",
  // note: seen Oct 26 on PP-R-JJZ once the sandbox resolved it on its own
  "dispute_outcome.outcome_code",
  "dispute_outcome.outcome_reason",
  "adjudications[].type",
  "adjudications[].adjudication_time",
  "adjudications[].reason",
  "adjudications[].dispute_life_cycle_stage",
];

// threat: the api marks none of these as buyer-written, the form shows they are
const BUYER_PATHS = [
  "reason",
  "disputed_transactions[].buyer.name",
  "disputed_transactions[].items[].item_name",
  "disputed_transactions[].items[].item_description",
  "disputed_transactions[].items[].item_quantity",
  "disputed_transactions[].items[].item_type",
  "disputed_transactions[].items[].reason",
  "disputed_transactions[].items[].notes",
  "offer.buyer_requested_amount.value",
  "offer.buyer_requested_amount.currency_code",
  "extensions.merchant_contacted",
  "extensions.merchant_contacted_outcome",
  // threat: seller messages can quote the buyer, so message and evidence bodies
  // stay buyer whatever posted_by or source says
  "messages[].content",
  "messages[].documents[].name",
  "messages[].documents[].url",
  "evidences[].notes",
  "evidences[].documents[].name",
  "evidences[].documents[].url",
];

// note: hateoas links carry no facts about the case
const IGNORED_PATHS = ["links[].href", "links[].method", "links[].rel"];

const AUTHORSHIP = new Map<string, Author | "ignored">([
  ...PAYPAL_PATHS.map((p) => [p, "paypal"] as const),
  ...BUYER_PATHS.map((p) => [p, "buyer"] as const),
  ...IGNORED_PATHS.map((p) => [p, "ignored"] as const),
]);

export type Classification = { author: Author | "ignored"; isListed: boolean };

export function classifyPath(pattern: string): Classification {
  const author = AUTHORSHIP.get(pattern);
  // threat: a field paypal adds tomorrow must not arrive as trusted
  if (author === undefined) return { author: "buyer", isListed: false };
  return { author, isListed: true };
}

export function toPattern(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}
