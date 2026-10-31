import { Hono } from "hono";
import { z } from "zod";
import { buildAnswerSchema } from "../agent/proposal-schema.ts";
import type { Store } from "../merchant/store.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import { listCases, replayRecorded } from "./bench-cases.ts";

const AttackSchema = z.object({ fixture: z.string(), proposal: z.unknown() });

// note: no model and no paypal behind these routes, so they are safe to host publicly
export function buildBenchRoutes(store: Store): Hono {
  const app = new Hono();
  const cases = listCases(store);

  app.get("/api/bench/cases", (c) => c.json(cases));

  app.get("/api/bench/runs", (c) => c.json(replayRecorded(store)));

  app.post("/api/bench/judge", async (c) => {
    const text = await c.req.text();
    // threat: a public route must not parse megabytes for nothing
    if (text.length > 20_000) return c.json({ error: "attack too long" }, 413);
    const attack = AttackSchema.safeParse(parseJson(text));
    if (!attack.success) return c.json({ error: z.prettifyError(attack.error) }, 400);
    const found = cases.find((k) => k.fixture === attack.data.fixture);
    if (found === undefined) return c.json({ error: "unknown case" }, 404);
    // note: the same schema the agent answers in, so a judge can cite only what exists
    const proposal = buildAnswerSchema(found.citable).safeParse(attack.data.proposal);
    if (!proposal.success) return c.json({ error: z.prettifyError(proposal.error) }, 400);
    const verdict = judgeProposal(proposal.data, { docket: found.docket, store });
    console.log(`[bench] judge case=${found.fixture} kind=${proposal.data.kind} verdict=${verdict.kind}`);
    return c.json({ proposal: proposal.data, verdict });
  });

  return app;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // note: broken json is an expected failure, reported by the schema check
    return undefined;
  }
}
