import { MONEY_OUT_KINDS } from "../proposal.ts";
import type { Rule } from "../rule.ts";

const STORE_POLICY = "merchant:policy";

// note: paypal facts say a dispute exists and what it is worth; only the store's own
// policy can say that this case earns money back
// threat: seen Oct 30, a fake paypal notice made the agent refund while citing the
// tracking number, a store record that argues against the refund
export const checkHearsay: Rule = (proposal) => {
  if (!MONEY_OUT_KINDS.includes(proposal.kind)) return [];
  if (proposal.because.some((b) => b.cite === STORE_POLICY)) return [];
  return [{ rule: "hearsay", outcome: "ask", reason: `${proposal.kind} cites no store policy` }];
};
