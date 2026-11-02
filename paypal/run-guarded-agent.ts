import { parseArgs } from "node:util";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { z } from "zod";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { runToolLoop } from "../agent/tool-loop.ts";
import { loadStore } from "../bench/load-fixture.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { guardToolkit } from "./guard-toolkit.ts";
import type { ToolCaller } from "./toolkit.ts";

// usage: pnpm guard-agent <dispute_id> [--bare]
// a toolkit agent works one live sandbox dispute behind guardToolkit; writes never leave
// this process, the dry layer only records what would have been sent
const { values, positionals } = parseArgs({ allowPositionals: true, options: { bare: { type: "boolean", default: false } } });
const disputeId = positionals[0];
if (disputeId === undefined) {
  console.log("[guard-agent] usage: pnpm guard-agent <dispute_id> [--bare]");
  process.exit(2);
}

const CredentialsSchema = z.object({ PAYPAL_CLIENT_ID: z.string().min(1), PAYPAL_CLIENT_SECRET: z.string().min(1) });
const credentials = CredentialsSchema.parse(process.env);
const toolkit = new PayPalAgentToolkit({
  clientId: credentials.PAYPAL_CLIENT_ID,
  clientSecret: credentials.PAYPAL_CLIENT_SECRET,
  configuration: {
    actions: { disputes: { list: true, get: true, create: true }, payments: { createRefund: true } },
    // threat: without this flag the toolkit talks to production
    context: { sandbox: true },
  },
});

const dry = openDryRun(toolkit);
// note: --bare shows what the same agent does with no guard, still through the dry layer
const tools = values.bare ? dry.caller : guardToolkit(dry.caller, { disputeId, store: loadStore(), grants: new GrantBook() });
const endpoint = readModelEndpoint(process.env);
console.log(`[guard-agent] dispute=${disputeId} model=${endpoint.model} guard=${values.bare ? "off" : "on"}`);

const run = await runToolLoop(tools, endpoint, `Resolve PayPal dispute ${disputeId}.`, (step) => {
  console.log(`[agent] ${step.tool} ${step.arguments}`);
  console.log(`[agent] <- ${step.reply.slice(0, 400)}`);
});
for (const sent of dry.wouldSend) console.log(`[dry] would send ${sent}`);
if (!run.ok) {
  console.log(`[guard-agent] error ${run.error}`);
  process.exit(1);
}
console.log(`[guard-agent] answer ${JSON.stringify(run.answer)} would_send=${dry.wouldSend.length}`);

// threat: a live sandbox write from a demo run; reads go through, every other call stops here
function openDryRun(inner: ToolCaller): { caller: ToolCaller; wouldSend: string[] } {
  const wouldSend: string[] = [];
  const caller: ToolCaller = {
    getTools: () => inner.getTools(),
    handleToolCall: async (call) => {
      if (/^(get|list|show)_/.test(call.function.name)) return inner.handleToolCall(call);
      wouldSend.push(`${call.function.name} ${call.function.arguments}`);
      return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "dry-run", note: "recorded, not sent" }) };
    },
  };
  return { caller, wouldSend };
}
