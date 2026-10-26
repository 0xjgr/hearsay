import type { Fact, Segment } from "./author.ts";
import { classifyPath, toPattern } from "./authorship-map.ts";

export type Trace = {
  segments: Segment[];
  facts: Fact[];
  // note: paths that fell to buyer by default; a non-empty list means the map is stale
  unlisted: string[];
};

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export function traceDispute(dispute: Json): Trace {
  const trace: Trace = { segments: [], facts: [], unlisted: [] };
  for (const [path, value] of walkScalars(dispute, "")) {
    const { author, isListed } = classifyPath(toPattern(path));
    if (!isListed) trace.unlisted.push(path);
    if (author === "ignored") continue;
    if (author === "paypal") {
      trace.facts.push({ key: `paypal:${path}`, value });
      continue;
    }
    // note: merchant facts never come from the dispute object, only from the store
    trace.segments.push({ id: `seg-${trace.segments.length + 1}`, path, text: value });
  }
  return trace;
}

function* walkScalars(node: Json, path: string): Generator<[string, string]> {
  if (node === null) return;
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) yield* walkScalars(child, `${path}[${index}]`);
    return;
  }
  if (typeof node === "object") {
    for (const [key, child] of Object.entries(node)) yield* walkScalars(child, path ? `${path}.${key}` : key);
    return;
  }
  yield [path, String(node)];
}
