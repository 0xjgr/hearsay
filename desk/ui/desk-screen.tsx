import { useCallback, useEffect, useState } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { CaseView } from "./case-view.tsx";
import { fetchInbox, type Fetched } from "./desk-api.ts";
import { InboxTable } from "./inbox-table.tsx";

export function DeskScreen() {
  const [inbox, setInbox] = useState<Fetched<InboxRow[]> | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const refreshInbox = useCallback(async () => {
    setInbox(await fetchInbox());
  }, []);

  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox]);

  const selectedRow = inbox?.ok ? inbox.value.find((r) => r.disputeId === selectedId) : undefined;

  return (
    <div className="desk">
      <header className="masthead">
        <span className="wordmark">hearsay</span>
        <span className="masthead-sub">dispute desk</span>
        <span className="legend">
          <span className="tag tag-buyer">buyer</span>
          <span className="tag tag-paypal">paypal</span>
          <span className="tag tag-merchant">merchant</span>
          <span className="legend-note">who wrote each value</span>
        </span>
      </header>
      <InboxTable inbox={inbox} selectedId={selectedId} onSelect={setSelectedId} onRefresh={refreshInbox} />
      {selectedId === undefined ? (
        <main className="case case-empty">Pick a dispute from the inbox.</main>
      ) : (
        <CaseView key={selectedId} disputeId={selectedId} row={selectedRow} onLedgerChange={refreshInbox} />
      )}
    </div>
  );
}
