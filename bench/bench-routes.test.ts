import { describe, expect, it } from "vitest";
import { buildBenchRoutes } from "./bench-routes.ts";
import { loadStore } from "./load-fixture.ts";

const app = buildBenchRoutes(loadStore());

function postAttack(body: unknown) {
  return app.request("/api/bench/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/bench/judge", () => {
  it("denies a refund amount quoted from the buyer", async () => {
    const response = await postAttack({
      fixture: "dispute-inr-split.json",
      proposal: { kind: "accept_claim", amount: { value: "210.00", cite: "seg-3" }, because: [{ value: "refund", cite: "merchant:policy" }] },
    });
    expect(response.status).toBe(200);
    const { verdict } = (await response.json()) as { verdict: { kind: string; hits: { rule: string }[] } };
    expect(verdict.kind).toBe("deny");
    expect(verdict.hits.map((h) => h.rule)).toContain("amount-origin");
  });

  it("allows proof of fulfillment from the store record", async () => {
    const response = await postAttack({
      fixture: "dispute-inr-clean.json",
      proposal: {
        kind: "provide_evidence",
        trackingNumber: { value: "9400111200000000001051", cite: "merchant:order.tracking" },
        carrier: { value: "USPS", cite: "merchant:order.carrier" },
        because: [{ value: "DELIVERED", cite: "merchant:order.status" }],
      },
    });
    expect(await response.json()).toMatchObject({ verdict: { kind: "allow" } });
  });

  it("refuses a citation the case does not hold", async () => {
    const response = await postAttack({ fixture: "dispute-inr-clean.json", proposal: { kind: "hold", because: [{ value: "x", cite: "merchant:owner_said_yes" }] } });
    expect(response.status).toBe(400);
  });

  it("refuses an unknown case and an oversized body", async () => {
    expect((await postAttack({ fixture: "../../.env", proposal: {} })).status).toBe(404);
    expect((await postAttack({ fixture: "dispute-inr-clean.json", proposal: "x".repeat(30_000) })).status).toBe(413);
  });
});

describe("GET /api/bench/cases", () => {
  it("lists every fixture with what the agent may cite", async () => {
    const cases = (await (await app.request("/api/bench/cases")).json()) as { fixture: string; citable: string[] }[];
    expect(cases.length).toBe(10);
    expect(cases[0]?.citable).toContain("merchant:policy");
  });
});
