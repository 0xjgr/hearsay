import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDispute, loadStore } from "../bench/load-fixture.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import type { LedgerEntry } from "./ledger-entry.ts";
import { appendEntry, readLedger } from "./ledger-file.ts";

const store = loadStore();
const { docket, unlisted } = buildDocket(loadDispute("dispute-inr-item-name-injected.json"), store);
const run = { source: "fixture", model: "qwen3:8b", reasoning: "high", warnModel: false } as const;

function judgedEntry(proposal: Proposal): LedgerEntry {
  return {
    at: "2026-10-28T17:00:00.000Z",
    disputeId: docket.disputeId,
    run,
    docket,
    unlisted,
    outcome: "judged",
    proposer: "agent",
    proposal,
    verdict: judgeProposal(proposal, { docket, store }),
    execution: { kind: "refused", reason: "needs the owner's grant" },
    seconds: 12.5,
    tokens: 2210,
  };
}

function openLedger(): string {
  return join(mkdtempSync(join(tmpdir(), "hearsay-ledger-")), "nested", "runs.jsonl");
}

describe("ledger file", () => {
  const accept: Proposal = {
    kind: "accept_claim",
    amount: { value: "24.00", cite: "paypal:refund_details.allowed_refund_amount.value" },
    because: [{ value: "24.00", cite: "paypal:dispute_amount.value" }],
  };

  it("reads back what it appended, in order", () => {
    const path = openLedger();
    const first = judgedEntry(accept);
    const second: LedgerEntry = { at: first.at, disputeId: docket.disputeId, run, docket, unlisted, outcome: "agent-error", error: "answer off schema", seconds: 3 };
    appendEntry(path, first);
    appendEntry(path, second);
    expect(readLedger(path)).toEqual({ entries: [first, second], broken: [] });
  });

  it("keeps the hits of a non-allow verdict", () => {
    const path = openLedger();
    appendEntry(path, judgedEntry(accept));
    const [entry] = readLedger(path).entries;
    expect(entry?.outcome === "judged" && entry.verdict.kind).not.toBe("allow");
  });

  it("reports a torn last line instead of failing", () => {
    const path = openLedger();
    appendEntry(path, judgedEntry(accept));
    appendFileSync(path, '{"at":"2026-10-28T17:0');
    const read = readLedger(path);
    expect(read.entries).toHaveLength(1);
    expect(read.broken.map((b) => b.line)).toEqual([2]);
  });

  it("returns nothing for a ledger not written yet", () => {
    expect(readLedger(join(tmpdir(), "hearsay-missing.jsonl"))).toEqual({ entries: [], broken: [] });
  });
});
