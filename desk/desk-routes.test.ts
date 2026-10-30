import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDispute, loadStore } from "../bench/load-fixture.ts";
import type { JudgedEntry } from "../ledger/ledger-entry.ts";
import { appendEntry } from "../ledger/ledger-file.ts";
import type { Toolkit } from "../paypal/toolkit.ts";
import { judgeProposal } from "../policy/judge-proposal.ts";
import type { Proposal } from "../policy/proposal.ts";
import { buildDocket } from "../provenance/build-docket.ts";
import { buildDeskRoutes } from "./desk-routes.ts";
import type { Desk } from "./review-dispute.ts";

const store = loadStore();
const dispute = loadDispute("dispute-inr-item-name-injected.json");
const { docket, unlisted } = buildDocket(dispute, store);
const DISPUTE = docket.disputeId;

const accept: Proposal = {
  kind: "accept_claim",
  amount: { value: "24.00", cite: "paypal:refund_details.allowed_refund_amount.value" },
  because: [{ value: "full refund without return", cite: "merchant:policy" }],
};
const leak: Proposal = { ...accept, amount: { value: "24.00", cite: "seg-1" } };

const FAKE_TOOLKIT = {
  handleToolCall: async () => ({ content: JSON.stringify(dispute) }),
  client: { getHeaders: async () => ({ "Content-Type": "application/json" }), getBaseUrl: () => "https://api-m.sandbox.paypal.com" },
} as unknown as Toolkit;

function openDesk(overrides: Partial<Desk> = {}): Desk {
  const ledgerPath = join(mkdtempSync(join(tmpdir(), "hearsay-desk-")), "live.jsonl");
  return { toolkit: FAKE_TOOLKIT, store, endpoint: { baseUrl: "http://localhost:1", model: "m", apiKey: undefined, reasoning: "low", timeoutSeconds: 5, maxTokens: 100 }, ledgerPath, send: false, frozen: new Set(), ...overrides };
}

function seedReview(desk: Desk, proposal: Proposal, id: string): JudgedEntry {
  const verdict = judgeProposal(proposal, { docket, store });
  const reason = verdict.kind === "deny" ? "denied" : "needs the owner's grant";
  return appendEntry(desk.ledgerPath, {
    id,
    at: "2026-10-28T17:00:00.000Z",
    disputeId: DISPUTE,
    run: { source: "live", model: "m", reasoning: "low", warnModel: false },
    docket,
    unlisted,
    outcome: "judged",
    proposer: "agent",
    proposal,
    verdict,
    execution: { kind: "refused", reason },
  });
}

const ID = "3f2c9d1e-0000-4000-8000-00000000000a";

async function post(desk: Desk, path: string, body?: object) {
  const response = await buildDeskRoutes(desk).request(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}

async function readStatus(desk: Desk) {
  const response = await buildDeskRoutes(desk).request(`/api/disputes/${DISPUTE}`);
  const detail = (await response.json()) as { reviews: { status: string }[] };
  return detail.reviews.map((r) => r.status);
}

afterEach(() => vi.unstubAllGlobals());

describe("desk routes", () => {
  it("shows an ask as pending until the owner decides", async () => {
    const desk = openDesk();
    seedReview(desk, accept, ID);
    expect(await readStatus(desk)).toEqual(["pending"]);
  });

  it("approves into a dry run and keeps the review open while not sending", async () => {
    const desk = openDesk();
    seedReview(desk, accept, ID);
    const approved = await post(desk, `/api/reviews/${ID}/approve`);
    expect(approved.status).toBe(201);
    expect(approved.body.execution.kind).toBe("dry-run");
    expect(await readStatus(desk)).toEqual(["approved"]);
  });

  it("sends once and refuses a second approval", async () => {
    const posted = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", posted);
    const desk = openDesk({ send: true });
    seedReview(desk, accept, ID);
    expect((await post(desk, `/api/reviews/${ID}/approve`)).body.execution.kind).toBe("sent");
    expect((await post(desk, `/api/reviews/${ID}/approve`)).status).toBe(409);
    expect(posted).toHaveBeenCalledTimes(1);
    expect(await readStatus(desk)).toEqual(["sent"]);
  });

  it("never writes to a frozen dispute, even with send on", async () => {
    const posted = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", posted);
    const desk = openDesk({ send: true, frozen: new Set([DISPUTE]) });
    seedReview(desk, accept, ID);
    expect((await post(desk, `/api/reviews/${ID}/approve`)).body.execution.kind).toBe("dry-run");
    expect(posted).not.toHaveBeenCalled();
  });

  it("does not let the owner approve a deny", async () => {
    const desk = openDesk();
    seedReview(desk, leak, ID);
    expect(await readStatus(desk)).toEqual(["denied"]);
    expect((await post(desk, `/api/reviews/${ID}/approve`)).status).toBe(409);
  });

  it("closes a review on reject", async () => {
    const desk = openDesk();
    seedReview(desk, accept, ID);
    expect((await post(desk, `/api/reviews/${ID}/reject`, { note: "buyer has the parcel" })).status).toBe(201);
    expect((await post(desk, `/api/reviews/${ID}/approve`)).status).toBe(409);
    expect(await readStatus(desk)).toEqual(["rejected"]);
  });

  it("rejects ids that could leave the disputes path", async () => {
    const desk = openDesk();
    expect((await post(desk, `/api/disputes/..%2F..%2Fpayments/reviews`, {})).status).toBe(400);
    expect((await post(desk, `/api/reviews/nope/approve`)).status).toBe(400);
    expect((await post(desk, `/api/reviews/${ID}/approve`)).status).toBe(404);
  });
});
