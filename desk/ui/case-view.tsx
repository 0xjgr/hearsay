import { useCallback, useEffect, useState } from "react";
import type { InboxRow } from "../list-inbox.ts";
import { fetchDetail, requestReview, type DisputeDetail, type Fetched } from "./desk-api.ts";
import { ReviewPanel } from "./review-panel.tsx";
import { formatClock, labelReason, StatusMark } from "./status-mark.tsx";

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

  return (
    <main className="case">
      <section className="case-head">
        <h1 className="mono">{disputeId}</h1>
        {row && (
          <p className="case-facts">
            <span>{labelReason(row.reason)}</span>
            <span className="mono">{row.amount ?? "-"}</span>
            <span className="mono">{row.status.toLowerCase().replaceAll("_", " ")}</span>
            {detail?.ok && detail.value.frozen && <span className="mark mark-quiet">frozen: never written to</span>}
          </p>
        )}
        <div className="case-actions">
          <button className="button button-primary" disabled={running !== undefined} onClick={() => void runReview()}>
            run agent
          </button>
          <input
            className="message-draft"
            placeholder="or write a message to the buyer; policy judges it like the agent's"
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="button" disabled={running !== undefined || draft.trim() === ""} onClick={() => void runReview(draft.trim())}>
            propose message
          </button>
        </div>
        {running && <RunningNote since={running.since} by={running.by} />}
        {runError && <p className="pane-error">{runError}</p>}
      </section>

      {detail === undefined && <p className="pane-note">Reading the ledger...</p>}
      {detail?.ok === false && <p className="pane-note pane-error">{detail.error}</p>}
      {detail?.ok && reviews.length === 0 && <p className="pane-note">No reviews yet. Run the agent to read this dispute.</p>}

      {reviews.length > 1 && (
        <nav className="history">
          {reviews.map((s) => (
            <button
              key={s.review.id}
              className={`history-item${s === shown ? " is-selected" : ""}`}
              onClick={() => setShownId(s.review.id)}
            >
              <span className="mono">{formatClock(s.review.at)}</span>
              <span>{s.review.outcome === "judged" ? `${s.review.proposer} ${s.review.proposal.kind}` : "agent error"}</span>
              <StatusMark status={s.status} />
            </button>
          ))}
        </nav>
      )}

      {shown && <ReviewPanel key={shown.review.id} state={shown} onDecided={reload} />}
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
  const what = by === "agent" ? "agent reading the docket" : "judging the message";
  return <p className="pane-note mono">{`${what}... ${seconds} s`}</p>;
}
