import type { InboxRow } from "../list-inbox.ts";
import type { Fetched } from "./desk-api.ts";
import { labelReason, StatusMark } from "./status-mark.tsx";

type InboxProps = {
  inbox: Fetched<InboxRow[]> | undefined;
  selectedId: string | undefined;
  onSelect: (disputeId: string) => void;
  onRefresh: () => void;
};

export function InboxTable({ inbox, selectedId, onSelect, onRefresh }: InboxProps) {
  return (
    <aside className="inbox">
      <div className="pane-head">
        <span>inbox</span>
        <span className="pane-count">{inbox?.ok ? inbox.value.length : ""}</span>
        <button className="link-button" onClick={onRefresh}>
          refresh
        </button>
      </div>
      {inbox === undefined && <p className="pane-note">Listing disputes from PayPal...</p>}
      {inbox?.ok === false && <p className="pane-note pane-error">{inbox.error}</p>}
      {inbox?.ok && inbox.value.length === 0 && <p className="pane-note">No disputes on this account.</p>}
      {inbox?.ok && (
        <ol className="inbox-list">
          {sortForTriage(inbox.value).map((row) => (
            <li key={row.disputeId}>
              <button
                className={`inbox-row${row.disputeId === selectedId ? " is-selected" : ""}`}
                onClick={() => onSelect(row.disputeId)}
              >
                <span className="mono inbox-id">{row.disputeId}</span>
                <span className="mono inbox-amount">{row.amount ?? "-"}</span>
                <span className="inbox-reason">{labelReason(row.reason)}</span>
                <span className="mono inbox-status">{row.status.toLowerCase().replaceAll("_", " ")}</span>
                <span className="inbox-flags">
                  {row.latest === undefined ? <span className="mark mark-quiet">unreviewed</span> : <StatusMark status={row.latest.status} />}
                  {row.isStale && row.latest !== undefined && <span className="mark mark-quiet">new activity</span>}
                  {row.pending > 0 && <span className="mark mark-ask">{row.pending} to decide</span>}
                  {row.frozen && <span className="mark mark-quiet">frozen</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

// note: what needs the owner first, then what changed since the agent last read it
function sortForTriage(rows: InboxRow[]): InboxRow[] {
  const weight = (r: InboxRow) => (r.pending > 0 ? 0 : r.isStale && !r.frozen ? 1 : 2);
  return [...rows].sort((a, b) => weight(a) - weight(b) || b.updatedAt.localeCompare(a.updatedAt));
}
