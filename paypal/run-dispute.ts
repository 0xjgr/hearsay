import { parseArgs } from "node:util";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { loadStore } from "../bench/load-fixture.ts";
import { reviewDispute } from "../desk/review-dispute.ts";
import { locateLedger } from "../ledger/ledger-file.ts";
import { openToolkit } from "./toolkit.ts";

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

const desk = {
  toolkit: openToolkit(process.env),
  store: loadStore(),
  endpoint: readModelEndpoint(process.env),
  ledgerPath: locateLedger("live"),
  send: values.send,
  frozen: new Set<string>(),
};
const reviewed = await reviewDispute(desk, { disputeId, message: values.message, warnModel: values.warn });
if (!reviewed.ok) {
  console.log(`[paypal] ${disputeId} ${reviewed.error}`);
  process.exit(1);
}
console.log(`[ledger] ${disputeId} appended id=${reviewed.entry.id} ${desk.ledgerPath}`);
if (reviewed.entry.outcome === "agent-error") process.exit(1);
