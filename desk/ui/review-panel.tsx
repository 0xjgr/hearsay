import { useState } from "react";
import type { JudgedEntry } from "../../ledger/ledger-entry.ts";
import { canDecide, type ReviewState } from "../../ledger/review-state.ts";
import type { Execution } from "../../paypal/execute-proposal.ts";
import type { Verdict } from "../../policy/verdict.ts";
import { listParameters } from "../../policy/proposal.ts";
import { isSegmentId, type Citation } from "../../provenance/author.ts";
import { approve, reject } from "./desk-api.ts";
import { DocketView } from "./docket-view.tsx";
import { formatClock, KIND_WORDS, VERDICT_WORDS } from "./plain-words.ts";
import { RuleList, summarizeVerdict, SYMBOLS, TraceView } from "./proposal-view.tsx";

type PanelProps = { state: ReviewState; onDecided: () => Promise<void> };

export function ReviewPanel({ state, onDecided }: PanelProps) {
  const { review } = state;
  const [focused, setFocused] = useState<Citation | undefined>(undefined);
  const stamp = `${review.outcome === "judged" && review.proposer === "operator" ? "Written by you" : `Proposed by ${review.run.model}`}, ${formatClock(review.at)}${review.outcome === "judged" && review.seconds !== undefined ? `, ${review.seconds.toFixed(0)} s` : ""}`;

  if (review.outcome === "agent-error") {
    return (
      <div className="review">
        <div className="verdict-banner tone-deny">
          <span className="banner-symbol" aria-hidden="true">✕</span>
          <p className="banner-word">Agent error</p>
          <p className="banner-line">The model gave no usable answer, so nothing was proposed and nothing reached PayPal.</p>
          <p className="banner-stamp">{stamp}</p>
        </div>
        <pre className="error-text">{review.error}</pre>
        <DocketView docket={review.docket} cited={new Set()} unlisted={review.unlisted} />
      </div>
    );
  }

  const cited = new Set<Citation>(citationsOf(review));
  const focus = { cite: focused, onFocus: setFocused };
  const marks = [...listParameters(review.proposal), ...review.proposal.because].filter((v) => isSegmentId(v.cite)).map((v) => v.value);
  const banner = bannerOf(review, state);

  return (
    <div className="review">
      <div className={`verdict-banner tone-${banner.tone}`}>
        <span className="banner-symbol" aria-hidden="true">{SYMBOLS[banner.tone]}</span>
        <p className="banner-word">{banner.word}</p>
        <p className="banner-line">
          <strong>{KIND_WORDS[review.proposal.kind]}{amountOf(review)}.</strong> {state.decisions.length === 0 ? summarizeVerdict(review.verdict) : `The rules held it for you: ${heldBy(review.verdict)}.`}
        </p>
        {state.decisions.length === 0 && <ExecutionLine execution={review.execution} />}
        <DecisionBar state={state} onDecided={onDecided} />
        <p className="banner-stamp">{stamp}</p>
      </div>
      <div className="review-grid">
        <div className="review-main">
          <TraceView proposal={review.proposal} docket={review.docket} verdict={review.verdict} focus={focus} reasoning={review.reasoning} tokens={review.tokens} />
          <RuleList verdict={review.verdict} />
        </div>
        <DocketView docket={review.docket} cited={cited} unlisted={review.unlisted} marks={marks} focus={focus} />
      </div>
    </div>
  );
}

// note: once the owner decides, the banner shows the decision; the rules that fired stay below
function bannerOf(review: JudgedEntry, { decisions }: ReviewState): { tone: Verdict["kind"]; word: string } {
  const last = decisions.at(-1);
  if (last?.outcome === "approved") return { tone: "allow", word: last.execution.kind === "sent" ? "Approved and sent" : "Approved" };
  if (last?.outcome === "rejected") return { tone: "deny", word: "Rejected" };
  return { tone: review.verdict.kind, word: VERDICT_WORDS[review.verdict.kind] };
}

function heldBy(verdict: Verdict): string {
  return verdict.kind === "allow" ? "none" : verdict.hits.map((h) => h.rule).join(", ");
}

function citationsOf({ proposal }: JudgedEntry): Citation[] {
  return [...listParameters(proposal), ...proposal.because].map((v) => v.cite);
}

function amountOf({ proposal, docket }: JudgedEntry): string {
  const currency = docket.facts.find((f) => f.key === "paypal:dispute_amount.currency_code")?.value ?? "";
  if (proposal.kind === "accept_claim" || proposal.kind === "make_offer" || proposal.kind === "send_invoice") return `: ${proposal.amount.value} ${currency}`.trimEnd();
  if (proposal.kind === "provide_evidence") return `: ${proposal.trackingNumber.value}`;
  if (proposal.kind === "send_message") return ` at ${proposal.to.value}`;
  return "";
}

function ExecutionLine({ execution }: { execution: Execution }) {
  if (execution.kind === "refused") return <p className="banner-exec">Not sent to PayPal: {execution.reason}.</p>;
  if (execution.kind === "held") return <p className="banner-exec">The agent chose to wait, so there is nothing to send.</p>;
  if (execution.kind === "dry-run") return <p className="banner-exec">Demo: the request was built but not sent to PayPal.</p>;
  if (execution.kind === "failed") return <p className="banner-exec">PayPal refused POST {execution.request.path} with {execution.status}.</p>;
  return <p className="banner-exec">Sent to PayPal: POST {execution.request.path}, answered {execution.status}.</p>;
}

function describeSend(execution: Execution): string {
  if (execution.kind === "dry-run") return "re-read, re-judged and built; sending is off here, so nothing reached PayPal";
  if (execution.kind === "sent") return `sent to PayPal, answered ${execution.status}`;
  if (execution.kind === "failed") return `PayPal refused it with ${execution.status}`;
  if (execution.kind === "refused") return `not sent, ${execution.reason}`;
  return "nothing to send";
}

// note: a dry-run approval has nothing left to send; approving it again would only repeat it
function isSettledDemo({ decisions }: ReviewState): boolean {
  const last = decisions.at(-1);
  return last?.outcome === "approved" && last.execution.kind === "dry-run";
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
    <>
      {state.decisions.map((d) => (
        <p key={d.id} className="banner-exec">
          {d.outcome === "approved" ? "You approved it" : "You rejected it"} on {formatClock(d.at)}
          {d.outcome === "approved" ? `: ${describeSend(d.execution)}.` : d.note ? `: "${d.note}"` : "."}
        </p>
      ))}
      {canDecide(state.status) && !isSettledDemo(state) && (
        <div className="decision">
          {/* threat: one click must not move money; approving takes a second, deliberate one */}
          <button className="button button-approve" disabled={busy} onClick={() => (armed ? void decide("approve") : setArmed(true))}>
            {armed ? "Confirm: re-read, re-judge, send" : "Approve"}
          </button>
          <button className="button" disabled={busy} onClick={() => void decide("reject")}>
            Reject
          </button>
          <input className="text-input" placeholder="Note for the record (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      {error && <p className="pane-error">{error}</p>}
    </>
  );
}
