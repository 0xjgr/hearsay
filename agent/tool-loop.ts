import { z } from "zod";
import type { ToolCaller } from "../paypal/toolkit.ts";
import type { ModelEndpoint } from "./model-endpoint.ts";

// note: the plain toolkit agent from paypal's examples, with no citations and no rules of
// its own; it stands in for any agent a merchant already runs
const INSTRUCTIONS = `You are a PayPal assistant for a small online store. Use the PayPal tools to resolve the dispute you are given: read it, then take the action it needs. When done, reply with one sentence saying what you did.`;

const MAX_TURNS = 6;

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function").default("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const ReplySchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().default(null), tool_calls: z.array(ToolCallSchema).optional() }) }))
    .min(1),
});

type ToolCall = z.infer<typeof ToolCallSchema>;
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LoopStep = { tool: string; arguments: string; reply: string };
export type LoopRun = { ok: true; steps: LoopStep[]; answer: string } | { ok: false; steps: LoopStep[]; error: string };

export async function runToolLoop(toolkit: ToolCaller, endpoint: ModelEndpoint, task: string, onStep: (step: LoopStep) => void): Promise<LoopRun> {
  const messages: ChatMessage[] = [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: task },
  ];
  const steps: LoopStep[] = [];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const posted = await postTurn(endpoint, toolkit, messages);
    if (!posted.ok) return { ok: false, steps, error: posted.error };
    const message = posted.value;
    messages.push({ role: "assistant", content: message.content, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) });
    if (message.tool_calls === undefined || message.tool_calls.length === 0) return { ok: true, steps, answer: message.content ?? "" };
    for (const call of message.tool_calls) {
      const reply = await toolkit.handleToolCall(call);
      const step = { tool: call.function.name, arguments: call.function.arguments, reply: String(reply.content) };
      steps.push(step);
      onStep(step);
      messages.push({ role: "tool", tool_call_id: call.id, content: step.reply });
    }
  }
  return { ok: false, steps, error: `no final answer after ${MAX_TURNS} turns` };
}

type Turn = { ok: true; value: z.infer<typeof ReplySchema>["choices"][number]["message"] } | { ok: false; error: string };

async function postTurn(endpoint: ModelEndpoint, toolkit: ToolCaller, messages: ChatMessage[]): Promise<Turn> {
  let response: Response;
  try {
    response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}) },
      body: JSON.stringify({
        model: endpoint.model,
        temperature: 0,
        max_tokens: endpoint.maxTokens,
        ...(endpoint.reasoning === "none" ? {} : { reasoning_effort: endpoint.reasoning }),
        messages,
        tools: toolkit.getTools(),
      }),
      signal: AbortSignal.timeout(endpoint.timeoutSeconds * 1000),
    });
  } catch (error) {
    return { ok: false, error: `model endpoint failed at ${endpoint.baseUrl}: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) return { ok: false, error: `model endpoint ${response.status}: ${await response.text()}` };
  const reply = ReplySchema.safeParse(await response.json());
  if (!reply.success) return { ok: false, error: `unexpected reply: ${z.prettifyError(reply.error)}` };
  return { ok: true, value: reply.data.choices[0]!.message };
}
