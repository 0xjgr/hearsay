import type { Proposal } from "./proposal.ts";
import type { Rule, RuleContext } from "./rule.ts";
import { checkActionInPolicy } from "./rules/action-in-policy.ts";
import { checkAmountOrigin } from "./rules/amount-origin.ts";
import { checkAutoLimit } from "./rules/auto-limit.ts";
import { checkCitationMismatch } from "./rules/citation-mismatch.ts";
import { checkCustomerScope } from "./rules/customer-scope.ts";
import { checkHearsay } from "./rules/hearsay.ts";
import { checkRecipientOrigin } from "./rules/recipient-origin.ts";
import { checkRecordConflict } from "./rules/record-conflict.ts";
import { reachVerdict, type Verdict } from "./verdict.ts";

const RULES: Rule[] = [
  checkActionInPolicy,
  checkCitationMismatch,
  checkAmountOrigin,
  checkHearsay,
  checkRecordConflict,
  checkRecipientOrigin,
  checkCustomerScope,
  checkAutoLimit,
];

// note: every rule runs so the verdict shows all hits, not just the first
export function judgeProposal(proposal: Proposal, context: RuleContext): Verdict {
  if (proposal.kind === "hold") return { kind: "allow" };
  return reachVerdict(RULES.flatMap((rule) => rule(proposal, context)));
}
