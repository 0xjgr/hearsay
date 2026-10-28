import type { Execution } from "../paypal/execute-proposal.ts";
import type { DecisionEntry, LedgerEntry, ReviewEntry } from "./ledger-entry.ts";

export type ReviewStatus =
  | "agent-error"
  | "held"
  | "denied"
  | "pending"
  | "approved"
  | "rejected"
  | "dry-run"
  | "refused"
  | "sent"
  | "failed";

export type ReviewState = { review: ReviewEntry; decisions: DecisionEntry[]; status: ReviewStatus };

// note: the ledger is the only store; grants and statuses are replayed from it, never kept apart
export function replayReviews(entries: LedgerEntry[]): ReviewState[] {
  const states = new Map<string, ReviewState>();
  for (const entry of entries) {
    if (entry.outcome === "agent-error" || entry.outcome === "judged") {
      states.set(entry.id, { review: entry, decisions: [], status: "agent-error" });
      continue;
    }
    // note: a decision whose review is missing from this file is ignored, not trusted
    states.get(entry.review)?.decisions.push(entry);
  }
  return [...states.values()].map((state) => ({ ...state, status: settleStatus(state) }));
}

// threat: a second approval of a review that already reached paypal, as a double refund
export function canDecide(status: ReviewStatus): boolean {
  return status === "pending" || status === "approved";
}

function settleStatus({ review, decisions }: Omit<ReviewState, "status">): ReviewStatus {
  if (review.outcome === "agent-error") return "agent-error";
  const executions = [review.execution, ...decisions.flatMap((d) => (d.outcome === "approved" ? [d.execution] : []))];
  if (executions.some((e) => e.kind === "sent")) return "sent";
  if (executions.some((e) => e.kind === "failed")) return "failed";
  const last = decisions.at(-1);
  if (last !== undefined) return last.outcome;
  return settleExecution(review.execution, review.verdict.kind);
}

function settleExecution(execution: Execution, verdict: "allow" | "ask" | "deny"): ReviewStatus {
  if (execution.kind === "held" || execution.kind === "dry-run") return execution.kind;
  if (verdict === "deny") return "denied";
  if (verdict === "ask") return "pending";
  return "refused";
}
