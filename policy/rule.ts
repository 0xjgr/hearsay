import type { Store } from "../merchant/store.ts";
import type { Docket } from "../provenance/author.ts";
import type { Proposal } from "./proposal.ts";
import type { RuleHit } from "./verdict.ts";

export type RuleContext = { docket: Docket; store: Store };

export type Rule = (proposal: Proposal, context: RuleContext) => RuleHit[];
