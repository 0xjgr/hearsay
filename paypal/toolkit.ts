import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { z } from "zod";
import type { Json } from "../provenance/trace-dispute.ts";
import { parseDispute, type ParsedDispute } from "./dispute.ts";

const CredentialsSchema = z.object({ PAYPAL_CLIENT_ID: z.string().min(1), PAYPAL_CLIENT_SECRET: z.string().min(1) });

export type Toolkit = PayPalAgentToolkit;
// note: what an agent loop needs, so a guard or a dry run can stand in for the toolkit
export type ToolCaller = Pick<Toolkit, "getTools" | "handleToolCall">;

export function openToolkit(env: NodeJS.ProcessEnv): Toolkit {
  const credentials = CredentialsSchema.parse(env);
  return new PayPalAgentToolkit({
    clientId: credentials.PAYPAL_CLIENT_ID,
    clientSecret: credentials.PAYPAL_CLIENT_SECRET,
    configuration: {
      actions: { disputes: { list: true, get: true } },
      // threat: without this flag the toolkit talks to production
      context: { sandbox: true },
    },
  });
}

export async function fetchDispute(toolkit: ToolCaller, disputeId: string): Promise<ParsedDispute> {
  const reply = await toolkit.handleToolCall({
    id: `get-${disputeId}`,
    type: "function",
    function: { name: "get_dispute", arguments: JSON.stringify({ dispute_id: disputeId }) },
  });
  // note: the toolkit returns errors as json text instead of throwing
  const payload: Json = JSON.parse(String(reply.content));
  if (payload !== null && typeof payload === "object" && "error" in payload) {
    return { ok: false, error: `get_dispute ${disputeId}: ${JSON.stringify(payload.error)}` };
  }
  return parseDispute(payload);
}

const ListedSchema = z.object({
  items: z
    .array(
      z.looseObject({
        dispute_id: z.string(),
        create_time: z.string(),
        update_time: z.string(),
        reason: z.string(),
        status: z.string(),
        dispute_state: z.string().optional(),
        dispute_life_cycle_stage: z.string().optional(),
        dispute_amount: z.object({ currency_code: z.string(), value: z.string() }).optional(),
        // note: present only while paypal waits on the seller
        seller_response_due_date: z.string().optional(),
      }),
    )
    .default([]),
});

export type ListedDispute = z.infer<typeof ListedSchema>["items"][number];

export type DisputeList = { ok: true; value: ListedDispute[] } | { ok: false; error: string };

// todo: pages past the first 50; the sandbox store has fewer
export async function listDisputes(toolkit: Toolkit): Promise<DisputeList> {
  const reply = await toolkit.handleToolCall({
    id: "list-disputes",
    type: "function",
    function: { name: "list_disputes", arguments: JSON.stringify({ page_size: 50 }) },
  });
  const payload: Json = JSON.parse(String(reply.content));
  if (payload !== null && typeof payload === "object" && "error" in payload) {
    return { ok: false, error: `list_disputes: ${JSON.stringify(payload.error)}` };
  }
  const listed = ListedSchema.safeParse(payload);
  if (!listed.success) return { ok: false, error: z.prettifyError(listed.error) };
  return { ok: true, value: listed.data.items };
}
