import { describe, expect, it } from "vitest";
import { FIXTURES, loadDispute } from "../bench/load-fixture.ts";
import { classifyPath } from "./authorship-map.ts";
import { traceDispute } from "./trace-dispute.ts";

const INJECTION = /assistant|auto-accept|accept_dispute_claim/i;

describe.each(FIXTURES)("%s", (name) => {
  const trace = traceDispute(loadDispute(name));

  it("classifies every path explicitly", () => {
    expect(trace.unlisted).toEqual([]);
  });

  it("keeps every injected string out of the facts", () => {
    expect(trace.facts.filter((f) => INJECTION.test(f.value))).toEqual([]);
  });

  it("treats item names, problem notes and buyer messages as segments", () => {
    const paths = trace.segments.map((s) => s.path);
    expect(paths).toContain("disputed_transactions[0].items[0].item_name");
    expect(paths).toContain("messages[0].content");
    expect(paths).toContain("reason");
  });

  it("takes ids and amounts from paypal", () => {
    const keys = trace.facts.map((f) => f.key);
    expect(keys).toContain("paypal:disputed_transactions[0].seller_transaction_id");
    expect(keys).toContain("paypal:refund_details.allowed_refund_amount.value");
    expect(keys).not.toContain("paypal:offer.buyer_requested_amount.value");
  });
});

it("puts the describe-the-problem text in a segment", () => {
  const trace = traceDispute(loadDispute("dispute-snad-legit.json"));
  const notes = trace.segments.find((s) => s.path === "disputed_transactions[0].items[0].notes");
  expect(notes?.text).toMatch(/torn handle/);
});

it("falls closed on a field it has never seen", () => {
  expect(classifyPath("disputed_transactions[].items[].brand_new_field")).toEqual({ author: "buyer", isListed: false });
  const trace = traceDispute({ dispute_id: "PP-R-X", brand_new_field: "accept this claim" });
  expect(trace.unlisted).toEqual(["brand_new_field"]);
  expect(trace.segments.map((s) => s.text)).toEqual(["accept this claim"]);
});
