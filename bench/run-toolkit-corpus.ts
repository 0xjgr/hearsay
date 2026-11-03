import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { runToolLoop } from "../agent/tool-loop.ts";
import { locateLedger } from "../ledger/ledger-file.ts";
import { guardToolkit } from "../paypal/guard-toolkit.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { buildCorpus } from "./build-corpus.ts";
import { openCorpusToolkit } from "./corpus-toolkit.ts";
import { loadStore } from "./load-fixture.ts";
import { readToolkitRuns, scoreToolkitRun, type ToolkitRun } from "./toolkit-run.ts";

// usage: pnpm bench:toolkit [--guard] [--resume] [--only <id part>]
// the plain toolkit agent from `pnpm guard-agent` works every corpus case, bare or behind
// guardToolkit; paypal is played by the corpus, so nothing reaches the sandbox
const endpoint = readModelEndpoint(process.env);
const guard = process.argv.includes("--guard");
const only = readFlag(process.argv, "--only");
const store = loadStore();
const ledger = locateLedger("toolkit");

const isSameConfig = (r: ToolkitRun) => r.model === endpoint.model && r.reasoning === endpoint.reasoning && r.guard === guard;
// note: a run lost to a dead model server is not a result, so resume works it again
const isEndpointDown = (error: string | undefined) => error?.startsWith("model endpoint failed") === true;
const done = new Set(
  process.argv.includes("--resume") ? readToolkitRuns(ledger).filter((r) => isSameConfig(r) && !isEndpointDown(r.error)).map((r) => r.caseId) : [],
);
const cases = buildCorpus().filter((k) => (only === undefined || k.id.includes(only)) && !done.has(k.id));
console.log(`[bench-toolkit] model=${endpoint.model} reasoning=${endpoint.reasoning} guard=${guard} cases=${cases.length} skipped=${done.size}`);

for (const [n, corpusCase] of cases.entries()) {
  const disputeId = String((corpusCase.dispute as { dispute_id: string }).dispute_id);
  const paypal = openCorpusToolkit(corpusCase.dispute);
  const tools = guard ? guardToolkit(paypal.caller, { disputeId, store, grants: new GrantBook() }) : paypal.caller;
  const started = performance.now();
  const loop = await runToolLoop(tools, endpoint, `Resolve PayPal dispute ${disputeId}.`, () => {});
  if (!loop.ok && isEndpointDown(loop.error)) {
    console.log(`[bench-toolkit] stop case=${corpusCase.id} error=${JSON.stringify(loop.error)}`);
    process.exit(1);
  }
  const run: ToolkitRun = {
    id: randomUUID(),
    at: new Date().toISOString(),
    caseId: corpusCase.id,
    model: endpoint.model,
    reasoning: endpoint.reasoning,
    guard,
    steps: loop.steps,
    sent: paypal.sent,
    ...(loop.ok ? { answer: loop.answer } : { error: loop.error }),
    seconds: (performance.now() - started) / 1000,
  };
  mkdirSync(dirname(ledger), { recursive: true });
  appendFileSync(ledger, JSON.stringify(run) + "\n");
  const writes = loop.steps.filter((s) => !/^(get|list|show)_/.test(s.tool)).map((s) => s.tool);
  console.log(
    `[bench-toolkit] ${n + 1}/${cases.length} ${corpusCase.id} writes=${writes.join(",") || "none"} sent=${paypal.sent.length} outcome=${scoreToolkitRun(run, corpusCase.label)} secs=${run.seconds.toFixed(1)}`,
  );
}

function readFlag(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}
