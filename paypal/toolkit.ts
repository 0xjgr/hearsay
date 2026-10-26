import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { z } from "zod";
import type { Json } from "../provenance/trace-dispute.ts";
import { parseDispute, type ParsedDispute } from "./dispute.ts";

const CredentialsSchema = z.object({ PAYPAL_CLIENT_ID: z.string().min(1), PAYPAL_CLIENT_SECRET: z.string().min(1) });

export type Toolkit = PayPalAgentToolkit;

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

export async function fetchDispute(toolkit: Toolkit, disputeId: string): Promise<ParsedDispute> {
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
