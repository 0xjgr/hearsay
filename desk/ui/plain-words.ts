import type { ReviewStatus } from "../../ledger/review-state.ts";
import type { ProposalKind } from "../../policy/proposal.ts";
import type { RuleId, Verdict } from "../../policy/verdict.ts";
import type { Author, Citation } from "../../provenance/author.ts";

export type Tone = "allow" | "ask" | "deny" | "quiet";

export const STATUS_WORDS: Record<ReviewStatus, { label: string; tone: Tone }> = {
  "agent-error": { label: "Agent error", tone: "deny" },
  held: { label: "Agent held", tone: "quiet" },
  denied: { label: "Blocked", tone: "deny" },
  pending: { label: "Needs you", tone: "ask" },
  approved: { label: "Approved", tone: "allow" },
  rejected: { label: "Rejected", tone: "quiet" },
  "dry-run": { label: "Allowed", tone: "allow" },
  refused: { label: "Refused at send", tone: "deny" },
  sent: { label: "Sent to PayPal", tone: "allow" },
  failed: { label: "Send failed", tone: "deny" },
};

export const VERDICT_WORDS: Record<Verdict["kind"], string> = { allow: "Allowed", ask: "Needs you", deny: "Blocked" };

export const AUTHOR_WORDS: Record<Author, string> = { buyer: "Buyer", paypal: "PayPal", merchant: "Merchant" };

export const KIND_WORDS: Record<ProposalKind, string> = {
  accept_claim: "Refund the buyer",
  make_offer: "Offer a partial refund",
  provide_evidence: "File tracking as proof of delivery",
  send_message: "Message the buyer",
  send_invoice: "Send an invoice",
  hold: "Wait, do nothing yet",
};

// note: the desk rules in the order the readme lists them; tool-scope only exists in guardToolkit
export const DESK_RULES: { id: RuleId; checks: string }[] = [
  { id: "action-in-policy", checks: "The store policy allows this kind of action" },
  { id: "citation-mismatch", checks: "Every value really appears where the agent says it does" },
  { id: "amount-origin", checks: "Amounts come from PayPal or the store, never from buyer text" },
  { id: "recipient-origin", checks: "Messages go to the buyer email PayPal holds" },
  { id: "evidence-origin", checks: "Tracking numbers come from the store's shipment record" },
  { id: "contact-origin", checks: "Outgoing text names no address or link the records lack" },
  { id: "customer-scope", checks: "Outgoing text holds no other customer's details" },
  { id: "hearsay", checks: "A refund cites the store policy, not only the buyer's story" },
  { id: "record-conflict", checks: "Money out on a not-received claim fits the delivery record" },
  { id: "auto-limit", checks: "The amount is under the store's auto-approve limit" },
];

const REASONS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorised payment",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate payment",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid by other means",
  CANCELED_RECURRING_BILLING: "Canceled recurring payment",
};

export function labelReason(reason: string): string {
  return REASONS[reason] ?? sentenceCase(reason.toLowerCase().replaceAll("_", " "));
}

const FACTS: Record<string, string> = {
  "paypal:dispute_id": "Dispute id",
  "paypal:disputed_transactions[0].seller_transaction_id": "Transaction id",
  "paypal:disputed_transactions[0].gross_amount.value": "Amount paid",
  "paypal:disputed_transactions[0].buyer.email": "Buyer email on file",
  "paypal:status": "Dispute status",
  "paypal:dispute_amount.currency_code": "Currency",
  "paypal:dispute_amount.value": "Disputed amount",
  "paypal:dispute_life_cycle_stage": "Stage",
  "paypal:seller_response_due_date": "Seller response due",
  "paypal:refund_details.allowed_refund_amount.value": "Most PayPal lets you refund",
  "merchant:policy": "Store refund policy",
  "merchant:order.order": "Order number",
  "merchant:order.transactionId": "Order transaction id",
  "merchant:order.amount": "Order total",
  "merchant:order.currency": "Order currency",
  "merchant:order.status": "Order status",
  "merchant:order.carrier": "Carrier",
  "merchant:order.tracking": "Tracking on file",
  "merchant:order.shipped": "Shipped on",
  "merchant:order.deliveredOn": "Delivered on",
};

const FIELDS: [RegExp, string][] = [
  [/^messages\[\d+\]\.content$/, "Message to the seller"],
  [/^evidences\[\d+\]\.notes$/, "Evidence note"],
  [/items\[\d+\]\.item_name$/, "Item name"],
  [/items\[\d+\]\.item_description$/, "Item description"],
  [/items\[\d+\]\.notes$/, "Problem description"],
  [/items\[\d+\]\.item_quantity$/, "Quantity"],
  [/items\[\d+\]\.reason$/, "Reason picked"],
  [/items\[\d+\]\.item_type$/, "Item type picked"],
  [/^reason$/, "Reason picked"],
  [/buyer\.name$/, "Account name"],
  [/^offer\.buyer_requested_amount\.value$/, "Refund the buyer asks for"],
  [/^offer\.buyer_requested_amount\.currency_code$/, "Currency the buyer asks in"],
  [/documents\[\d+\]\.name$/, "Attachment name"],
  [/documents\[\d+\]\.url$/, "Attachment link"],
  [/^extensions\.merchant_contacted$/, "Says they contacted you"],
  [/^extensions\.merchant_contacted_outcome$/, "Outcome they report"],
];

export function labelField(path: string): string {
  return FIELDS.find(([pattern]) => pattern.test(path))?.[1] ?? path;
}

export function labelCitation(citation: Citation, segmentPath?: string): string {
  if (segmentPath !== undefined) return labelField(segmentPath);
  if (FACTS[citation] !== undefined) return FACTS[citation]!;
  if (citation.includes("allowed_response_options")) return "Responses PayPal offers";
  return citation.replace(/^(paypal|merchant):/, "");
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function describeDue(dueAt: string | undefined, now: Date): { text: string; isUrgent: boolean } | undefined {
  if (dueAt === undefined) return undefined;
  const days = Math.ceil((Date.parse(dueAt) - now.getTime()) / 86_400_000);
  const date = new Date(dueAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  if (days < 0) return { text: `Was due ${date}`, isUrgent: true };
  if (days <= 1) return { text: `Due ${days === 0 ? "today" : "tomorrow"}, ${date}`, isUrgent: true };
  return { text: `${days} days left, due ${date}`, isUrgent: days <= 2 };
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
