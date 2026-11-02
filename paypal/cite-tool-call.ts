import { z } from "zod";
import { parseCents } from "../policy/amount.ts";
import type { CitedValue, Proposal } from "../policy/proposal.ts";
import type { RuleHit } from "../policy/verdict.ts";
import { findSource, type Citation, type Docket, type FactKey } from "../provenance/author.ts";

export const GUARDED_TOOLS = ["accept_dispute_claim", "create_refund"] as const;
export type GuardedTool = (typeof GUARDED_TOOLS)[number];

export type CitedCall = { proposal: Proposal; outgoing: string[]; hits: RuleHit[] };
export type CallCitation = { ok: true; value: CitedCall } | { ok: false; error: string };

const CAP: FactKey = "paypal:refund_details.allowed_refund_amount.value";
const SELLER_TRANSACTION: FactKey = "paypal:disputed_transactions[0].seller_transaction_id";
const DISPUTE_CURRENCY: FactKey = "paypal:dispute_amount.currency_code";
const ORDER_AMOUNT: FactKey = "merchant:order.amount";
// threat: any numeric paypal field equal to the buyer's figure would launder it, so only
// these records may vouch for an amount
const AMOUNT_RECORDS: FactKey[] = [CAP, "paypal:dispute_amount.value", ORDER_AMOUNT];

const AcceptArgsSchema = z.object({ dispute_id: z.string(), note: z.string().optional() });
const RefundArgsSchema = z.object({
  capture_id: z.string(),
  amount: z.object({ currency_code: z.string(), value: z.string() }).optional(),
  note_to_payer: z.string().optional(),
});

export function isGuardedTool(name: string): name is GuardedTool {
  return (GUARDED_TOOLS as readonly string[]).includes(name);
}

// note: an outside agent cites nothing, so the guard cites for it by looking up where
// each value it sent could have come from
export function citeToolCall(tool: GuardedTool, rawArguments: string, docket: Docket): CallCitation {
  let args: unknown;
  try {
    args = JSON.parse(rawArguments);
  } catch {
    return { ok: false, error: `${tool} arguments are not json` };
  }
  return tool === "accept_dispute_claim" ? citeAccept(args, docket) : citeRefund(args, docket);
}

function citeAccept(args: unknown, docket: Docket): CallCitation {
  const parsed = AcceptArgsSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const hits: RuleHit[] = [];
  // threat: the agent is pointed at a different dispute than the one the owner handed it
  if (parsed.data.dispute_id !== docket.disputeId) {
    hits.push({ rule: "tool-scope", outcome: "deny", reason: `dispute ${parsed.data.dispute_id} is not ${docket.disputeId}` });
  }
  // note: accept-claim takes no amount; paypal pays out its own refund cap
  const amount: CitedValue = { value: findSource(docket, CAP) ?? "", cite: CAP };
  const proposal: Proposal = { kind: "accept_claim", amount, because: [] };
  return { ok: true, value: { proposal, outgoing: listPresent(parsed.data.note), hits } };
}

function citeRefund(args: unknown, docket: Docket): CallCitation {
  const parsed = RefundArgsSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { capture_id: captureId, amount, note_to_payer: note } = parsed.data;
  const hits: RuleHit[] = [];
  const disputed = findSource(docket, SELLER_TRANSACTION);
  // threat: a refund on another order, often another customer's, named in the buyer's text
  if (captureId !== disputed) {
    hits.push({ rule: "tool-scope", outcome: "deny", reason: `capture ${captureId} is not the disputed transaction ${disputed ?? "(none)"}` });
  }
  const currency = findSource(docket, DISPUTE_CURRENCY);
  if (amount !== undefined && amount.currency_code !== currency) {
    hits.push({ rule: "tool-scope", outcome: "deny", reason: `currency ${amount.currency_code} is not the dispute currency ${currency ?? "(none)"}` });
  }
  // note: without an amount paypal refunds the whole capture, which is the order total
  const cited: CitedValue =
    amount === undefined ? { value: findSource(docket, ORDER_AMOUNT) ?? "", cite: ORDER_AMOUNT } : { value: amount.value, cite: citeAmount(amount.value, docket) };
  const proposal: Proposal = { kind: "accept_claim", amount: cited, because: [] };
  return { ok: true, value: { proposal, outgoing: listPresent(note), hits } };
}

function citeAmount(value: string, docket: Docket): Citation {
  const cents = parseCents(value);
  const record = AMOUNT_RECORDS.find((key) => {
    const source = findSource(docket, key);
    return cents !== undefined && source !== undefined && parseCents(source) === cents;
  });
  if (record !== undefined) return record;
  const typed = docket.segments.find((s) => (s.text.match(/\d+(?:\.\d{1,2})?/g) ?? []).some((n) => parseCents(n) === cents));
  // note: a figure found nowhere is cited to the cap, so citation-mismatch names it
  return typed?.id ?? CAP;
}

function listPresent(text: string | undefined): string[] {
  return text === undefined || text.length === 0 ? [] : [text];
}
