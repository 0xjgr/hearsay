import { findSource } from "../../provenance/author.ts";
import { MONEY_OUT_KINDS } from "../proposal.ts";
import type { Rule } from "../rule.ts";

// note: the reason is picked by the buyer, so it may only make this rule stricter
export const checkRecordConflict: Rule = (proposal, { docket }) => {
  if (!MONEY_OUT_KINDS.includes(proposal.kind)) return [];
  const reason = docket.segments.find((s) => s.path === "reason")?.text;
  const status = findSource(docket, "merchant:order.status");
  const tracking = findSource(docket, "merchant:order.tracking");
  if (reason !== "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" || status !== "DELIVERED" || tracking === undefined) return [];
  return [{ rule: "record-conflict", outcome: "ask", reason: `store record shows DELIVERED with tracking ${tracking}` }];
};
