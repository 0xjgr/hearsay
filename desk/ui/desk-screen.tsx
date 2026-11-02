import { useCallback, useEffect, useState } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { BenchView } from "./bench-view.tsx";
import { CaseView } from "./case-view.tsx";
import { DeadlineBoard } from "./deadline-board.tsx";
import { fetchInbox, fetchMode, type Fetched, type Mode } from "./desk-api.ts";
import { InboxTable } from "./inbox-table.tsx";
import { JudgesTour } from "./judges-tour.tsx";
import { useRoute, type View } from "./desk-route.ts";

export function DeskScreen() {
  const [inbox, setInbox] = useState<Fetched<InboxRow[]> | undefined>(undefined);
  const [{ view, selectedId }, go] = useRoute();
  const [mode, setMode] = useState<Mode | undefined>(undefined);

  const refreshInbox = useCallback(async () => {
    setInbox(await fetchInbox());
  }, []);

  useEffect(() => {
    void fetchMode().then((found) => {
      setMode(found);
      void refreshInbox();
    });
  }, [refreshInbox]);

  const selectedRow = inbox?.ok ? inbox.value.find((r) => r.disputeId === selectedId) : undefined;

  const openCase = (disputeId: string) => go({ view: "case", selectedId: disputeId });
  const setView = (next: View) => go({ view: next, selectedId: next === "case" ? selectedId : undefined });

  return (
    <div className="desk">
      <header className="masthead">
        <button className="wordmark" onClick={() => go({ view: "case", selectedId: undefined })}>
          hearsay
        </button>
        <span className="masthead-sub">{mode === "judges" ? "dispute desk · hosted demo: recorded agent runs, no paypal and no model behind it" : "dispute desk"}</span>
        <nav className="views">
          {(["case", "deadlines", "bench"] as const).map((v) => (
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
      {view === "bench" ? null : mode === undefined ? (
        // note: a case opened from the url must wait for the mode, or it asks the live desk
        <main className="case case-empty">Loading...</main>
      ) : view === "deadlines" ? (
        inbox?.ok ? (
          <DeadlineBoard rows={inbox.value} onOpen={openCase} />
        ) : (
          <main className="case case-empty">The board needs the inbox first.</main>
        )
      ) : selectedId === undefined && mode === "judges" && inbox?.ok ? (
        <JudgesTour rows={inbox.value} onOpen={openCase} onBench={() => setView("bench")} onDeadlines={() => setView("deadlines")} />
      ) : selectedId === undefined ? (
        <main className="case case-empty">Pick a dispute from the inbox.</main>
      ) : (
        <CaseView key={selectedId} disputeId={selectedId} row={selectedRow} onLedgerChange={refreshInbox} />
      )}
    </div>
  );
}
