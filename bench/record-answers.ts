import { writeFileSync } from "node:fs";
import type { ReviewEntry } from "../ledger/ledger-entry.ts";
import { locateLedger, readLedger } from "../ledger/ledger-file.ts";
import { ANSWERS_PATH } from "./audit-bench.ts";
import { describeRun } from "./score-runs.ts";

// note: the corpus ledger is not versioned; this keeps the latest answer per configuration
// and case, which is what the score table and the render audit read
const latest = new Map<string, ReviewEntry>();
for (const entry of readLedger(locateLedger("corpus")).entries) {
  if (entry.outcome !== "judged" && entry.outcome !== "agent-error") continue;
  latest.set(`${describeRun(entry)}|${entry.disputeId}`, entry);
}
const kept = [...latest.values()].sort((a, b) => a.disputeId.localeCompare(b.disputeId) || describeRun(a).localeCompare(describeRun(b)));
writeFileSync(ANSWERS_PATH, kept.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`[bench] answers=${kept.length} configs=${new Set(kept.map(describeRun)).size}`);
