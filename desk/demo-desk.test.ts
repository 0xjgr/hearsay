import { expect, it } from "vitest";
import { RECORDED_PATH } from "../bench/bench-cases.ts";
import { buildCorpus } from "../bench/build-corpus.ts";
import { loadStore } from "../bench/load-fixture.ts";
import type { ReviewEntry } from "../ledger/ledger-entry.ts";
import { readLedger } from "../ledger/ledger-file.ts";
import { buildDemoDesk } from "./demo-desk.ts";
import { listInbox } from "./list-inbox.ts";

const store = loadStore();
const recorded = readLedger(RECORDED_PATH).entries.filter((e): e is ReviewEntry => e.outcome === "judged" || e.outcome === "agent-error");
const now = new Date("2026-12-05T10:00:00Z");
const demo = buildDemoDesk(buildCorpus(), recorded, store, now);

it("finds a recorded run for every demo case", () => {
  expect(demo.listed.length).toBe(10);
  expect(demo.entries.length + demo.unread.length).toBe(10);
});

it("keeps one case unread for the judge to run", () => {
  const inbox = listInbox(demo.listed, demo.entries, new Set());
  expect(inbox.filter((row) => row.isStale).map((row) => row.disputeId)).toEqual(demo.unread.map((e) => e.disputeId));
});

it("puts every open deadline after today, whenever the demo is opened", () => {
  const due = demo.listed.flatMap((d) => (d.seller_response_due_date === undefined ? [] : [Date.parse(d.seller_response_due_date)]));
  expect(due.length).toBeGreaterThan(0);
  expect(due.every((t) => t > now.getTime())).toBe(true);
});

it("shows the shifted dates in the docket too", () => {
  for (const entry of demo.entries) {
    const opened = entry.docket.facts.find((f) => f.key === "paypal:create_time")?.value;
    expect(opened).toBe(demo.listed.find((d) => d.dispute_id === entry.disputeId)?.create_time);
  }
});

it("never claims a write reached paypal", () => {
  const kinds = [...demo.entries, ...demo.unread].flatMap((e) => (e.outcome === "judged" ? [e.execution.kind] : []));
  expect(kinds.filter((k) => k === "sent" || k === "failed")).toEqual([]);
});
