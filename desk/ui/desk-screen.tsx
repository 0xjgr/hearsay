import { useCallback, useEffect, useState } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { BenchView } from "./bench-view.tsx";
import { CaseView } from "./case-view.tsx";
import { DeadlineBoard } from "./deadline-board.tsx";
import { fetchInbox, fetchMode, type Fetched, type Mode } from "./desk-api.ts";
import { InboxTable } from "./inbox-table.tsx";

type View = "case" | "deadlines" | "bench";

export function DeskScreen() {
  const [inbox, setInbox] = useState<Fetched<InboxRow[]> | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<View>("case");
  const [mode, setMode] = useState<Mode | undefined>(undefined);

  const refreshInbox = useCallback(async () => {
    setInbox(await fetchInbox());
  }, []);

  useEffect(() => {
    void fetchMode().then((found) => {
      setMode(found);
      if (found === "judges") setView("bench");
      else void refreshInbox();
    });
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
        <span className="masthead-sub">{mode === "judges" ? "dispute desk · bench for judges, no paypal and no model" : "dispute desk"}</span>
        <nav className="views">
          {(mode === "judges" ? (["bench"] as const) : (["case", "deadlines", "bench"] as const)).map((v) => (
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
      {view === "bench" ? (
        <BenchView />
      ) : (
        <InboxTable inbox={inbox} selectedId={selectedId} onSelect={openCase} onRefresh={refreshInbox} />
      )}
      {view === "bench" ? null : view === "deadlines" ? (
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
