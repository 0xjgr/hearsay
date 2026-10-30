import { useCallback, useEffect, useState } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { CaseView } from "./case-view.tsx";
import { DeadlineBoard } from "./deadline-board.tsx";
import { fetchInbox, type Fetched } from "./desk-api.ts";
import { InboxTable } from "./inbox-table.tsx";

type View = "case" | "deadlines";

export function DeskScreen() {
  const [inbox, setInbox] = useState<Fetched<InboxRow[]> | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<View>("case");

  const refreshInbox = useCallback(async () => {
    setInbox(await fetchInbox());
  }, []);

  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox]);

  const selectedRow = inbox?.ok ? inbox.value.find((r) => r.disputeId === selectedId) : undefined;

  function openCase(disputeId: string) {
    setSelectedId(disputeId);
    setView("case");
  }

  return (
    <div className="desk">
      <header className="masthead">
        <span className="wordmark">hearsay</span>
        <span className="masthead-sub">dispute desk</span>
        <nav className="views">
          {(["case", "deadlines"] as const).map((v) => (
            <button key={v} className={`view-tab${view === v ? " is-selected" : ""}`} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </nav>
        <span className="legend">
          <span className="tag tag-buyer">buyer</span>
          <span className="tag tag-paypal">paypal</span>
          <span className="tag tag-merchant">merchant</span>
          <span className="legend-note">who wrote each value</span>
        </span>
      </header>
      <InboxTable inbox={inbox} selectedId={selectedId} onSelect={openCase} onRefresh={refreshInbox} />
      {view === "deadlines" ? (
        inbox?.ok ? (
          <DeadlineBoard rows={inbox.value} onOpen={openCase} />
        ) : (
          <main className="case case-empty">The board needs the inbox first.</main>
        )
      ) : selectedId === undefined ? (
        <main className="case case-empty">Pick a dispute from the inbox.</main>
      ) : (
        <CaseView key={selectedId} disputeId={selectedId} row={selectedRow} onLedgerChange={refreshInbox} />
      )}
    </div>
  );
}
