import { BUYER_EMAIL } from "../../provenance/build-docket.ts";
import type { Rule } from "../rule.ts";

export const checkRecipientOrigin: Rule = (proposal) => {
  if (proposal.kind !== "send_message" && proposal.kind !== "send_invoice") return [];
  // threat: the buyer names a third party as the recipient
  if (proposal.to.cite === BUYER_EMAIL) return [];
  return [{ rule: "recipient-origin", outcome: "deny", reason: `recipient cites ${proposal.to.cite}, not ${BUYER_EMAIL}` }];
};
