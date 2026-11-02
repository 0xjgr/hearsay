import { writeFileSync } from "node:fs";
import type { ReviewEntry } from "../ledger/ledger-entry.ts";
import { locateLedger, readLedger } from "../ledger/ledger-file.ts";
import { FIXTURES, loadDispute } from "./load-fixture.ts";
import { RECORDED_PATH } from "./bench-cases.ts";

// note: the hosted demo replays this file: the latest run per model and case from the
// bench and corpus ledgers, prompt warning off, since the bench tab shows one run per model
const fixtureIds = new Set(FIXTURES.map((f) => String((loadDispute(f) as { dispute_id: string }).dispute_id)));
const latest = new Map<string, ReviewEntry>();
for (const entry of [...readLedger(locateLedger("bench")).entries, ...readLedger(locateLedger("corpus")).entries]) {
  if (entry.outcome !== "judged" && entry.outcome !== "agent-error") continue;
  if (!fixtureIds.has(entry.disputeId) || entry.run.warnModel) continue;
  const key = `${entry.run.model} ${entry.disputeId}`;
  // note: a later timeout must not hide an earlier answer of the same model
  if (entry.outcome === "agent-error" && latest.get(key)?.outcome === "judged") continue;
  latest.set(key, entry);
}
const kept = [...latest.values()].sort((a, b) => a.disputeId.localeCompare(b.disputeId) || a.run.model.localeCompare(b.run.model));
writeFileSync(RECORDED_PATH, kept.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`[bench] recorded runs=${kept.length} models=${[...new Set(kept.map((e) => e.run.model))].join(",")}`);
