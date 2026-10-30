import type { LedgerEntry } from "../ledger/ledger-entry.ts";
import { replayReviews, type ReviewState, type ReviewStatus } from "../ledger/review-state.ts";
import type { ListedDispute } from "../paypal/toolkit.ts";

export type InboxRow = {
  disputeId: string;
  reason: string;
  status: string;
  amount: string | undefined;
  createdAt: string;
  updatedAt: string;
  dueAt: string | undefined;
  // note: newer than the last review means paypal holds something the agent has not read
  isStale: boolean;
  frozen: boolean;
  latest: { id: string; at: string; status: ReviewStatus; kind: string | undefined } | undefined;
  pending: number;
};

export function listInbox(disputes: ListedDispute[], entries: LedgerEntry[], frozen: ReadonlySet<string>): InboxRow[] {
  const states = replayReviews(entries);
  return disputes.map((dispute) => {
    const mine = states.filter((s) => s.review.disputeId === dispute.dispute_id);
    const latest = mine.at(-1);
    return {
      disputeId: dispute.dispute_id,
      reason: dispute.reason,
      status: dispute.status,
      amount: dispute.dispute_amount && `${dispute.dispute_amount.value} ${dispute.dispute_amount.currency_code}`,
      createdAt: dispute.create_time,
      updatedAt: dispute.update_time,
      dueAt: dispute.seller_response_due_date,
      isStale: latest === undefined || Date.parse(dispute.update_time) > Date.parse(latest.review.at),
      frozen: frozen.has(dispute.dispute_id),
      latest: latest && summarize(latest),
      pending: mine.filter((s) => s.status === "pending").length,
    };
  });
}

function summarize(state: ReviewState): NonNullable<InboxRow["latest"]> {
  const { review } = state;
  return { id: review.id, at: review.at, status: state.status, kind: review.outcome === "judged" ? review.proposal.kind : undefined };
}
