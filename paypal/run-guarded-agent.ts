import { parseArgs } from "node:util";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { z } from "zod";
import { readModelEndpoint } from "../agent/model-endpoint.ts";
import { runToolLoop } from "../agent/tool-loop.ts";
import { loadStore } from "../bench/load-fixture.ts";
import { GrantBook } from "../policy/grant-book.ts";
import { guardToolkit } from "./guard-toolkit.ts";
import type { ToolCaller } from "./toolkit.ts";

// usage: pnpm guard-agent <dispute_id> [--bare | --send]
// a toolkit agent works one live sandbox dispute behind guardToolkit. by default writes never
// leave this process: the dry layer only records what would have been sent. --send lets the
// writes the guard allows reach the sandbox
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { bare: { type: "boolean", default: false }, send: { type: "boolean", default: false } },
});
const disputeId = positionals[0];
if (disputeId === undefined) {
  console.log("[guard-agent] usage: pnpm guard-agent <dispute_id> [--bare | --send]");
  process.exit(2);
}

const SettingsSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  DESK_FROZEN: z.string().default(""),
});
const credentials = SettingsSchema.parse(process.env);
const frozen = credentials.DESK_FROZEN.split(",").map((id) => id.trim());
// threat: an unguarded agent with live writes, or a live write on a demo dispute
if (values.send && (values.bare || frozen.includes(disputeId))) {
  console.log(`[guard-agent] refuse --send dispute=${disputeId} ${values.bare ? "without the guard" : "is frozen for the demo"}`);
  process.exit(2);
}
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
const live = openLiveLog(toolkit);
const inner = values.send ? live.caller : dry.caller;
const tools = values.bare ? dry.caller : guardToolkit(inner, { disputeId, store: loadStore(), grants: new GrantBook() });
const endpoint = readModelEndpoint(process.env);
console.log(`[guard-agent] dispute=${disputeId} model=${endpoint.model} guard=${values.bare ? "off" : "on"} writes=${values.send ? "live" : "dry"}`);

const run = await runToolLoop(tools, endpoint, `Resolve PayPal dispute ${disputeId}.`, (step) => {
  console.log(`[agent] ${step.tool} ${step.arguments}`);
  console.log(`[agent] <- ${step.reply.slice(0, 400)}`);
});
for (const sent of dry.wouldSend) console.log(`[dry] would send ${sent}`);
if (!run.ok) {
  console.log(`[guard-agent] error ${run.error}`);
  process.exit(1);
}
const tally = values.send ? `sent=${live.sent.length}` : `would_send=${dry.wouldSend.length}`;
console.log(`[guard-agent] answer ${JSON.stringify(run.answer)} ${tally}`);

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

// note: in live mode the closing line counts what reached paypal, not what a dry run held back
function openLiveLog(inner: ToolCaller): { caller: ToolCaller; sent: string[] } {
  const sent: string[] = [];
  const caller: ToolCaller = {
    getTools: () => inner.getTools(),
    handleToolCall: async (call) => {
      if (!/^(get|list|show)_/.test(call.function.name)) sent.push(call.function.name);
      return inner.handleToolCall(call);
    },
  };
  return { caller, sent };
}
