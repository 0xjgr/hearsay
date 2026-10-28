import { Hono, type Context } from "hono";
import { z } from "zod";
import { readLedger, locateLedger } from "../ledger/ledger-file.ts";
import { replayReviews } from "../ledger/review-state.ts";
import { listDisputes } from "../paypal/toolkit.ts";
import { approveReview, rejectReview, type Decided } from "./decide-review.ts";
import { listInbox } from "./list-inbox.ts";
import { reviewDispute, type Desk } from "./review-dispute.ts";

// threat: an id that walks out of the disputes path on the paypal url
const DISPUTE_ID = /^PP-[A-Z0-9-]{4,40}$/;
const REVIEW_ID = /^[0-9a-f-]{36}$/;

const ReviewBodySchema = z.object({ message: z.string().min(1).max(2000).optional(), warn: z.boolean().default(false) });
const RejectBodySchema = z.object({ note: z.string().max(500).optional() });

export function buildDeskRoutes(desk: Desk): Hono {
  const app = new Hono();

  app.get("/api/disputes", async (c) => {
    const listed = await listDisputes(desk.toolkit);
    if (!listed.ok) return c.json({ error: listed.error }, 502);
    return c.json(listInbox(listed.value, readLedger(desk.ledgerPath).entries, desk.frozen));
  });

  app.get("/api/disputes/:id", (c) => {
    const disputeId = c.req.param("id");
    if (!DISPUTE_ID.test(disputeId)) return c.json({ error: "bad dispute id" }, 400);
    const reviews = replayReviews(readLedger(desk.ledgerPath).entries).filter((s) => s.review.disputeId === disputeId);
    return c.json({ disputeId, frozen: desk.frozen.has(disputeId), reviews });
  });

  app.post("/api/disputes/:id/reviews", async (c) => {
    const disputeId = c.req.param("id");
    if (!DISPUTE_ID.test(disputeId)) return c.json({ error: "bad dispute id" }, 400);
    const body = ReviewBodySchema.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: z.prettifyError(body.error) }, 400);
    const reviewed = await reviewDispute(desk, { disputeId, message: body.data.message, warnModel: body.data.warn });
    if (!reviewed.ok) return c.json({ error: reviewed.error }, 502);
    return c.json(reviewed.entry, 201);
  });

  app.post("/api/reviews/:id/approve", async (c) => {
    const reviewId = c.req.param("id");
    if (!REVIEW_ID.test(reviewId)) return c.json({ error: "bad review id" }, 400);
    return answerDecision(c, await approveReview(desk, reviewId));
  });

  app.post("/api/reviews/:id/reject", async (c) => {
    const reviewId = c.req.param("id");
    if (!REVIEW_ID.test(reviewId)) return c.json({ error: "bad review id" }, 400);
    const body = RejectBodySchema.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: z.prettifyError(body.error) }, 400);
    return answerDecision(c, rejectReview(desk, reviewId, body.data.note));
  });

  app.get("/api/ledger/bench", (c) => c.json(readLedger(locateLedger("bench"))));

  return app;
}

function answerDecision(c: Context, decided: Decided) {
  if (decided.ok) return c.json(decided.entry, 201);
  const status = { missing: 404, conflict: 409, upstream: 502 } as const;
  return c.json({ error: decided.error }, status[decided.reason]);
}

// note: an empty or broken body reads as {}, so the schema reports what is missing
async function readJson(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
