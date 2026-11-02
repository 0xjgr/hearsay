import type { InboxRow } from "../list-inbox.ts";

export type Lane = "owner" | "agent" | "reviewed" | "others" | "closed";

export const LANES: { id: Lane; name: string }[] = [
  { id: "owner", name: "owner decides" },
  { id: "agent", name: "agent has not read" },
  { id: "reviewed", name: "judged, no owner step" },
  { id: "others", name: "buyer or paypal" },
  { id: "closed", name: "closed" },
];

export type BoardEvent = {
  id: string;
  resourceId: Lane;
  name: string;
  startDate: Date;
  endDate: Date;
  cls: string;
  isAtRisk: boolean;
  row: InboxRow;
};

const HOUR = 3_600_000;
// note: paypal gives the seller about ten days; two left with nothing read is a dispute about to be lost
const AT_RISK = 48 * HOUR;

export function assignLane(row: InboxRow): Lane {
  if (row.status === "RESOLVED") return "closed";
  if (row.pending > 0) return "owner";
  if (row.dueAt === undefined) return "others";
  return row.isStale ? "agent" : "reviewed";
}

export function planBoard(rows: InboxRow[], now: Date): BoardEvent[] {
  return rows.map((row) => {
    const lane = assignLane(row);
    const startDate = new Date(row.createdAt);
    const end = row.dueAt ?? (lane === "closed" ? row.updatedAt : now.toISOString());
    const endDate = new Date(Math.max(Date.parse(end), startDate.getTime() + HOUR));
    const isAtRisk = lane === "agent" && row.dueAt !== undefined && Date.parse(row.dueAt) - now.getTime() < AT_RISK;
    const verdict = row.latest?.verdict;
    const cls = [`lane-${lane}`, isAtRisk ? "is-at-risk" : "", verdict === undefined ? "" : `verdict-${verdict}`].filter((c) => c !== "").join(" ");
    return { id: row.disputeId, resourceId: lane, name: labelEvent(row, isAtRisk), startDate, endDate, cls, isAtRisk, row };
  });
}

export function spanBoard(events: BoardEvent[], now: Date): { startDate: Date; endDate: Date } {
  const starts = events.map((e) => e.startDate.getTime());
  const ends = events.map((e) => e.endDate.getTime());
  const day = 24 * HOUR;
  return {
    startDate: new Date(Math.min(now.getTime(), ...starts) - day),
    // note: labels run past short bars, so the board keeps room after the last deadline
    endDate: new Date(Math.max(now.getTime(), ...ends) + 6 * day),
  };
}

function labelEvent(row: InboxRow, isAtRisk: boolean): string {
  const due = row.dueAt === undefined ? "" : ` · due ${new Date(row.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  // note: the first rule names the verdict on the bar; the tooltip lists them all
  const rules = row.latest?.rules ?? [];
  const named = rules.length === 0 ? "" : ` ${rules[0]}${rules.length > 1 ? ` +${rules.length - 1}` : ""}`;
  const verdict = row.latest?.verdict === undefined ? "" : ` · ${row.latest.verdict}${named}`;
  // note: the owner lane already says a decision waits, so the bar does not repeat it
  const flags = [isAtRisk ? "at risk" : "", row.frozen ? "frozen" : ""].filter((f) => f !== "");
  return `${row.disputeId} · ${row.amount ?? "-"}${due}${verdict}${flags.length > 0 ? ` · ${flags.join(" · ")}` : ""}`;
}
