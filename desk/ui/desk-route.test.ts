import { describe, expect, it } from "vitest";
import { readRoute, writeRoute } from "./desk-route.ts";

describe("desk route", () => {
  it("reads views and cases from the hash", () => {
    expect(readRoute("")).toEqual({ view: "case", selectedId: undefined });
    expect(readRoute("#deadlines")).toEqual({ view: "deadlines", selectedId: undefined });
    expect(readRoute("#case/PP-R-JJZ-10194523")).toEqual({ view: "case", selectedId: "PP-R-JJZ-10194523" });
    expect(readRoute("#nonsense")).toEqual({ view: "case", selectedId: undefined });
  });

  it("writes what it reads", () => {
    for (const hash of ["#bench", "#case/BENCH-FAKE-NOTICE", "#"]) expect(writeRoute(readRoute(hash))).toBe(hash);
  });
});
