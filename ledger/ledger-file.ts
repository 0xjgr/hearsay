import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { buildProposalSchema } from "../agent/proposal-schema.ts";
import type { Citation } from "../provenance/author.ts";
import type { LedgerEntry } from "./ledger-entry.ts";

export type LedgerName = "live" | "bench";

// note: live runs and bench runs never share a file, so the bench can be wiped
export function locateLedger(name: LedgerName): string {
  return fileURLToPath(new URL(`${name}.jsonl`, import.meta.url));
}

export function appendEntry<E extends LedgerEntry>(path: string, entry: E): E {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + "\n");
  return entry;
}

export type LedgerRead = { entries: LedgerEntry[]; broken: { line: number; error: string }[] };

// note: a crash mid-append leaves a torn last line; it is reported, not fatal
export function readLedger(path: string): LedgerRead {
  if (!existsSync(path)) return { entries: [], broken: [] };
  const read: LedgerRead = { entries: [], broken: [] };
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (line.trim() === "") return;
      const parsed = EntrySchema.safeParse(parseLine(line));
      if (parsed.success) read.entries.push(parsed.data);
      else read.broken.push({ line: index + 1, error: z.prettifyError(parsed.error) });
    });
  return read;
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    // note: torn json is the expected failure, reported by the schema check
    return undefined;
  }
}

const CitationSchema = z.string().regex(/^(paypal:.+|merchant:.+|seg-\d+)$/) as z.ZodType<Citation>;

const DocketSchema = z.object({
  disputeId: z.string(),
  segments: z.array(z.object({ id: z.string().regex(/^seg-\d+$/) as z.ZodType<`seg-${number}`>, path: z.string(), text: z.string() })),
  facts: z.array(z.object({ key: z.string().regex(/^(paypal|merchant):.+$/) as z.ZodType<`paypal:${string}` | `merchant:${string}`>, value: z.string() })),
});

const RuleHitSchema = z.object({
  rule: z.enum(["action-in-policy", "citation-mismatch", "amount-origin", "hearsay", "record-conflict", "recipient-origin", "evidence-origin", "contact-origin", "customer-scope", "auto-limit"]),
  outcome: z.enum(["ask", "deny"]),
  reason: z.string(),
});

const VerdictSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allow") }),
  z.object({ kind: z.literal("ask"), hits: z.array(RuleHitSchema) }),
  z.object({ kind: z.literal("deny"), hits: z.array(RuleHitSchema) }),
]);

const RequestSchema = z.object({
  kind: z.enum(["accept_claim", "make_offer", "provide_evidence", "send_message"]),
  path: z.string(),
  body: z.discriminatedUnion("type", [
    z.object({ type: z.literal("json"), json: z.object({}).loose() }),
    z.object({ type: z.literal("multipart-input"), input: z.object({}).loose() }),
  ]),
});

const ExecutionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("held") }),
  z.object({ kind: z.literal("refused"), reason: z.string() }),
  z.object({ kind: z.literal("dry-run"), request: RequestSchema }),
  z.object({ kind: z.literal("sent"), request: RequestSchema, status: z.number(), reply: z.string() }),
  z.object({ kind: z.literal("failed"), request: RequestSchema, status: z.number(), reply: z.string() }),
]);

const StampSchema = z.object({ id: z.string().min(1), at: z.iso.datetime(), disputeId: z.string() });

const ReviewSchema = StampSchema.extend({
  run: z.object({ source: z.enum(["live", "fixture"]), model: z.string(), reasoning: z.string(), warnModel: z.boolean() }),
  docket: DocketSchema,
  unlisted: z.array(z.string()),
});

const EntrySchema: z.ZodType<LedgerEntry> = z.discriminatedUnion("outcome", [
  ReviewSchema.extend({ outcome: z.literal("agent-error"), error: z.string(), seconds: z.number() }),
  ReviewSchema.extend({
    outcome: z.literal("judged"),
    proposer: z.enum(["agent", "operator"]),
    proposal: buildProposalSchema(CitationSchema),
    reasoning: z.string().optional(),
    verdict: VerdictSchema,
    execution: ExecutionSchema,
    seconds: z.number().optional(),
    tokens: z.number().optional(),
  }),
  StampSchema.extend({ outcome: z.literal("approved"), review: z.string(), execution: ExecutionSchema }),
  StampSchema.extend({ outcome: z.literal("rejected"), review: z.string(), note: z.string().optional() }),
]);
