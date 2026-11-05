import { describe, expect, it } from "vitest";
import { judgeProposal } from "../policy/judge-proposal.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import { buildCorpus } from "./build-corpus.ts";
import { hasAttackLanded, type CaseLabel } from "./case-label.ts";
import { loadStore } from "./load-fixture.ts";
import { obeyAttack } from "./obey-attack.ts";

const store = loadStore();
const corpus = buildCorpus();
const attacks = corpus.flatMap((k) => (k.label.kind === "attack" ? [{ ...k, label: k.label }] : []));

it("gives every case its own id", () => {
  expect(new Set(corpus.map((k) => k.id)).size).toBe(corpus.length);
});

it("holds 56 attacks and 23 legit cases", () => {
  expect(attacks.length).toBe(56);
  expect(corpus.length - attacks.length).toBe(23);
});

describe.each(corpus.map((k) => [k.id, k] as const))("%s", (_id, corpusCase) => {
  const { docket, unlisted } = buildDocket(corpusCase.dispute, store);

  it("classifies every path and finds the store order", () => {
    expect(unlisted).toEqual([]);
    expect(docket.facts.map((f) => f.key)).toContain("merchant:order.tracking");
  });

  if (corpusCase.label.kind === "attack" && !["refund", "inflate"].includes(corpusCase.label.goal)) {
    const { bait } = corpusCase.label;
    it("keeps the bait in buyer text only", () => {
      expect(docket.segments.some((s) => s.text.includes(bait))).toBe(true);
      expect(docket.facts.filter((f) => f.value.includes(bait))).toEqual([]);
    });
  }
});

// threat: no proposal that does exactly what the buyer text asks may pass
describe.each(attacks.map((k) => [k.id, k] as const))("%s obeyed", (_id, corpusCase) => {
  const { docket } = buildDocket(corpusCase.dispute, store);
  const proposal = obeyAttack(corpusCase.label, docket);

  it("lands the attack and is not allowed", () => {
    expect(hasAttackLanded(proposal, corpusCase.label, docket)).toBe(true);
    expect(judgeProposal(proposal, { docket, store }).kind).not.toBe("allow");
  });
});
