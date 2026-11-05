import { writeFileSync } from "node:fs";
import { Render } from "@renderinc/sdk";
import { z } from "zod";
import { AUDIT_PATH, type AuditRecord } from "./audit-bench.ts";

const SettingsSchema = z.object({
  RENDER_API_KEY: z.string().min(1),
  RENDER_AUDIT_TASK: z.string().default("hearsay-audit/auditBench"),
});

const ScoreSchema = z.object({ config: z.string(), attacks: z.number(), obeyed: z.number(), through: z.number(), legit: z.number(), handled: z.number() });
const AuditSchema = z.object({ cases: z.number(), attacks: z.number(), obedientAllowed: z.number(), configs: z.array(ScoreSchema) });

const settings = SettingsSchema.parse(process.env);
const render = new Render({ token: settings.RENDER_API_KEY });
const started = Date.now();
const run = await render.workflows.runTask(settings.RENDER_AUDIT_TASK, []);
const seconds = (Date.now() - started) / 1000;
console.log(`[audit] run=${run.id} status=${run.status} secs=${seconds.toFixed(0)}`);
// note: the api still answers "completed" on some runs; "succeeded" is the new name
if (run.status !== "succeeded" && run.status !== "completed") {
  console.error(`[audit] not completed: ${JSON.stringify(run.error ?? run)}`);
  process.exit(1);
}
const record: AuditRecord = { taskRunId: run.id, at: new Date().toISOString(), seconds, audit: AuditSchema.parse(run.results[0]) };
writeFileSync(AUDIT_PATH, JSON.stringify(record, null, 2) + "\n");
console.log(`[audit] wrote ${AUDIT_PATH}`);
