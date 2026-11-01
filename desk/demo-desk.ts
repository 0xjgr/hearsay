import type { CorpusCase } from "../bench/build-corpus.ts";
import type { JudgedEntry, ReviewEntry } from "../ledger/ledger-entry.ts";
import type { Store } from "../merchant/store.ts";
import { buildRequest } from "../paypal/dispute-request.ts";
import type { Execution } from "../paypal/execute-proposal.ts";
import type { ListedDispute } from "../paypal/toolkit.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import type { Verdict } from "../policy/verdict.ts";
import type { Docket } from "../provenance/author.ts";

// note: reviews are recorded runs; "unread" ones wait for the judge to press run agent
export type DemoDesk = { listed: ListedDispute[]; entries: ReviewEntry[]; unread: ReviewEntry[] };

type DemoCase = { id: string; model: string; status: string; openedHours: number; dueHours: number | undefined; isRead: boolean };

const QWEN3 = "qwen3:8b";
const QWEN25 = "qwen2.5:7b-instruct";
const WAITING = "WAITING_FOR_SELLER_RESPONSE";

// note: spread over the board on purpose: one at risk, a few for the owner, one with the buyer, one closed
const DEMO_CASES: DemoCase[] = [
  { id: "BENCH-FAKE-NOTICE", model: QWEN25, status: WAITING, openedHours: 200, dueHours: 30, isRead: false },
  { id: "PP-R-JJZ-10194523", model: QWEN3, status: WAITING, openedHours: 52, dueHours: 190, isRead: true },
  { id: "PP-R-BJT-10194552", model: QWEN3, status: WAITING, openedHours: 20, dueHours: 220, isRead: true },
  { id: "BENCH-NOTICE-CONTACT", model: QWEN3, status: WAITING, openedHours: 90, dueHours: 150, isRead: true },
  { id: "PP-R-PPO-10194554", model: QWEN25, status: WAITING, openedHours: 70, dueHours: 170, isRead: true },
  { id: "BENCH-FAKE-TRACKING", model: QWEN25, status: WAITING, openedHours: 120, dueHours: 120, isRead: true },
  { id: "BENCH-REDIRECT", model: QWEN25, status: WAITING, openedHours: 40, dueHours: 200, isRead: true },
  { id: "PP-R-AMO-10194550", model: QWEN3, status: WAITING, openedHours: 150, dueHours: 90, isRead: true },
  { id: "BENCH-SPLIT", model: QWEN3, status: "UNDER_REVIEW", openedHours: 260, dueHours: undefined, isRead: true },
  { id: "BENCH-NOTICE-OVERCAP", model: QWEN25, status: "RESOLVED", openedHours: 330, dueHours: undefined, isRead: true },
];

const HOUR = 3_600_000;

export function buildDemoDesk(corpus: CorpusCase[], recorded: ReviewEntry[], store: Store, now: Date): DemoDesk {
  const demo: DemoDesk = { listed: [], entries: [], unread: [] };
  for (const demoCase of DEMO_CASES) {
    const found = corpus.find((k) => k.id === demoCase.id);
    const entry = recorded.findLast((e) => e.disputeId === demoCase.id && e.run.model === demoCase.model);
    if (found === undefined || entry === undefined) continue;
    const opened = new Date(now.getTime() - demoCase.openedHours * HOUR);
    const due = demoCase.dueHours === undefined ? undefined : new Date(now.getTime() + demoCase.dueHours * HOUR);
    const updated = demoCase.isRead ? new Date(opened.getTime() + 5 * 60_000) : new Date(now.getTime() - HOUR);
    demo.listed.push(listDemoDispute(found, demoCase.status, opened, updated, due));
    const docket = shiftDocket(entry.docket, { create_time: opened, update_time: updated, seller_response_due_date: due });
    const replayed = replayEntry({ ...entry, docket, at: new Date(opened.getTime() + 10 * 60_000).toISOString() }, store);
    (demoCase.isRead ? demo.entries : demo.unread).push(replayed);
  }
  return demo;
}

function listDemoDispute(found: CorpusCase, status: string, opened: Date, updated: Date, due: Date | undefined): ListedDispute {
  const dispute = found.dispute as { reason: string; dispute_amount: { currency_code: string; value: string } };
  return {
    dispute_id: found.id,
    create_time: opened.toISOString(),
    update_time: updated.toISOString(),
    reason: dispute.reason,
    status,
    dispute_amount: dispute.dispute_amount,
    ...(due === undefined ? {} : { seller_response_due_date: due.toISOString() }),
  };
}

// note: the recorded dates are from october; the docket shows the same dates as the board
function shiftDocket(docket: Docket, dates: Record<string, Date | undefined>): Docket {
  const facts = docket.facts.flatMap((fact) => {
    const path = fact.key.replace(/^paypal:/, "");
    if (!(path in dates)) return [fact];
    const date = dates[path];
    return date === undefined ? [] : [{ ...fact, value: date.toISOString() }];
  });
  return { ...docket, facts };
}

// note: judged again by today's rules; the execution is what the desk would do with DESK_SEND=0
function replayEntry(entry: ReviewEntry, store: Store): ReviewEntry {
  if (entry.outcome === "agent-error") return entry;
  const verdict = judgeProposal(entry.proposal, { docket: entry.docket, store });
  const replayed: JudgedEntry = { ...entry, verdict, execution: settleDemoExecution(entry.proposal, verdict, entry.docket) };
  return replayed;
}

export function settleDemoExecution(proposal: Proposal, verdict: Verdict, docket: Docket): Execution {
  if (proposal.kind === "hold") return { kind: "held" };
  if (verdict.kind === "deny") return { kind: "refused", reason: `denied by ${verdict.hits.map((h) => h.rule).join(",")}` };
  if (verdict.kind === "ask") return { kind: "refused", reason: "needs the owner's grant" };
  const built = buildRequest(proposal, docket);
  return built.ok ? { kind: "dry-run", request: built.request } : { kind: "refused", reason: built.error };
}
