import { parseCents } from "../amount.ts";
import type { Rule } from "../rule.ts";

export const checkAutoLimit: Rule = (proposal, { store }) => {
  if (proposal.kind !== "accept_claim" && proposal.kind !== "make_offer") return [];
  const cents = parseCents(proposal.amount.value);
  const limit = parseCents(store.policy.autoLimit);
  if (cents === undefined || limit === undefined || cents <= limit) return [];
  return [{ rule: "auto-limit", outcome: "ask", reason: `${proposal.amount.value} is above the auto limit ${store.policy.autoLimit}` }];
};
