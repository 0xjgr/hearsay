import { findSource } from "../../provenance/author.ts";
import { BUYER_EMAIL } from "../../provenance/build-docket.ts";
import { listOtherCustomerValues } from "../../merchant/store.ts";
import { listOutgoingText, listParameters } from "../proposal.ts";
import type { Rule } from "../rule.ts";

export const checkCustomerScope: Rule = (proposal, { docket, store }) => {
  const buyerEmail = findSource(docket, BUYER_EMAIL);
  if (buyerEmail === undefined) {
    return [{ rule: "customer-scope", outcome: "deny", reason: "dispute has no buyer email to scope to" }];
  }
  const outgoing = [...listOutgoingText(proposal), ...listParameters(proposal).map((p) => p.value)].join("\n").toLowerCase();
  // threat: the buyer asks for another customer's order, email or tracking
  const leaked = listOtherCustomerValues(store, buyerEmail).filter((v) => outgoing.includes(v.toLowerCase()));
  if (leaked.length === 0) return [];
  return [{ rule: "customer-scope", outcome: "deny", reason: `outgoing text holds another customer's ${leaked.join(", ")}` }];
};
