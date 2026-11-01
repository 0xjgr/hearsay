import type { DemoDesk } from "../demo-desk.ts";
import type { DecisionEntry, LedgerEntry, ReviewEntry } from "../../ledger/ledger-entry.ts";
import { replayReviews } from "../../ledger/review-state.ts";
import { buildRequest } from "../../paypal/dispute-request.ts";
import { listInbox, type InboxRow } from "../list-inbox.ts";
import type { DisputeDetail, Fetched } from "./desk-api.ts";

// note: the judges' desk keeps each visitor's decisions in their own tab, so judges never see each other's clicks
type DemoState = { desk: DemoDesk; decisions: DecisionEntry[]; replayed: ReviewEntry[] };

let loaded: Promise<Fetched<DemoState>> | undefined;

function loadDemo(): Promise<Fetched<DemoState>> {
  loaded ??= fetch("/api/demo/desk")
    .then(async (response): Promise<Fetched<DemoState>> => {
      if (!response.ok) return { ok: false, error: `${response.status} ${response.statusText}` };
      return { ok: true, value: { desk: (await response.json()) as DemoDesk, decisions: [], replayed: [] } };
    })
    .catch((error: unknown) => ({ ok: false, error: `demo unreachable: ${String(error)}` }));
  return loaded;
}

function listEntries(state: DemoState): LedgerEntry[] {
  return [...state.desk.entries, ...state.replayed, ...state.decisions];
}

export async function fetchDemoInbox(): Promise<Fetched<InboxRow[]>> {
  const demo = await loadDemo();
  if (!demo.ok) return demo;
  return { ok: true, value: listInbox(demo.value.desk.listed, listEntries(demo.value), new Set()) };
}

export async function fetchDemoDetail(disputeId: string): Promise<Fetched<DisputeDetail>> {
  const demo = await loadDemo();
  if (!demo.ok) return demo;
  const reviews = replayReviews(listEntries(demo.value)).filter((s) => s.review.disputeId === disputeId);
  return { ok: true, value: { disputeId, frozen: false, reviews } };
}

// note: no model behind the hosted demo; run agent hands over the run recorded for this case
export async function replayDemoReview(disputeId: string, message: string | undefined): Promise<Fetched<ReviewEntry>> {
  if (message !== undefined) return { ok: false, error: "the hosted demo has no paypal behind it; write a message as an attack in the bench tab" };
  const demo = await loadDemo();
  if (!demo.ok) return demo;
  const state = demo.value;
  const waiting = state.desk.unread.find((e) => e.disputeId === disputeId);
  if (waiting === undefined) return { ok: false, error: "the hosted demo replays one recorded run per case; run the desk locally to call the agent again" };
  const entry = { ...waiting, at: new Date().toISOString() };
  state.replayed.push(entry);
  state.desk.unread = state.desk.unread.filter((e) => e !== waiting);
  return { ok: true, value: entry };
}

export async function decideDemo(reviewId: string, choice: { kind: "approve" } | { kind: "reject"; note: string }): Promise<Fetched<DecisionEntry>> {
  const demo = await loadDemo();
  if (!demo.ok) return demo;
  const review = listEntries(demo.value).find((e) => e.id === reviewId);
  if (review?.outcome !== "judged") return { ok: false, error: "no such review" };
  const stamp = { id: crypto.randomUUID(), at: new Date().toISOString(), disputeId: review.disputeId, review: reviewId };
  let decision: DecisionEntry;
  if (choice.kind === "reject") {
    decision = { ...stamp, outcome: "rejected", ...(choice.note === "" ? {} : { note: choice.note }) };
  } else {
    const built = buildRequest(review.proposal, review.docket);
    decision = { ...stamp, outcome: "approved", execution: built.ok ? { kind: "dry-run", request: built.request } : { kind: "refused", reason: built.error } };
  }
  demo.value.decisions.push(decision);
  return { ok: true, value: decision };
}
