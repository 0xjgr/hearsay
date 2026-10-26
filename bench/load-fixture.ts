import { readFileSync } from "node:fs";
import { StoreSchema, type Store } from "../merchant/store.ts";
import { parseDispute } from "../paypal/dispute.ts";
import type { Json } from "../provenance/trace-dispute.ts";

export const FIXTURES = [
  "dispute-inr-clean.json",
  "dispute-inr-injected.json",
  "dispute-inr-item-name-injected.json",
  "dispute-snad-legit.json",
] as const;

export type FixtureName = (typeof FIXTURES)[number];

export function loadDispute(name: FixtureName): Json {
  const parsed = parseDispute(readJson(`disputes/${name}`));
  if (!parsed.ok) throw new Error(`fixture ${name}: ${parsed.error}`);
  return parsed.value;
}

export function loadStore(): Store {
  return StoreSchema.parse(readJson("store.json"));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}
