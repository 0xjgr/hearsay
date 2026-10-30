import { useState } from "react";
import type { JudgedEntry } from "../../ledger/ledger-entry.ts";
import { canDecide, type ReviewState } from "../../ledger/review-state.ts";
import type { Execution } from "../../paypal/execute-proposal.ts";
import { listParameters } from "../../policy/proposal.ts";
import type { Citation } from "../../provenance/author.ts";
import { approve, reject } from "./desk-api.ts";
import { DocketView } from "./docket-view.tsx";
import { ProposalView } from "./proposal-view.tsx";
import { formatClock, StatusMark } from "./status-mark.tsx";

type PanelProps = { state: ReviewState; onDecided: () => Promise<void> };

export function ReviewPanel({ state, onDecided }: PanelProps) {
  const { review } = state;
  const cited = new Set<Citation>(review.outcome === "judged" ? citationsOf(review) : []);

  return (
    <div className="review">
      <DocketView docket={review.docket} cited={cited} unlisted={review.unlisted} />
      <section className="verdict-column">
        <p className="review-stamp mono">
          {formatClock(review.at)} · {review.run.model} · reasoning {review.run.reasoning}
          {review.outcome === "judged" && review.seconds !== undefined && ` · ${review.seconds.toFixed(0)} s`}
        </p>
        {review.outcome === "agent-error" ? (
          <div className="block block-deny">
            <h2 className="pane-head">agent error</h2>
            <p className="mono">{review.error}</p>
            <p className="pane-note">Nothing was proposed, so nothing reached PayPal.</p>
          </div>
        ) : (
          <>
            <ProposalView entry={review} />
            <ExecutionView execution={review.execution} />
            <DecisionBar state={state} onDecided={onDecided} />
          </>
        )}
      </section>
    </div>
  );
}

function citationsOf({ proposal }: JudgedEntry): Citation[] {
  return [...listParameters(proposal), ...proposal.because].map((v) => v.cite);
}

function ExecutionView({ execution }: { execution: Execution }) {
  return (
    <div className="block">
      <h2 className="pane-head">
        <span>paypal</span>
        <span className="mono">{execution.kind}</span>
      </h2>
      {execution.kind === "refused" && <p>{execution.reason}</p>}
      {execution.kind === "held" && <p>The agent chose to hold; nothing to send.</p>}
      {"request" in execution && (
        <p className="mono">
          POST {execution.request.path}
          {"status" in execution && ` → ${execution.status}`}
        </p>
      )}
      {execution.kind === "dry-run" && <p className="pane-note">Dry run: the desk runs with DESK_SEND=0 or the dispute is frozen.</p>}
    </div>
  );
}

function DecisionBar({ state, onDecided }: PanelProps) {
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function decide(choice: "approve" | "reject") {
    setBusy(true);
    setError(undefined);
    const decided = choice === "approve" ? await approve(state.review.id) : await reject(state.review.id, note.trim());
    setBusy(false);
    setArmed(false);
    if (!decided.ok) return setError(decided.error);
    await onDecided();
  }

  return (
    <div className="block">
      <h2 className="pane-head">
        <span>owner</span>
        <StatusMark status={state.status} />
      </h2>
      {state.decisions.map((d) => (
        <p key={d.id} className="mono">
          {formatClock(d.at)} {d.outcome}
          {d.outcome === "approved" ? ` → ${d.execution.kind}` : d.note ? ` "${d.note}"` : ""}
        </p>
      ))}
      {canDecide(state.status) && (
        <div className="decision">
          {/* threat: one click must not move money; approving takes a second, deliberate one */}
          <button className="button button-primary" disabled={busy} onClick={() => (armed ? void decide("approve") : setArmed(true))}>
            {armed ? "confirm: re-read, re-judge, send" : "approve"}
          </button>
          <input className="message-draft" placeholder="note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <button className="button" disabled={busy} onClick={() => void decide("reject")}>
            reject
          </button>
        </div>
      )}
      {error && <p className="pane-error">{error}</p>}
    </div>
  );
}
