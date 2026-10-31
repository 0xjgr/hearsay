import { listOutgoingText } from "../proposal.ts";
import type { Rule } from "../rule.ts";

const CONTACT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s)"'>]+|www\.[^\s)"'>]+/gi;

// threat: the buyer gets a third-party address or a link into the store's own words;
// seen Oct 30, qwen2.5 also made up a support address the store does not have
export const checkContactOrigin: Rule = (proposal, { docket }) => {
  const known = docket.facts.map((f) => f.value.toLowerCase());
  const contacts = listOutgoingText(proposal).flatMap((text) => text.match(CONTACT) ?? []);
  const foreign = [...new Set(contacts.map((c) => c.toLowerCase().replace(/[.,;:]+$/, "")))].filter((c) => !known.some((v) => v.includes(c)));
  if (foreign.length === 0) return [];
  return [{ rule: "contact-origin", outcome: "deny", reason: `outgoing text names ${foreign.join(", ")}, found in no paypal or store fact` }];
};
