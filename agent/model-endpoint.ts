import { z } from "zod";

const EndpointSchema = z.object({
  MODEL_BASE_URL: z.url().default("http://localhost:11434/v1"),
  MODEL_NAME: z.string().min(1).default("qwen3:8b"),
  MODEL_API_KEY: z.string().optional(),
  MODEL_REASONING: z.string().default("high"),
});

export type ModelEndpoint = { baseUrl: string; model: string; apiKey: string | undefined; reasoning: string };

export function readModelEndpoint(env: NodeJS.ProcessEnv): ModelEndpoint {
  const parsed = EndpointSchema.parse(env);
  return {
    baseUrl: parsed.MODEL_BASE_URL.replace(/\/$/, ""),
    model: parsed.MODEL_NAME,
    apiKey: parsed.MODEL_API_KEY || undefined,
    reasoning: parsed.MODEL_REASONING,
  };
}
