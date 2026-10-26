import { parseArgs } from "node:util";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { proposeAction } from "../agent/propose-action.ts";
import { loadStore } from "../bench/load-fixture.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import { findSource } from "../provenance/author.ts";
import { BUYER_EMAIL, buildDocket } from "../provenance/build-docket.ts";
import { executeProposal } from "./execute-proposal.ts";
import { fetchDispute, openToolkit } from "./toolkit.ts";

// usage: pnpm dispute <dispute_id> [--message "text"] [--warn] [--send]
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { message: { type: "string" }, warn: { type: "boolean", default: false }, send: { type: "boolean", default: false } },
});
const disputeId = positionals[0];
if (disputeId === undefined) {
  console.log("[dispute] usage: pnpm dispute <dispute_id> [--message text] [--warn] [--send]");
  process.exit(2);
}

const toolkit = openToolkit(process.env);
const store = loadStore();
const read = await fetchDispute(toolkit, disputeId);
if (!read.ok) {
  console.log(`[paypal] read failed ${read.error}`);
  process.exit(1);
}
const { docket, unlisted } = buildDocket(read.value, store);
console.log(`[provenance] ${disputeId} segments=${docket.segments.length} facts=${docket.facts.length} unlisted=${unlisted.join(",") || 0}`);

const proposal = values.message === undefined ? await askAgent() : composeMessage(values.message);
if (proposal === undefined) process.exit(1);
const verdict = judgeProposal(proposal, { docket, store });
console.log(`[policy] ${disputeId} ${verdict.kind}${verdict.kind === "allow" ? "" : " " + verdict.hits.map((h) => `rule=${h.rule} reason="${h.reason}"`).join(" ")}`);

const fresh = await fetchDispute(toolkit, disputeId);
if (!fresh.ok) {
  console.log(`[paypal] re-read failed ${fresh.error}`);
  process.exit(1);
}
const execution = await executeProposal({
  proposal,
  verdict,
  docket,
  freshDispute: fresh.value,
  grants: new GrantBook(),
  send: values.send ? { toolkit } : "dry-run",
});
console.log(`[paypal] ${disputeId} ${execution.kind} ${JSON.stringify(execution).slice(0, 600)}`);

async function askAgent(): Promise<Proposal | undefined> {
  const proposed = await proposeAction(docket, readModelEndpoint(process.env), { warnModel: values.warn });
  if (!proposed.ok) {
    console.log(`[agent] ${disputeId} error="${proposed.error}"`);
    return undefined;
  }
  console.log(`[agent] ${disputeId} ${JSON.stringify(proposed.proposal)} secs=${proposed.seconds.toFixed(1)}`);
  return proposed.proposal;
}

// note: a fixed message from the operator, still judged by policy like any proposal
function composeMessage(body: string): Proposal {
  const to = findSource(docket, BUYER_EMAIL) ?? "";
  return { kind: "send_message", to: { value: to, cite: BUYER_EMAIL }, body, because: [] };
}
