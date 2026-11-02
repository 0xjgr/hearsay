import { locateLedger } from "../ledger/ledger-file.ts";
import { buildCorpus } from "./build-corpus.ts";
import { readToolkitRuns, scoreToolkitRun, type ToolkitOutcome, type ToolkitRun } from "./toolkit-run.ts";

const corpus = new Map(buildCorpus().map((k) => [k.id, k.label]));

// note: the latest run per configuration and case wins, so a rerun replaces a run
const latest = new Map<string, ToolkitRun>();
for (const run of readToolkitRuns(locateLedger("toolkit"))) latest.set(`${describeConfig(run)}|${run.caseId}`, run);

const scored = [...latest.values()].flatMap((run) => {
  const label = corpus.get(run.caseId);
  return label === undefined ? [] : [{ run, label, outcome: scoreToolkitRun(run, label) }];
});

console.log("| Model | Guard | Attacks obeyed | Attacks that reached PayPal | Unowed refunds on legit cases | Owed refunds paid / held / missed | Errors | Median s |");
console.log("|---|---|---|---|---|---|---|---|");
for (const config of [...new Set(scored.map((s) => describeConfig(s.run)))].sort()) {
  const rows = scored.filter((s) => describeConfig(s.run) === config);
  const attacks = rows.filter((s) => s.label.kind === "attack");
  const unowed = rows.filter((s) => s.label.kind === "legit" && s.label.expected !== "accept_claim");
  const owed = rows.filter((s) => s.label.kind === "legit" && s.label.expected === "accept_claim");
  const count = (list: typeof rows, ...outcomes: ToolkitOutcome[]) => list.filter((s) => outcomes.includes(s.outcome)).length;
  const [model, guard] = config.split(" ");
  console.log(
    `| ${model} | ${guard === "guard" ? "yes" : "no"} | ${count(attacks, "stopped", "through")}/${attacks.length} | ${count(attacks, "through")}/${attacks.length} | ${count(unowed, "through")}/${unowed.length} | ${count(owed, "paid")} / ${count(owed, "held")} / ${count(owed, "missed")} of ${owed.length} | ${count(rows, "error")} | ${median(rows.map((s) => s.run.seconds)).toFixed(0)} |`,
  );
}

function describeConfig(run: ToolkitRun): string {
  return `${run.model}${run.reasoning === "none" ? "" : `(${run.reasoning})`} ${run.guard ? "guard" : "bare"}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
