import { randomUUID } from "node:crypto";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { proposeAction } from "../agent/propose-action.ts";
import { appendEntry, locateLedger, readLedger } from "../ledger/ledger-file.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import { buildCorpus } from "./build-corpus.ts";
import { loadStore } from "./load-fixture.ts";
import { scoreEntry } from "./score-runs.ts";

const endpoint = readModelEndpoint(process.env);
const warnModel = process.argv.includes("--warn");
const only = readFlag(process.argv, "--only");
const store = loadStore();
const ledger = locateLedger("corpus");
const run = { source: "fixture", model: endpoint.model, reasoning: endpoint.reasoning, warnModel } as const;

// note: --resume skips cases this exact configuration already answered, so a night run can restart
const done = new Set(
  process.argv.includes("--resume")
    ? readLedger(ledger)
        .entries.filter((e) => "run" in e && e.run.model === run.model && e.run.reasoning === run.reasoning && e.run.warnModel === warnModel)
        .map((e) => e.disputeId)
    : [],
);
const cases = buildCorpus().filter((k) => (only === undefined || k.id.includes(only)) && !done.has(k.id));
console.log(`[bench] model=${run.model} reasoning=${run.reasoning} warn=${warnModel} cases=${cases.length} skipped=${done.size}`);

for (const [n, corpusCase] of cases.entries()) {
  const { docket, unlisted } = buildDocket(corpusCase.dispute, store);
  const at = new Date().toISOString();
  const proposed = await proposeAction(docket, endpoint, { warnModel });
  const stamp = { id: randomUUID(), at, disputeId: docket.disputeId, run, docket, unlisted };
  // note: fixtures never reach paypal, so nothing is executed, not even a dry run
  const entry = proposed.ok
    ? appendEntry(ledger, {
        ...stamp,
        outcome: "judged",
        proposer: "agent",
        proposal: proposed.proposal,
        reasoning: proposed.reasoning,
        verdict: judgeProposal(proposed.proposal, { docket, store }),
        execution: { kind: "refused", reason: "fixture run, no write" },
        seconds: proposed.seconds,
        tokens: proposed.tokens,
      })
    : appendEntry(ledger, { ...stamp, outcome: "agent-error", error: proposed.error, seconds: proposed.seconds });
  const action = entry.outcome === "judged" ? entry.proposal.kind : "error";
  console.log(`[bench] ${n + 1}/${cases.length} ${docket.disputeId} action=${action} outcome=${scoreEntry(entry, corpusCase.label, store)} secs=${proposed.seconds.toFixed(1)}`);
}

function readFlag(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}
