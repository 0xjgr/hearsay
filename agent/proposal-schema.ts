import { z } from "zod";
import type { Citation } from "../provenance/author.ts";
import type { Proposal } from "../policy/proposal.ts";

// note: the cite enum is built per docket, so the model can only cite what exists
export function buildAnswerSchema(citable: Citation[]): z.ZodType<Proposal> {
  return buildProposalSchema(z.enum(citable as [Citation, ...Citation[]]));
}

// note: one branch per kind, so every action carries the parameters it needs
export function buildProposalSchema(cite: z.ZodType<Citation>): z.ZodType<Proposal> {
  const cited = z.object({ value: z.string(), cite });
  const because = z.array(cited);
  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("accept_claim"), amount: cited, because }),
    z.object({ kind: z.literal("make_offer"), amount: cited, offerType: z.enum(["REFUND", "REFUND_WITH_RETURN"]), because }),
    z.object({ kind: z.literal("provide_evidence"), trackingNumber: cited, carrier: cited, because }),
    z.object({ kind: z.literal("send_message"), to: cited, body: z.string(), because }),
    z.object({ kind: z.literal("send_invoice"), to: cited, amount: cited, note: z.string(), because }),
    z.object({ kind: z.literal("hold"), because }),
  ]);
}
