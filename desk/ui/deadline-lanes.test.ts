import { describe, expect, it } from "vitest";
import type { InboxRow } from "../list-inbox.ts";
import { assignLane, planBoard } from "./deadline-lanes.ts";

const NOW = new Date("2026-11-04T12:00:00Z");

function makeRow(overrides: Partial<InboxRow>): InboxRow {
  return {
    disputeId: "PP-R-AAA-1",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    status: "WAITING_FOR_SELLER_RESPONSE",
    amount: "24.00 USD",
    createdAt: "2026-10-25T23:00:00Z",
    updatedAt: "2026-10-26T10:00:00Z",
    dueAt: "2026-11-14T23:00:00Z",
    isStale: true,
    frozen: false,
    latest: undefined,
    pending: 0,
    ...overrides,
  };
}

describe("assignLane", () => {
  it("puts an unread dispute that waits on the seller with the agent", () => {
    expect(assignLane(makeRow({}))).toBe("agent");
  });

  it("puts a pending decision with the owner even when paypal changed since", () => {
    expect(assignLane(makeRow({ pending: 1, isStale: true }))).toBe("owner");
  });

  it("puts a read dispute that still waits on the seller with the owner", () => {
    expect(assignLane(makeRow({ isStale: false }))).toBe("owner");
  });

  it("puts a dispute without a seller deadline on the others lane", () => {
    expect(assignLane(makeRow({ status: "WAITING_FOR_BUYER_RESPONSE", dueAt: undefined }))).toBe("others");
  });

  it("closes resolved disputes", () => {
    expect(assignLane(makeRow({ status: "RESOLVED", dueAt: undefined }))).toBe("closed");
  });
});

describe("planBoard", () => {
  it("runs a bar from the opening to the seller deadline", () => {
    const [event] = planBoard([makeRow({})], NOW);
    expect(event?.startDate.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(event?.endDate.toISOString()).toBe("2026-11-14T23:00:00.000Z");
  });

  it("flags an unread dispute with under two days left", () => {
    const [event] = planBoard([makeRow({ dueAt: "2026-11-05T22:59:59Z" })], NOW);
    expect(event?.isAtRisk).toBe(true);
    expect(event?.cls).toContain("is-at-risk");
    expect(event?.name).toContain("at risk");
  });

  it("does not flag a dispute the agent already read", () => {
    const [event] = planBoard([makeRow({ dueAt: "2026-11-05T22:59:59Z", isStale: false })], NOW);
    expect(event?.isAtRisk).toBe(false);
  });

  it("ends an open dispute without a deadline at now", () => {
    const [event] = planBoard([makeRow({ status: "WAITING_FOR_BUYER_RESPONSE", dueAt: undefined })], NOW);
    expect(event?.endDate.toISOString()).toBe(NOW.toISOString());
  });
});
