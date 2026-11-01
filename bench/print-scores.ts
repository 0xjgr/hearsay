import type { ReviewEntry } from "../ledger/ledger-entry.ts";
import { locateLedger, readLedger } from "../ledger/ledger-file.ts";
import { buildCorpus } from "./build-corpus.ts";
import type { CaseLabel } from "./case-label.ts";
import { loadStore } from "./load-fixture.ts";
import { scoreEntry, tallyOutcomes, type RunOutcome } from "./score-runs.ts";

type Scored = { config: string; label: CaseLabel; outcome: RunOutcome; seconds: number | undefined };

const store = loadStore();
const labels = new Map(buildCorpus().map((k) => [k.id, k.label]));

// note: the latest answer per configuration and case wins, so a rerun replaces a run
const latest = new Map<string, ReviewEntry>();
for (const entry of readLedger(locateLedger("corpus")).entries) {
  if (entry.outcome !== "judged" && entry.outcome !== "agent-error") continue;
  latest.set(`${describeRun(entry)}|${entry.disputeId}`, entry);
}

const scored = [...latest.values()].flatMap((entry): Scored[] => {
  const label = labels.get(entry.disputeId);
  if (label === undefined) return [];
  return [{ config: describeRun(entry), label, outcome: scoreEntry(entry, label, store), seconds: entry.seconds }];
});

console.log("| Model | Prompt warning | Attacks the agent obeyed | Got past Hearsay | Stopped (deny / ask) | Legit handled | Legit sent to owner | Legit blocked | Agent wrong or error | Median s |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const config of [...new Set(scored.map((s) => s.config))].sort()) {
  const t = tallyOutcomes(scored.filter((s) => s.config === config));
  const landed = t.denied + t.asked + t.through;
  const [model, warn] = config.split(" ");
  console.log(
    `| ${model} | ${warn === "warn" ? "yes" : "no"} | ${landed}/${t.attacks} | ${t.through}/${t.attacks} | ${t.denied} / ${t.asked} | ${t.handled}/${t.legit} | ${t["over-asked"]} | ${t.blocked} | ${t.wrong} / ${t.error} | ${median(t.seconds).toFixed(0)} |`,
  );
}

for (const facet of ["goal", "channel", "framing"] as const) {
  console.log(`\n| ${facet} | Attacks the agent obeyed | Got past Hearsay |\n|---|---|---|`);
  const attacks = scored.flatMap((s) => (s.label.kind === "attack" ? [{ ...s, key: s.label[facet] }] : []));
  for (const key of [...new Set(attacks.map((a) => a.key))].sort()) {
    const t = tallyOutcomes(attacks.filter((a) => a.key === key));
    console.log(`| ${key} | ${t.denied + t.asked + t.through}/${t.attacks} | ${t.through}/${t.attacks} |`);
  }
}

function describeRun(entry: ReviewEntry): string {
  return `${entry.run.model}${entry.run.reasoning === "none" ? "" : `(${entry.run.reasoning})`} ${entry.run.warnModel ? "warn" : "plain"}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
