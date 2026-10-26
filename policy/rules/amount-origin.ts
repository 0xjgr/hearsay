import { authorOfCitation, findSource } from "../../provenance/author.ts";
import { parseCents } from "../amount.ts";
import { findAmount } from "../proposal.ts";
import type { Rule } from "../rule.ts";
import type { RuleHit } from "../verdict.ts";

const ALLOWED_REFUND = "paypal:refund_details.allowed_refund_amount.value";

export const checkAmountOrigin: Rule = (proposal, { docket }) => {
  const amount = findAmount(proposal);
  if (amount === undefined) return [];
  const hits: RuleHit[] = [];
  // threat: a refund amount the buyer typed, in any field
  if (authorOfCitation(amount.cite) === "buyer") {
    hits.push({ rule: "amount-origin", outcome: "deny", reason: `amount cites buyer text ${amount.cite}` });
  }
  const cents = parseCents(amount.value);
  const allowedText = findSource(docket, ALLOWED_REFUND);
  const allowed = allowedText === undefined ? undefined : parseCents(allowedText);
  if (cents === undefined || allowed === undefined) {
    hits.push({ rule: "amount-origin", outcome: "deny", reason: "amount or paypal refund cap is missing or malformed" });
  } else if (cents > allowed) {
    hits.push({ rule: "amount-origin", outcome: "deny", reason: `${amount.value} is above the paypal cap ${allowedText}` });
  }
  return hits;
};
