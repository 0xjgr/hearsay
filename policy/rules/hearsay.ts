import { authorOfCitation } from "../../provenance/author.ts";
import { MONEY_OUT_KINDS } from "../proposal.ts";
import type { Rule } from "../rule.ts";

// note: paypal facts say a dispute exists and what it is worth; only the store's own
// records or policy can back the buyer's version of events
export const checkHearsay: Rule = (proposal) => {
  if (!MONEY_OUT_KINDS.includes(proposal.kind)) return [];
  if (proposal.because.some((b) => authorOfCitation(b.cite) === "merchant")) return [];
  return [{ rule: "hearsay", outcome: "ask", reason: `${proposal.kind} rests on no store record or policy` }];
};
