import { z } from "zod";
import type { Json } from "../provenance/trace-dispute.ts";

// note: only what the pipeline reads by name; everything else is walked and classified
const DisputeShape = z.looseObject({
  dispute_id: z.string(),
  disputed_transactions: z
    .array(z.looseObject({ seller_transaction_id: z.string(), buyer: z.looseObject({ email: z.email() }) }))
    .min(1),
});

export type ParsedDispute = { ok: true; value: Json } | { ok: false; error: string };

export function parseDispute(raw: unknown): ParsedDispute {
  const shape = DisputeShape.safeParse(raw);
  if (!shape.success) return { ok: false, error: z.prettifyError(shape.error) };
  const json = z.json().safeParse(raw);
  if (!json.success) return { ok: false, error: z.prettifyError(json.error) };
  return { ok: true, value: json.data };
}
