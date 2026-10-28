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

export type LedgerEntry = {
  at: string;
  disputeId: string;
  run: RunContext;
  docket: Docket;
  unlisted: string[];
} & (
  | { outcome: "agent-error"; error: string; seconds: number }
  | {
      outcome: "judged";
      proposer: Proposer;
      proposal: Proposal;
      reasoning?: string | undefined;
      verdict: Verdict;
      execution: Execution;
      // note: absent on operator proposals, which make no model call
      seconds?: number | undefined;
      tokens?: number | undefined;
    }
);
