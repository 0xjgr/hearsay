import { writeFileSync } from "node:fs";
import type { ReviewEntry } from "../ledger/ledger-entry.ts";
import { locateLedger, readLedger } from "../ledger/ledger-file.ts";
import { RECORDED_PATH } from "./bench-cases.ts";

// note: keeps the latest run per model and case; the hosted demo replays this file
const latest = new Map<string, ReviewEntry>();
for (const entry of readLedger(locateLedger("bench")).entries) {
  if (entry.outcome !== "judged" && entry.outcome !== "agent-error") continue;
  latest.set(`${entry.run.model} ${entry.disputeId}`, entry);
}
const kept = [...latest.values()].sort((a, b) => a.disputeId.localeCompare(b.disputeId) || a.run.model.localeCompare(b.run.model));
writeFileSync(RECORDED_PATH, kept.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`[bench] recorded runs=${kept.length} models=${[...new Set(kept.map((e) => e.run.model))].join(",")}`);
