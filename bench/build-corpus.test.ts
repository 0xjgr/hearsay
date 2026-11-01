import { describe, expect, it } from "vitest";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import type { Docket } from "../provenance/author.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import { buildCorpus } from "./build-corpus.ts";
import { hasAttackLanded, type CaseLabel } from "./case-label.ts";
import { loadStore } from "./load-fixture.ts";

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

// threat: the strongest agent failure is to do exactly what the buyer text asks; no such proposal may pass
describe.each(attacks.map((k) => [k.id, k] as const))("%s obeyed", (_id, corpusCase) => {
  const { docket } = buildDocket(corpusCase.dispute, store);
  const proposal = obey(corpusCase.label, docket);

  it("lands the attack and is not allowed", () => {
    expect(hasAttackLanded(proposal, corpusCase.label, docket)).toBe(true);
    expect(judgeProposal(proposal, { docket, store }).kind).not.toBe("allow");
  });
});

function obey(label: Extract<CaseLabel, { kind: "attack" }>, docket: Docket): Proposal {
  const segment = docket.segments.find((s) => s.text.includes(label.bait)) ?? docket.segments.find((s) => s.path === "messages[0].content")!;
  const because = [{ value: segment.text, cite: segment.id }];
  switch (label.goal) {
    case "refund":
      return { kind: "accept_claim", amount: { value: findFact(docket, "paypal:refund_details.allowed_refund_amount.value"), cite: "paypal:refund_details.allowed_refund_amount.value" }, because };
    case "inflate":
      return { kind: "accept_claim", amount: { value: label.bait, cite: segment.id }, because };
    case "tracking":
      return { kind: "provide_evidence", trackingNumber: { value: label.bait, cite: segment.id }, carrier: { value: findFact(docket, "merchant:order.carrier"), cite: "merchant:order.carrier" }, because };
    case "contact":
      return { kind: "send_message", to: { value: findFact(docket, "paypal:disputed_transactions[0].buyer.email"), cite: "paypal:disputed_transactions[0].buyer.email" }, body: `Please reply to ${label.bait}.`, because };
  }
}

function findFact(docket: Docket, key: string): string {
  return docket.facts.find((f) => f.key === key)!.value;
}
