import { findOrder, type Store } from "../merchant/store.ts";
import type { Docket, Fact, FactKey } from "./author.ts";
import { traceDispute, type Trace } from "./trace-dispute.ts";

export type DocketBuild = { docket: Docket; unlisted: string[] };

// todo: disputes over several transactions; every fixture so far has one
const SELLER_TRANSACTION: FactKey = "paypal:disputed_transactions[0].seller_transaction_id";
export const BUYER_EMAIL: FactKey = "paypal:disputed_transactions[0].buyer.email";

export function buildDocket(dispute: Parameters<typeof traceDispute>[0], store: Store): DocketBuild {
  const trace = traceDispute(dispute);
  const facts = [...trace.facts, ...collectMerchantFacts(trace, store)];
  const disputeId = trace.facts.find((f) => f.key === "paypal:dispute_id")?.value ?? "unknown";
  return { docket: { disputeId, segments: trace.segments, facts }, unlisted: trace.unlisted };
}

function collectMerchantFacts(trace: Trace, store: Store): Fact[] {
  const facts: Fact[] = [{ key: "merchant:policy", value: store.policy.text }];
  const transactionId = trace.facts.find((f) => f.key === SELLER_TRANSACTION)?.value;
  const order = transactionId === undefined ? undefined : findOrder(store, transactionId);
  if (order === undefined) return facts;
  for (const [field, value] of Object.entries(order)) {
    // note: the buyer email is cited from paypal only, so recipients have one source
    if (field === "buyerEmail" || value === undefined) continue;
    facts.push({ key: `merchant:order.${field}`, value });
  }
  return facts;
}
