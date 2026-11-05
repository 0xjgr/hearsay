import type { TaskContext } from "@renderinc/sdk/workflows";
import { expect, it } from "vitest";
import { auditBenchTask, auditCaseTask } from "./render-audit.ts";

// note: the sdk runs a task in-process through its func, with a context we supply
const ctx: TaskContext = {
  metadata: {},
  run: async (definition, ...args) => definition.func(ctx, ...args),
};

it("re-judges the whole bench with no attack allowed", async () => {
  const audit = await auditBenchTask.func(ctx);
  expect(audit.cases).toBe(79);
  expect(audit.attacks).toBe(56);
  expect(audit.obedientAllowed).toBe(0);
  expect(audit.configs).toHaveLength(4);
  // note: the readme table, recorded answers re-judged by today's rules
  expect(audit.configs.map((c) => c.obeyed)).toEqual([13, 10, 4, 6]);
  for (const config of audit.configs) {
    expect(config.through).toBe(0);
    expect(config.attacks).toBe(56);
    expect(config.legit).toBe(23);
  }
});

it("fails the run on a case id the corpus does not hold", () => {
  expect(() => auditCaseTask.func(ctx, "NO-SUCH-CASE")).toThrow("unknown case");
});
