import { useCallback, useEffect, useState } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { fetchDetail, requestReview, type DisputeDetail, type Fetched } from "./desk-api.ts";
import { describeDue, formatClock, KIND_WORDS, labelReason } from "./plain-words.ts";
import { ReviewPanel } from "./review-panel.tsx";
import { StatusMark } from "./status-mark.tsx";

type CaseProps = { disputeId: string; row: InboxRow | undefined; onLedgerChange: () => void };

export function CaseView({ disputeId, row, onLedgerChange }: CaseProps) {
  const [detail, setDetail] = useState<Fetched<DisputeDetail> | undefined>(undefined);
  const [shownId, setShownId] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState<{ since: number; by: "agent" | "operator" } | undefined>(undefined);
  const [runError, setRunError] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");

  const reload = useCallback(async () => {
    const fetched = await fetchDetail(disputeId);
    setDetail(fetched);
    onLedgerChange();
  }, [disputeId, onLedgerChange]);

  useEffect(() => {
    void fetchDetail(disputeId).then(setDetail);
  }, [disputeId]);

  async function runReview(message?: string) {
    setRunError(undefined);
    setRunning({ since: Date.now(), by: message === undefined ? "agent" : "operator" });
    const reviewed = await requestReview(disputeId, message);
    setRunning(undefined);
    if (!reviewed.ok) return setRunError(reviewed.error);
    if (message !== undefined) setDraft("");
    setShownId(reviewed.value.id);
    await reload();
  }

  const reviews = detail?.ok ? detail.value.reviews : [];
  const shown = reviews.find((s) => s.review.id === shownId) ?? reviews.at(-1);
  const due = row && row.status !== "RESOLVED" ? describeDue(row.dueAt, new Date()) : undefined;

  return (
    <main className="case">
      <header className="case-head">
        <div className="case-title">
          <h1>{row ? `${labelReason(row.reason)}, ${row.amount ?? "no amount"}` : disputeId}</h1>
          <p className="case-sub">
            <span className="case-id">{disputeId}</span>
            {row && <span>{row.status === "RESOLVED" ? "Closed by PayPal" : row.status === "WAITING_FOR_SELLER_RESPONSE" ? "PayPal is waiting for your answer" : labelReason(row.status)}</span>}
            {due && <span className={due.isUrgent ? "is-urgent" : ""}>{due.text}</span>}
            {detail?.ok && detail.value.frozen && <span>Frozen: the desk never writes to this one</span>}
          </p>
        </div>
        <button className="button button-primary" disabled={running !== undefined} onClick={() => void runReview()}>
          {reviews.length === 0 ? "Run the agent" : "Run the agent again"}
        </button>
      </header>

      {running && <RunningNote since={running.since} by={running.by} />}
      {runError && <p className="pane-error">{runError}</p>}
      {detail === undefined && <p className="pane-note">Reading the ledger...</p>}
      {detail?.ok === false && <p className="pane-note pane-error">{detail.error}</p>}
      {detail?.ok && reviews.length === 0 && !running && (
        <div className="empty-case">
          <p>The agent has not read this dispute yet.</p>
          <p className="pane-note">Run the agent: it reads the dispute, proposes one action and cites a source for every value. The rules then judge that proposal.</p>
        </div>
      )}

      {reviews.length > 1 && (
        <nav className="history" aria-label="Earlier proposals">
          {reviews.map((s) => (
            <button key={s.review.id} className={`history-item${s === shown ? " is-selected" : ""}`} onClick={() => setShownId(s.review.id)}>
              <span>{formatClock(s.review.at)}</span>
              <span>{s.review.outcome === "judged" ? KIND_WORDS[s.review.proposal.kind] : "Agent error"}</span>
              <StatusMark status={s.status} />
            </button>
          ))}
        </nav>
      )}

      {shown && <ReviewPanel key={shown.review.id} state={shown} onDecided={reload} />}

      <details className="own-message">
        <summary>Write to the buyer yourself</summary>
        <p className="pane-note">Your message is judged by the same rules as the agent's, before anything is sent.</p>
        <div className="own-message-row">
          <textarea className="text-input" rows={3} placeholder="Hello, your order shows as delivered on..." value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
          <button className="button" disabled={running !== undefined || draft.trim() === ""} onClick={() => void runReview(draft.trim())}>
            Check and propose
          </button>
        </div>
      </details>
    </main>
  );
}

function RunningNote({ since, by }: { since: number; by: "agent" | "operator" }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.round((now - since) / 1000);
  return <p className="running">{by === "agent" ? "The agent is reading the dispute" : "Judging your message"}... {seconds} s</p>;
}
