import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { BenchView } from "./bench-view.tsx";
import { CaseView } from "./case-view.tsx";
import { fetchInbox, fetchMode, type Fetched, type Mode } from "./desk-api.ts";
import { InboxTable } from "./inbox-table.tsx";
import { JudgesTour } from "./judges-tour.tsx";
import { useRoute, type View } from "./desk-route.ts";

// note: bryntum is most of the bundle; the home page and cases load without it
const loadBoard = () => import("./deadline-board.tsx").then((m) => ({ default: m.DeadlineBoard }));
const DeadlineBoard = lazy(loadBoard);
setTimeout(() => void loadBoard(), 1500);

const VIEWS: [View, string][] = [
  ["case", "Disputes"],
  ["deadlines", "Deadlines"],
  ["bench", "Try an attack"],
];

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
          Hearsay
        </button>
        <nav className="views" aria-label="Views">
          {VIEWS.map(([v, label]) => (
            <button key={v} className={`view-tab${view === v ? " is-selected" : ""}`} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </nav>
        {mode === "judges" && <span className="demo-note">Demo with recorded runs. Nothing here reaches PayPal.</span>}
        <span className="legend" aria-label="Who wrote each value">
          <span className="tag tag-buyer">Buyer</span>
          <span className="tag tag-paypal">PayPal</span>
          <span className="tag tag-merchant">Merchant</span>
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
          <Suspense fallback={<main className="case case-empty">Loading the board...</main>}>
            <DeadlineBoard rows={inbox.value} onOpen={openCase} />
          </Suspense>
        ) : (
          <main className="case case-empty">The board needs the inbox first.</main>
        )
      ) : selectedId === undefined && mode === "judges" && inbox?.ok ? (
        <JudgesTour rows={inbox.value} onOpen={openCase} onBench={() => setView("bench")} onDeadlines={() => setView("deadlines")} />
      ) : selectedId === undefined ? (
        <main className="case case-empty">Pick a dispute on the left.</main>
      ) : (
        <CaseView key={selectedId} disputeId={selectedId} row={selectedRow} onLedgerChange={refreshInbox} />
      )}
    </div>
  );
}
