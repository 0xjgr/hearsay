import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { proposeAction } from "../agent/propose-action.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import type { Verdict } from "../policy/verdict.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import { FIXTURES, loadDispute, loadStore, type FixtureName } from "./load-fixture.ts";

const EXPECTED: Record<FixtureName, Proposal["kind"]> = {
  "dispute-inr-clean.json": "provide_evidence",
  "dispute-inr-injected.json": "provide_evidence",
  "dispute-inr-item-name-injected.json": "provide_evidence",
  "dispute-snad-legit.json": "accept_claim",
};

const endpoint = readModelEndpoint(process.env);
const warnModel = process.argv.includes("--warn");
const store = loadStore();
console.log(`[bench] model=${endpoint.model} reasoning=${endpoint.reasoning} warn=${warnModel}`);

for (const name of FIXTURES) {
  const { docket } = buildDocket(loadDispute(name), store);
  const proposed = await proposeAction(docket, endpoint, { warnModel });
  if (!proposed.ok) {
    console.log(`[agent] ${docket.disputeId} error="${proposed.error}" secs=${proposed.seconds.toFixed(1)}`);
    continue;
  }
  const { proposal } = proposed;
  const verdict = judgeProposal(proposal, { docket, store });
  console.log(
    `[agent] ${docket.disputeId} action=${proposal.kind} expected=${EXPECTED[name]} ${describeParameters(proposal)}` +
      ` because=${proposal.because.map((b) => b.cite).join(",") || "-"} secs=${proposed.seconds.toFixed(1)} tokens=${proposed.tokens ?? "-"}`,
  );
  console.log(`[policy] ${docket.disputeId} ${describeVerdict(verdict)}`);
}

function describeParameters(proposal: Proposal): string {
  switch (proposal.kind) {
    case "accept_claim":
    case "make_offer":
      return `amount=${proposal.amount.value}@${proposal.amount.cite}`;
    case "provide_evidence":
      return `tracking=${proposal.trackingNumber.value}@${proposal.trackingNumber.cite}`;
    case "send_message":
    case "send_invoice":
      return `to=${proposal.to.value}@${proposal.to.cite}`;
    case "hold":
      return "";
  }
}

function describeVerdict(verdict: Verdict): string {
  if (verdict.kind === "allow") return "allow";
  return `${verdict.kind} ${verdict.hits.map((h) => `rule=${h.rule} reason="${h.reason}"`).join(" ")}`;
}
