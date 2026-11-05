import type { ReactNode } from "react";
import type { JudgedEntry } from "../../ledger/ledger-entry.ts";
import type { CitedValue, Proposal } from "../../policy/proposal.ts";
import type { Verdict } from "../../policy/verdict.ts";
import { authorOfCitation, findSource, isSegmentId, type Docket } from "../../provenance/author.ts";
import { DESK_RULES, KIND_WORDS, labelCitation, VERDICT_WORDS } from "./plain-words.ts";
import { AuthorTag } from "./status-mark.tsx";

export function ProposalView({ entry }: { entry: JudgedEntry }) {
  return (
    <>
      <TraceView proposal={entry.proposal} docket={entry.docket} reasoning={entry.reasoning} tokens={entry.tokens} />
      <RuleList verdict={entry.verdict} />
    </>
  );
}

type TraceProps = { proposal: Proposal; docket: Docket; reasoning?: string | undefined; tokens?: number | undefined };

export function TraceView({ proposal, docket, reasoning, tokens }: TraceProps) {
  const params = namedParameters(proposal);
  return (
    <section className="trace">
      <h2 className="section-head">What the agent wants to do</h2>
      <p className="trace-kind">{KIND_WORDS[proposal.kind]}</p>
      {params.length > 0 && (
        <ol className="trace-rows">
          {params.map(([name, cited]) => (
            <TraceRow key={name} name={name} cited={cited} docket={docket} />
          ))}
        </ol>
      )}
      {proposal.kind === "send_message" && <p className="outgoing">{proposal.body}</p>}
      {proposal.kind === "send_invoice" && <p className="outgoing">{proposal.note}</p>}
      {proposal.because.length > 0 && (
        <>
          <h3 className="sub-head">Why, according to the agent</h3>
          <ol className="trace-rows">
            {proposal.because.map((cited, i) => (
              <TraceRow key={i} name="Reason" cited={cited} docket={docket} />
            ))}
          </ol>
        </>
      )}
      {reasoning && (
        <details className="reasoning">
          <summary>Model reasoning{tokens === undefined ? "" : `, ${tokens} tokens`}</summary>
          <pre>{reasoning}</pre>
        </details>
      )}
    </section>
  );
}

function TraceRow({ name, cited, docket }: { name: string; cited: CitedValue; docket: Docket }) {
  const author = authorOfCitation(cited.cite);
  const source = findSource(docket, cited.cite);
  const segmentPath = isSegmentId(cited.cite) ? docket.segments.find((s) => s.id === cited.cite)?.path : undefined;
  const isQuote = name === "Reason";
  return (
    <li className={`trace-row from-${author}`}>
      <span className="trace-name">{name}</span>
      <span className={isQuote ? "trace-value trace-value-text" : "trace-value"}>{cited.value}</span>
      <span className="trace-source">
        <span className="trace-origin">
          <span className="trace-arrow" aria-hidden="true" />
          <AuthorTag author={author} />
          <span className="trace-where">{labelCitation(cited.cite, segmentPath)}</span>
        </span>
        {source !== undefined && source.trim() !== cited.value.trim() && (
          <span className={author === "buyer" ? "trace-excerpt buyer-voice" : "trace-excerpt"}>{highlight(excerpt(source, cited.value), cited.value)}</span>
        )}
      </span>
    </li>
  );
}

export function VerdictView({ verdict }: { verdict: Verdict }) {
  return (
    <>
      <div className={`verdict-strip tone-${verdict.kind}`}>
        <strong>{VERDICT_WORDS[verdict.kind]}</strong>
        <span>{summarizeVerdict(verdict)}</span>
      </div>
      <RuleList verdict={verdict} />
    </>
  );
}

export function RuleList({ verdict }: { verdict: Verdict }) {
  const hits = verdict.kind === "allow" ? [] : verdict.hits;
  const extra = hits.filter((h) => !DESK_RULES.some((r) => r.id === h.rule));
  const failed = new Set(hits.map((h) => h.rule));
  return (
    <section className="rules">
      <h2 className="section-head">
        Rules checked <span className="section-count">{failed.size === 0 ? "all passed" : `${failed.size} of ${DESK_RULES.length + extra.length} fired`}</span>
      </h2>
      <ol className="rule-list">
        {[...DESK_RULES.filter((r) => failed.has(r.id)), ...extra.map((h) => ({ id: h.rule, checks: h.rule })), ...DESK_RULES.filter((r) => !failed.has(r.id))].map((rule) => {
          const fired = hits.filter((h) => h.rule === rule.id);
          const outcome = fired.some((h) => h.outcome === "deny") ? "deny" : fired.length > 0 ? "ask" : "pass";
          return (
            <li key={rule.id} className={`rule rule-${outcome}`}>
              <span className="rule-mark" aria-label={outcome}>{outcome === "pass" ? "Pass" : outcome === "deny" ? "Deny" : "Ask"}</span>
              <span className="rule-checks">{rule.checks}</span>
              <span className="rule-id">{rule.id}</span>
              {fired.map((h, i) => (
                <span key={i} className="rule-reason">
                  {h.reason}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function summarizeVerdict(verdict: Verdict): string {
  if (verdict.kind === "allow") return "Every value traces to PayPal or the store, so no rule fired.";
  const n = new Set(verdict.hits.map((h) => h.rule)).size;
  if (verdict.kind === "deny") return `${n === 1 ? "A rule" : `${n} rules`} stopped this before it reached PayPal.`;
  return `${n === 1 ? "A rule holds" : `${n} rules hold`} this until you decide. Nothing is sent before.`;
}

// note: long buyer messages are cut around the cited value, so the eye lands on it
function excerpt(source: string, value: string): string {
  const at = value.trim() === "" ? -1 : source.indexOf(value.trim());
  if (source.length <= 280) return source;
  if (at < 0) return `${source.slice(0, 260)}...`;
  const start = Math.max(0, at - 120);
  return `${start > 0 ? "..." : ""}${source.slice(start, at + value.length + 120)}${at + value.length + 120 < source.length ? "..." : ""}`;
}

// threat: buyer text is split into text nodes and a mark element, never rendered as markup
export function highlight(text: string, value: string): ReactNode {
  const needle = value.trim();
  const at = needle.length < 2 ? -1 : text.indexOf(needle);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{needle}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

function namedParameters(proposal: Proposal): [string, CitedValue][] {
  switch (proposal.kind) {
    case "accept_claim":
      return [["Refund", proposal.amount]];
    case "make_offer":
      return [["Offer", proposal.amount]];
    case "provide_evidence":
      return [["Tracking", proposal.trackingNumber], ["Carrier", proposal.carrier]];
    case "send_message":
      return [["To", proposal.to]];
    case "send_invoice":
      return [["To", proposal.to], ["Amount", proposal.amount]];
    case "hold":
      return [];
  }
}
