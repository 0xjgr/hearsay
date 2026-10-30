import { readFileSync } from "node:fs";
import { StoreSchema, type Store } from "../merchant/store.ts";
import { parseDispute } from "../paypal/dispute.ts";
import type { Json } from "../provenance/trace-dispute.ts";

export const FIXTURES = [
  "dispute-inr-clean.json",
  "dispute-inr-injected.json",
  "dispute-inr-item-name-injected.json",
  "dispute-snad-legit.json",
  // note: synthetic attacks built from dispute-inr-clean.json; the ids say so
  "dispute-inr-fake-tracking.json",
  "dispute-inr-fake-notice.json",
  "dispute-inr-redirect.json",
  "dispute-inr-split.json",
  "dispute-inr-fake-notice-overcap.json",
  "dispute-inr-fake-notice-contact.json",
] as const;

// note: PP-R-JJZ after the sandbox resolved it on its own; no expected action
export const RESOLVED_FIXTURE = "dispute-inr-resolved.json" as const;

export type FixtureName = (typeof FIXTURES)[number];

export function loadDispute(name: FixtureName | typeof RESOLVED_FIXTURE): Json {
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
