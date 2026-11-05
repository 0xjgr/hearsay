import type { InboxRow } from "../list-inbox.ts";
import type { Fetched } from "./desk-api.ts";
import { describeDue, KIND_WORDS, labelReason } from "./plain-words.ts";
import { StatusMark } from "./status-mark.tsx";
import type { ProposalKind } from "../../policy/proposal.ts";

type InboxProps = {
  inbox: Fetched<InboxRow[]> | undefined;
  selectedId: string | undefined;
  onSelect: (disputeId: string) => void;
  onRefresh: () => void;
};

type Group = { id: string; title: string; hint: string; rows: InboxRow[] };

export function InboxTable({ inbox, selectedId, onSelect, onRefresh }: InboxProps) {
  const now = new Date();
  return (
    <aside className="inbox">
      <div className="inbox-head">
        <h2>Disputes</h2>
        <button className="link-button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {inbox === undefined && <p className="pane-note">Listing disputes from PayPal...</p>}
      {inbox?.ok === false && <p className="pane-note pane-error">{inbox.error}</p>}
      {inbox?.ok && inbox.value.length === 0 && <p className="pane-note">No disputes on this account.</p>}
      {inbox?.ok &&
        groupForTriage(inbox.value).map((group) => (
          <section key={group.id} className="inbox-group">
            <h3 className="group-head">
              {group.title} <span className="group-count">{group.rows.length}</span>
            </h3>
            <p className="group-hint">{group.hint}</p>
            <ol>
              {group.rows.map((row) => (
                <li key={row.disputeId}>
                  <InboxCard row={row} now={now} isSelected={row.disputeId === selectedId} onSelect={onSelect} />
                </li>
              ))}
            </ol>
          </section>
        ))}
    </aside>
  );
}

function InboxCard({ row, now, isSelected, onSelect }: { row: InboxRow; now: Date; isSelected: boolean; onSelect: (id: string) => void }) {
  const due = row.status === "RESOLVED" ? undefined : describeDue(row.dueAt, now);
  const kind = row.latest?.kind as ProposalKind | undefined;
  return (
    <button className={`inbox-card tone-${toneOf(row)}${isSelected ? " is-selected" : ""}`} onClick={() => onSelect(row.disputeId)}>
      <span className="card-amount">{row.amount ?? "-"}</span>
      <StatusMark status={row.latest?.status} />
      <span className="card-reason">{labelReason(row.reason)}</span>
      <span className="card-id">{row.disputeId}</span>
      <span className="card-line">
        {kind === undefined ? (row.latest === undefined ? "The agent has not read it" : "The agent failed to answer") : `Agent: ${KIND_WORDS[kind].toLowerCase()}`}
      </span>
      {due && <span className={`card-due${due.isUrgent ? " is-urgent" : ""}`}>{due.text}</span>}
      {row.status === "RESOLVED" && <span className="card-due">Closed by PayPal</span>}
    </button>
  );
}

// note: what needs the owner first, then what nobody has read, then what the rules already settled
function groupForTriage(rows: InboxRow[]): Group[] {
  const byDue = (a: InboxRow, b: InboxRow) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9");
  const open = rows.filter((r) => r.status !== "RESOLVED");
  const groups: Group[] = [
    { id: "owner", title: "Needs your decision", hint: "The rules held these for you.", rows: open.filter((r) => r.pending > 0) },
    { id: "unread", title: "Not read yet", hint: "Run the agent to get a proposal.", rows: open.filter((r) => r.pending === 0 && r.latest === undefined) },
    { id: "denied", title: "Blocked by the rules", hint: "The agent was talked into something.", rows: open.filter((r) => r.pending === 0 && r.latest?.verdict === "deny") },
    { id: "settled", title: "Handled", hint: "Allowed with no owner step.", rows: open.filter((r) => r.pending === 0 && r.latest !== undefined && r.latest.verdict !== "deny") },
    { id: "closed", title: "Closed", hint: "PayPal has decided.", rows: rows.filter((r) => r.status === "RESOLVED") },
  ];
  return groups.filter((g) => g.rows.length > 0).map((g) => ({ ...g, rows: [...g.rows].sort(byDue) }));
}

function toneOf(row: InboxRow): string {
  if (row.pending > 0) return "ask";
  if (row.latest?.verdict === "deny") return "deny";
  if (row.latest === undefined) return "quiet";
  return "allow";
}
