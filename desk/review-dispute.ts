import { randomUUID } from "node:crypto";
import type { ModelEndpoint } from "../agent/model-endpoint.ts";
import { proposeAction } from "../agent/propose-action.ts";
import type { ReviewEntry } from "../ledger/ledger-entry.ts";
import { appendEntry } from "../ledger/ledger-file.ts";
import type { Store } from "../merchant/store.ts";
import { executeProposal } from "../paypal/execute-proposal.ts";
import { fetchDispute, type Toolkit } from "../paypal/toolkit.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import { findSource, type Docket } from "../provenance/author.ts";
import { BUYER_EMAIL, buildDocket } from "../provenance/build-docket.ts";

export type Desk = {
  toolkit: Toolkit;
  store: Store;
  endpoint: ModelEndpoint;
  ledgerPath: string;
  send: boolean;
  // note: demo disputes kept in their state for the video; never written to, send or not
  frozen: ReadonlySet<string>;
};

export type ReviewRequest = { disputeId: string; message?: string | undefined; warnModel: boolean };

export type Reviewed = { ok: true; entry: ReviewEntry } | { ok: false; error: string };

// note: one pass of read, docket, agent or operator, policy, re-read, execute, ledger
export async function reviewDispute(desk: Desk, request: ReviewRequest): Promise<Reviewed> {
  const { disputeId, warnModel } = request;
  const read = await fetchDispute(desk.toolkit, disputeId);
  if (!read.ok) return { ok: false, error: `read failed ${read.error}` };
  const { docket, unlisted } = buildDocket(read.value, desk.store);
  console.log(`[provenance] ${disputeId} segments=${docket.segments.length} facts=${docket.facts.length} unlisted=${unlisted.join(",") || 0}`);

  const run = { source: "live", model: desk.endpoint.model, reasoning: desk.endpoint.reasoning, warnModel } as const;
  const base = { id: randomUUID(), at: new Date().toISOString(), disputeId, run, docket, unlisted };
  const proposed = request.message === undefined ? await proposeAction(docket, desk.endpoint, { warnModel }) : undefined;
  if (proposed !== undefined && !proposed.ok) {
    console.log(`[agent] ${disputeId} error="${proposed.error}" secs=${proposed.seconds.toFixed(1)}`);
    return { ok: true, entry: appendEntry(desk.ledgerPath, { ...base, outcome: "agent-error", error: proposed.error, seconds: proposed.seconds }) };
  }
  if (proposed !== undefined) console.log(`[agent] ${disputeId} ${JSON.stringify(proposed.proposal)} secs=${proposed.seconds.toFixed(1)}`);

  const proposal = proposed?.proposal ?? composeMessage(docket, request.message ?? "");
  const verdict = judgeProposal(proposal, { docket, store: desk.store });
  console.log(`[policy] ${disputeId} ${verdict.kind}${verdict.kind === "allow" ? "" : " " + verdict.hits.map((h) => `rule=${h.rule} reason="${h.reason}"`).join(" ")}`);

  const fresh = await fetchDispute(desk.toolkit, disputeId);
  if (!fresh.ok) return { ok: false, error: `re-read failed ${fresh.error}` };
  const execution = await executeProposal({
    proposal,
    verdict,
    docket,
    freshDispute: fresh.value,
    grants: new GrantBook(),
    send: canWrite(desk, disputeId) ? { toolkit: desk.toolkit } : "dry-run",
  });
  console.log(`[paypal] ${disputeId} ${execution.kind} ${JSON.stringify(execution).slice(0, 600)}`);
  const entry = appendEntry(desk.ledgerPath, {
    ...base,
    outcome: "judged",
    proposer: proposed === undefined ? "operator" : "agent",
    proposal,
    verdict,
    execution,
    ...(proposed === undefined ? {} : { reasoning: proposed.reasoning, seconds: proposed.seconds, tokens: proposed.tokens }),
  });
  return { ok: true, entry };
}

export function canWrite(desk: Desk, disputeId: string): boolean {
  return desk.send && !desk.frozen.has(disputeId);
}

// note: a fixed message from the operator, still judged by policy like any proposal
function composeMessage(docket: Docket, body: string): Proposal {
  const to = findSource(docket, BUYER_EMAIL) ?? "";
  return { kind: "send_message", to: { value: to, cite: BUYER_EMAIL }, body, because: [] };
}
