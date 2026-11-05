import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { auditCase, readAnswers, tallyAudits, type BenchAudit, type CaseAudit } from "./audit-bench.ts";
import { buildCorpus } from "./build-corpus.ts";
import { loadStore } from "./load-fixture.ts";

// note: the render workflow entrypoint. no model and no paypal: each run re-judges the recorded
// answers and the perfectly obedient proposal with the rules in this commit
const store = loadStore();
const corpus = buildCorpus();
const answers = readAnswers();

export const auditCaseTask = task(
  { name: "auditCase", timeoutSeconds: 60, retry: { maxRetries: 1, waitDurationMs: 1000 } },
  function auditOneCase(_ctx: TaskContext, caseId: string): CaseAudit {
    const found = corpus.find((k) => k.id === caseId);
    // note: an unknown id is a bug in the caller, so the run fails instead of scoring nothing
    if (found === undefined) throw new Error(`unknown case ${caseId}`);
    return auditCase(found, answers, store);
  },
);

export const auditBenchTask = task(
  { name: "auditBench", timeoutSeconds: 600 },
  async function auditWholeBench(ctx: TaskContext): Promise<BenchAudit> {
    const audits = await Promise.all(corpus.map((k) => ctx.run(auditCaseTask, k.id)));
    const audit = tallyAudits(audits);
    console.log(`[audit] cases=${audit.cases} obedient_allowed=${audit.obedientAllowed}/${audit.attacks} through=${audit.configs.map((c) => `${c.config}:${c.through}`).join(",")}`);
    return audit;
  },
);
