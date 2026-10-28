import { randomUUID } from "node:crypto";
import type { DecisionEntry } from "../ledger/ledger-entry.ts";
import { appendEntry, readLedger } from "../ledger/ledger-file.ts";
import { canDecide, replayReviews, type ReviewState } from "../ledger/review-state.ts";
import { executeProposal } from "../paypal/execute-proposal.ts";
import { fetchDispute } from "../paypal/toolkit.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import { canWrite, type Desk } from "./review-dispute.ts";

export type Decided =
  | { ok: true; entry: DecisionEntry }
  | { ok: false; reason: "missing" | "conflict" | "upstream"; error: string };

// threat: two approvals of one review racing each other into two refunds
const IN_FLIGHT = new Set<string>();

export async function approveReview(desk: Desk, reviewId: string): Promise<Decided> {
  const found = findOpenReview(desk, reviewId);
  if (!found.ok) return found;
  const { review } = found.state;
  if (review.outcome !== "judged") return { ok: false, reason: "conflict", error: `${reviewId} has no proposal` };
  if (IN_FLIGHT.has(reviewId)) return { ok: false, reason: "conflict", error: `${reviewId} is being approved already` };
  IN_FLIGHT.add(reviewId);
  try {
    const fresh = await fetchDispute(desk.toolkit, review.disputeId);
    if (!fresh.ok) return { ok: false, reason: "upstream", error: `re-read failed ${fresh.error}` };
    // threat: the buyer edits the case after the review; the proposal is judged again on what paypal holds now
    const { docket } = buildDocket(fresh.value, desk.store);
    const verdict = judgeProposal(review.proposal, { docket, store: desk.store });
    const grants = new GrantBook();
    grants.grant(review.disputeId, review.proposal);
    const execution = await executeProposal({
      proposal: review.proposal,
      verdict,
      docket,
      freshDispute: fresh.value,
      grants,
      send: canWrite(desk, review.disputeId) ? { toolkit: desk.toolkit } : "dry-run",
    });
    console.log(`[desk] ${review.disputeId} approved review=${reviewId} verdict=${verdict.kind} execution=${execution.kind}`);
    const entry = appendEntry(desk.ledgerPath, { ...stamp(review.disputeId), outcome: "approved", review: reviewId, execution });
    return { ok: true, entry };
  } finally {
    IN_FLIGHT.delete(reviewId);
  }
}

export function rejectReview(desk: Desk, reviewId: string, note: string | undefined): Decided {
  const found = findOpenReview(desk, reviewId);
  if (!found.ok) return found;
  if (IN_FLIGHT.has(reviewId)) return { ok: false, reason: "conflict", error: `${reviewId} is being approved` };
  const { disputeId } = found.state.review;
  console.log(`[desk] ${disputeId} rejected review=${reviewId}`);
  return { ok: true, entry: appendEntry(desk.ledgerPath, { ...stamp(disputeId), outcome: "rejected", review: reviewId, note }) };
}

function findOpenReview(desk: Desk, reviewId: string): { ok: true; state: ReviewState } | Extract<Decided, { ok: false }> {
  const state = replayReviews(readLedger(desk.ledgerPath).entries).find((s) => s.review.id === reviewId);
  if (state === undefined) return { ok: false, reason: "missing", error: `no review ${reviewId}` };
  if (!canDecide(state.status)) return { ok: false, reason: "conflict", error: `${reviewId} is ${state.status}, nothing to decide` };
  return { ok: true, state };
}

function stamp(disputeId: string) {
  return { id: randomUUID(), at: new Date().toISOString(), disputeId };
}
