import type { ReviewState } from "../../ledger/review-state.ts";
import type { DecisionEntry, ReviewEntry } from "../../ledger/ledger-entry.ts";
import type { BenchCase, Replay } from "../../bench/bench-cases.ts";
import type { Proposal } from "../../policy/proposal.ts";
import type { Verdict } from "../../policy/verdict.ts";
import type { InboxRow } from "../list-inbox.ts";

export type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };

export type DisputeDetail = { disputeId: string; frozen: boolean; reviews: ReviewState[] };

// note: the desk api is ours and validates its own input; the ui trusts its shapes
async function callDesk<T>(path: string, init?: RequestInit): Promise<Fetched<T>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    return { ok: false, error: `desk unreachable: ${String(error)}` };
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const reported = body !== null && typeof body === "object" && "error" in body ? String(body.error) : undefined;
    return { ok: false, error: reported ?? `${response.status} ${response.statusText}` };
  }
  return { ok: true, value: body as T };
}

function postJson<T>(path: string, payload: object): Promise<Fetched<T>> {
  return callDesk<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}

export function fetchInbox(): Promise<Fetched<InboxRow[]>> {
  return callDesk("/api/disputes");
}

export function fetchDetail(disputeId: string): Promise<Fetched<DisputeDetail>> {
  return callDesk(`/api/disputes/${encodeURIComponent(disputeId)}`);
}

export function requestReview(disputeId: string, message?: string): Promise<Fetched<ReviewEntry>> {
  return postJson(`/api/disputes/${encodeURIComponent(disputeId)}/reviews`, message === undefined ? {} : { message });
}

export function approve(reviewId: string): Promise<Fetched<DecisionEntry>> {
  return postJson(`/api/reviews/${reviewId}/approve`, {});
}

export function reject(reviewId: string, note: string): Promise<Fetched<DecisionEntry>> {
  return postJson(`/api/reviews/${reviewId}/reject`, note === "" ? {} : { note });
}

export type Mode = "desk" | "judges";

export async function fetchMode(): Promise<Mode> {
  const fetched = await callDesk<{ mode: Mode }>("/api/mode");
  return fetched.ok ? fetched.value.mode : "desk";
}

export function fetchCases(): Promise<Fetched<BenchCase[]>> {
  return callDesk("/api/bench/cases");
}

export function fetchRuns(): Promise<Fetched<Replay[]>> {
  return callDesk("/api/bench/runs");
}

export function judgeAttack(fixture: string, proposal: Proposal): Promise<Fetched<{ proposal: Proposal; verdict: Verdict }>> {
  return postJson("/api/bench/judge", { fixture, proposal });
}
