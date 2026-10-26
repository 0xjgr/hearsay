import type { Rule } from "../rule.ts";

export const checkActionInPolicy: Rule = (proposal, { store }) => {
  if (store.policy.enabledActions.includes(proposal.kind)) return [];
  return [{ rule: "action-in-policy", outcome: "deny", reason: `${proposal.kind} is not enabled in the store policy` }];
};
