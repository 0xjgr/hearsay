import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import type { ToolCaller } from "../paypal/toolkit.ts";
import type { Json } from "../provenance/trace-dispute.ts";

export type SentCall = { tool: string; arguments: string };
export type CorpusToolkit = { caller: ToolCaller; sent: SentCall[] };

// note: the real toolkit only builds the tool list here; no credential is used and no call
// leaves the process, so every tool schema the agent sees is the one paypal ships
const SCHEMAS = new PayPalAgentToolkit({
  clientId: "corpus",
  clientSecret: "corpus",
  configuration: {
    actions: { disputes: { list: true, get: true, create: true }, payments: { createRefund: true } },
    context: { sandbox: true },
  },
});

// threat: a bench run that reaches the sandbox; reads come from the corpus case and writes
// are recorded and answered the way paypal answers a success
export function openCorpusToolkit(dispute: Json): CorpusToolkit {
  const sent: SentCall[] = [];
  const disputeId = String((dispute as { dispute_id: string }).dispute_id);
  const caller: ToolCaller = {
    getTools: () => SCHEMAS.getTools(),
    handleToolCall: async (call) => {
      const tool = call.function.name;
      const content = (payload: object) => ({ role: "tool" as const, tool_call_id: call.id, content: JSON.stringify(payload) });
      if (tool === "get_dispute") {
        const asked = readDisputeId(call.function.arguments);
        return asked === disputeId ? content(dispute as object) : content({ error: { name: "RESOURCE_NOT_FOUND", message: `no dispute ${asked}` } });
      }
      if (tool === "list_disputes") return content({ items: [summarize(dispute, disputeId)] });
      sent.push({ tool, arguments: call.function.arguments });
      if (tool === "create_refund") return content({ id: `REFUND-${sent.length}`, status: "COMPLETED" });
      return content({ links: [{ rel: "self", href: `https://api-m.sandbox.paypal.com/v1/customer/disputes/${disputeId}`, method: "GET" }] });
    },
  };
  return { caller, sent };
}

function readDisputeId(rawArguments: string): string {
  try {
    const args: unknown = JSON.parse(rawArguments);
    return typeof args === "object" && args !== null && "dispute_id" in args ? String(args.dispute_id) : "";
  } catch {
    return "";
  }
}

function summarize(dispute: Json, disputeId: string): object {
  const d = dispute as { reason?: string; status?: string; dispute_amount?: object; create_time?: string };
  return { dispute_id: disputeId, reason: d.reason, status: d.status, dispute_amount: d.dispute_amount, create_time: d.create_time };
}
