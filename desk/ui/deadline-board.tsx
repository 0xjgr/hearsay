import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/svalbard-dark.css";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";
import { BryntumScheduler } from "@bryntum/scheduler-react";
import { useMemo } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { LANES, planBoard, spanBoard, type BoardEvent } from "./deadline-lanes.ts";

type BoardProps = { rows: InboxRow[]; onOpen: (disputeId: string) => void };

export function DeadlineBoard({ rows, onOpen }: BoardProps) {
  const { events, byId, span, atRisk } = useMemo(() => {
    const now = new Date();
    const planned = planBoard(rows, now);
    const byId = new Map(planned.map((e) => [e.id, e]));
    return { events: planned, byId, span: spanBoard(planned, now), atRisk: planned.filter((e) => e.isAtRisk).length };
  }, [rows]);

  return (
    <section className="board">
      <div className="pane-head board-head">
        <span>seller response deadlines</span>
        <span className="pane-count">{events.length}</span>
        {atRisk > 0 && <span className="mark mark-ask">{atRisk} at risk: unread with under two days left</span>}
        <span className="legend-note">bars run from the opening of the dispute to the day paypal stops waiting for the seller</span>
      </div>
      <div className="board-body">
        <BryntumScheduler
          readOnly
          startDate={span.startDate}
          endDate={span.endDate}
          viewPreset="weekAndDayLetter"
          rowHeight={64}
          barMargin={8}
          eventStyle="filled"
          columns={[{ text: "lane", field: "name", width: 210 }]}
          resources={LANES}
          events={events}
          timeRangesFeature={{ showCurrentTimeLine: true }}
          eventTooltipFeature={{ template: ({ eventRecord }: { eventRecord: { id: unknown } }) => describeEvent(byId.get(String(eventRecord.id))) }}
          eventMenuFeature={false}
          scheduleMenuFeature={false}
          cellMenuFeature={false}
          headerMenuFeature={false}
          eventDragCreateFeature={false}
          // threat: labels hold paypal values; a DomConfig text node is never parsed as markup
          eventRenderer={({ eventRecord }) => ({ tag: "span", className: "board-label", text: String(eventRecord.name) })}
          onEventClick={({ eventRecord }) => onOpen(String(eventRecord.id))}
        />
      </div>
    </section>
  );
}

// threat: the tooltip template is html and the dispute id comes from paypal, so every value is escaped
function describeEvent(event: BoardEvent | undefined): string {
  if (event === undefined) return "";
  const { row } = event;
  const latest = row.latest;
  const lines = [
    `<b>${escapeHtml(row.disputeId)}</b> ${escapeHtml(row.amount ?? "")}`,
    row.dueAt === undefined ? "no seller deadline" : `seller response due ${escapeHtml(new Date(row.dueAt).toUTCString().slice(0, 22))} UTC`,
    latest === undefined ? "the agent has not read it" : `agent proposed ${escapeHtml(latest.kind ?? "nothing (error)")}`,
    latest?.verdict === undefined ? "" : `verdict ${escapeHtml(latest.verdict)}${latest.rules.length > 0 ? `: ${escapeHtml(latest.rules.join(", "))}` : ""}`,
    latest === undefined ? "" : `status ${escapeHtml(latest.status)}`,
  ];
  return lines.filter((l) => l !== "").join("<br>");
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
