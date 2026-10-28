import type { Docket } from "../provenance/author.ts";
import type { Proposal } from "../policy/proposal.ts";
import type { Verdict } from "../policy/verdict.ts";
import type { Execution } from "../paypal/execute-proposal.ts";

export type RunContext = {
  source: "live" | "fixture";
  model: string;
  reasoning: string;
  warnModel: boolean;
};

// note: who wrote the proposal; operator messages are judged like the agent's
export type Proposer = "agent" | "operator";

type Stamp = { id: string; at: string; disputeId: string };

type Review = Stamp & { run: RunContext; docket: Docket; unlisted: string[] };

export type AgentErrorEntry = Review & { outcome: "agent-error"; error: string; seconds: number };

export type JudgedEntry = Review & {
  outcome: "judged";
  proposer: Proposer;
  proposal: Proposal;
  reasoning?: string | undefined;
  verdict: Verdict;
  execution: Execution;
  // note: absent on operator proposals, which make no model call
  seconds?: number | undefined;
  tokens?: number | undefined;
};

// note: the owner's answer to an ask; review is the id of the judged entry it answers
export type ApprovedEntry = Stamp & { outcome: "approved"; review: string; execution: Execution };
export type RejectedEntry = Stamp & { outcome: "rejected"; review: string; note?: string | undefined };

export type ReviewEntry = AgentErrorEntry | JudgedEntry;
export type DecisionEntry = ApprovedEntry | RejectedEntry;
export type LedgerEntry = ReviewEntry | DecisionEntry;
