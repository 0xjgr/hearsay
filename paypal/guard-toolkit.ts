import type { Store } from "../merchant/store.ts";
import type { GrantBook } from "../policy/grant-book.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { CitedValue, Proposal } from "../policy/proposal.ts";
import { checkContactOrigin } from "../policy/rules/contact-origin.ts";
import { checkCustomerScope } from "../policy/rules/customer-scope.ts";
import { reachVerdict, type RuleHit, type Verdict } from "../policy/verdict.ts";
import { BUYER_EMAIL, buildDocket } from "../provenance/build-docket.ts";
import { findSource, type Docket } from "../provenance/author.ts";
import { citeToolCall, isGuardedTool, type GuardedTool } from "./cite-tool-call.ts";
import { fetchDispute, type ToolCaller } from "./toolkit.ts";

type ToolCall = Parameters<ToolCaller["handleToolCall"]>[0];
type ToolReply = Awaited<ReturnType<ToolCaller["handleToolCall"]>>;

export type GuardScope = {
  // note: the one dispute the owner handed the agent; intent comes from here, not from what it read
  disputeId: string;
  store: Store;
  grants: GrantBook;
};

// note: a drop-in for PayPalAgentToolkit from @paypal/agent-toolkit/openai; the toolkit
// needs disputes.get enabled so the guard can re-read the dispute before each write
export function guardToolkit(toolkit: ToolCaller, scope: GuardScope): ToolCaller {
  return {
    getTools: () => toolkit.getTools().filter((tool) => isReadTool(tool.function.name) || isGuardedTool(tool.function.name)),
    handleToolCall: async (call) => {
      const tool = call.function.name;
      if (isReadTool(tool)) return toolkit.handleToolCall(call);
      // threat: a write tool the rules know nothing about; in toolkit 1.11.0 the actions
      // config only filters getTools, handleToolCall runs any method by name
      if (!isGuardedTool(tool)) return refuse(call, tool, `${tool} has no hearsay rules, so it is never sent`);
      return judgeCall(toolkit, scope, call, tool);
    },
  };
}

async function judgeCall(toolkit: ToolCaller, scope: GuardScope, call: ToolCall, tool: GuardedTool): Promise<ToolReply> {
  // note: judged against the dispute as paypal returns it now, not the copy the agent read
  const fresh = await fetchDispute(toolkit, scope.disputeId);
  if (!fresh.ok) return refuse(call, tool, fresh.error);
  const { docket } = buildDocket(fresh.value, scope.store);
  const cited = citeToolCall(tool, call.function.arguments, docket);
  if (!cited.ok) return refuse(call, tool, cited.error);
  const { outgoing, hits } = cited.value;
  const proposal = { ...cited.value.proposal, because: citePolicy(docket, scope.store) };
  const context = { docket, store: scope.store };
  const verdict = reachVerdict([...hits, ...listHits(judgeProposal(proposal, context)), ...checkOutgoing(outgoing, docket, scope.store)]);
  if (verdict.kind === "allow") {
    console.log(`[guard] allow tool=${tool} dispute=${docket.disputeId}`);
    return toolkit.handleToolCall(call);
  }
  // threat: a grant reused for a second refund; spent on the call it lets through
  if (verdict.kind === "ask" && scope.grants.spend(docket.disputeId, proposal)) {
    console.log(`[guard] granted tool=${tool} dispute=${docket.disputeId} rules=${listRules(verdict)}`);
    return toolkit.handleToolCall(call);
  }
  console.log(`[guard] ${verdict.kind} tool=${tool} dispute=${docket.disputeId} rules=${listRules(verdict)}`);
  // note: a hold is not a failure; shaped as an error, a toolkit agent retries it by every route it has
  if (verdict.kind === "ask") {
    return reply(call, {
      status: "held_for_owner",
      source: "hearsay",
      message: "queued for the store owner, who approves or rejects it; nothing else to do for this dispute, do not call another write tool",
      hits: verdict.hits,
      proposal,
    });
  }
  return reply(call, { error: { source: "hearsay", verdict: "deny", message: "denied by the store's rules; do not retry", hits: verdict.hits, proposal } });
}

const STORE_POLICY = "merchant:policy";

// note: the store chose to refund these reasons without asking, as a person on the desk would.
// the reason is buyer-picked, so only an exact member of paypal's list counts, never free text
// threat: a buyer who picks a covered reason in bad faith gets what the policy gives that
// reason, still capped by auto-limit and paypal's refund cap; that is a lie, not an injection
function citePolicy(docket: Docket, store: Store): CitedValue[] {
  const reason = docket.segments.find((s) => s.path === "reason")?.text;
  if (reason === undefined || !store.policy.refundReasons.includes(reason)) return [];
  return [{ value: findSource(docket, STORE_POLICY) ?? "", cite: STORE_POLICY }];
}

// note: notes reach the buyer, so they pass the same checks as a message the desk sends
function checkOutgoing(outgoing: string[], docket: Docket, store: Store): RuleHit[] {
  if (outgoing.length === 0) return [];
  const message: Proposal = {
    kind: "send_message",
    to: { value: findSource(docket, BUYER_EMAIL) ?? "", cite: BUYER_EMAIL },
    body: outgoing.join("\n"),
    because: [],
  };
  return [...checkContactOrigin(message, { docket, store }), ...checkCustomerScope(message, { docket, store })];
}

function isReadTool(name: string): boolean {
  return /^(get|list|show)_/.test(name);
}

function listHits(verdict: Verdict): RuleHit[] {
  return verdict.kind === "allow" ? [] : verdict.hits;
}

function listRules(verdict: Verdict): string {
  return verdict.kind === "allow" ? "" : [...new Set(verdict.hits.map((h) => h.rule))].join(",");
}

function refuse(call: ToolCall, tool: string, reason: string): ToolReply {
  console.log(`[guard] refuse tool=${tool} reason=${JSON.stringify(reason)}`);
  return reply(call, { error: { source: "hearsay", verdict: "deny", message: reason } });
}

// note: same shape as the toolkit's own errors, so the agent loop needs no change
function reply(call: ToolCall, payload: object): ToolReply {
  return { role: "tool", tool_call_id: call.id, content: JSON.stringify(payload) };
}
