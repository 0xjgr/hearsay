import type { CitedValue, Proposal } from "../../policy/proposal.ts";
import type { Verdict } from "../../policy/verdict.ts";
import { authorOfCitation, findSource, isSegmentId, type Citation, type Docket } from "../../provenance/author.ts";
import { markText } from "./mark-text.tsx";
import { DESK_RULES, KIND_WORDS, labelCitation, VERDICT_WORDS } from "./plain-words.ts";
import { AuthorTag } from "./status-mark.tsx";

export type Focus = { cite: Citation | undefined; onFocus: (cite: Citation | undefined) => void };

type TraceProps = { proposal: Proposal; docket: Docket; verdict: Verdict; focus?: Focus; reasoning?: string | undefined; tokens?: number | undefined };

export function TraceView({ proposal, docket, verdict, focus, reasoning, tokens }: TraceProps) {
  const params = namedParameters(proposal);
  return (
    <section className="trace">
      <h2 className="trace-kind">{KIND_WORDS[proposal.kind]}</h2>
      {params.length > 0 && (
        <ol className="trace-rows">
          {params.map(([name, cited]) => (
            <TraceRow key={name} name={name} cited={cited} docket={docket} cut={findCut(cited, verdict)} focus={focus} />
          ))}
        </ol>
      )}
      {proposal.kind === "send_message" && <p className="outgoing">{proposal.body}</p>}
      {proposal.kind === "send_invoice" && <p className="outgoing">{proposal.note}</p>}
      {proposal.because.length > 0 && (
        <div className="reasons">
          <h3 className="sub-head">The agent's reasons</h3>
          {proposal.because.map((cited, i) => (
            <ReasonRow key={i} cited={cited} docket={docket} focus={focus} />
          ))}
        </div>
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

function TraceRow({ name, cited, docket, cut, focus }: { name: string; cited: CitedValue; docket: Docket; cut: "ask" | "deny" | undefined; focus: Focus | undefined }) {
  const author = authorOfCitation(cited.cite);
  return (
    <li
      className={`trace-row from-${author}${cut === undefined ? "" : ` cut-${cut}`}${focus?.cite === cited.cite ? " is-focused" : ""}`}
      onMouseEnter={() => focus?.onFocus(cited.cite)}
      onMouseLeave={() => focus?.onFocus(undefined)}
    >
      <span className="trace-end">
        <span className="trace-name">{name}</span>
        <span className={cited.value.length > 16 ? "trace-value is-long" : "trace-value"}>{cited.value || "(empty)"}</span>
      </span>
      <span className="trace-wire" aria-hidden="true">
        {cut !== undefined && <span className="trace-cut">{cut === "deny" ? "✕" : "!"}</span>}
      </span>
      <span className="trace-end trace-from">
        <AuthorTag author={author} />
        <span className="trace-where">{labelCitation(cited.cite, segmentPathOf(docket, cited.cite))}</span>
      </span>
    </li>
  );
}

function ReasonRow({ cited, docket, focus }: { cited: CitedValue; docket: Docket; focus: Focus | undefined }) {
  const author = authorOfCitation(cited.cite);
  const source = findSource(docket, cited.cite);
  return (
    <details
      className={`reason from-${author}${focus?.cite === cited.cite ? " is-focused" : ""}`}
      onMouseEnter={() => focus?.onFocus(cited.cite)}
      onMouseLeave={() => focus?.onFocus(undefined)}
    >
      <summary>
        <AuthorTag author={author} />
        <span className="reason-text">{cited.value}</span>
      </summary>
      <p className="reason-source">
        Cites {labelCitation(cited.cite, segmentPathOf(docket, cited.cite)).toLowerCase()}
        {source !== undefined && source.trim() !== cited.value.trim() && <>: <span className={author === "buyer" ? "buyer-voice" : ""}>{markText(source, [])}</span></>}
      </p>
    </details>
  );
}

export function VerdictView({ verdict }: { verdict: Verdict }) {
  return (
    <>
      <div className={`verdict-banner is-compact tone-${verdict.kind}`}>
        <span className="banner-symbol" aria-hidden="true">{SYMBOLS[verdict.kind]}</span>
        <p className="banner-word">{VERDICT_WORDS[verdict.kind]}</p>
        <p className="banner-line">{summarizeVerdict(verdict)}</p>
      </div>
      <RuleList verdict={verdict} />
    </>
  );
}

export const SYMBOLS: Record<Verdict["kind"], string> = { allow: "✓", ask: "!", deny: "✕" };

export function RuleList({ verdict }: { verdict: Verdict }) {
  const hits = verdict.kind === "allow" ? [] : verdict.hits;
  const fired = [...new Set(hits.map((h) => h.rule))];
  const passed = DESK_RULES.filter((r) => !fired.includes(r.id));
  return (
    <section className="rules">
      {fired.map((id) => {
        const mine = hits.filter((h) => h.rule === id);
        const outcome = mine.some((h) => h.outcome === "deny") ? "deny" : "ask";
        return (
          <div key={id} className={`rule rule-${outcome}`}>
            <span className="rule-mark">{outcome === "deny" ? "Deny" : "Ask"}</span>
            <span className="rule-checks">{DESK_RULES.find((r) => r.id === id)?.checks ?? id}</span>
            {mine.map((h, i) => (
              <span key={i} className="rule-reason">
                {h.reason}
                <span className="rule-id">{id}</span>
              </span>
            ))}
          </div>
        );
      })}
      <details className="rules-passed">
        <summary>
          <span className="rule-mark rule-mark-pass">✓</span>
          {fired.length === 0 ? `All ${passed.length} rules passed` : `${passed.length} other rules passed`}
        </summary>
        <ol>
          {passed.map((r) => (
            <li key={r.id}>
              {r.checks} <span className="rule-id">{r.id}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function summarizeVerdict(verdict: Verdict): string {
  if (verdict.kind === "allow") return "Every value traces to PayPal or the store.";
  const n = new Set(verdict.hits.map((h) => h.rule)).size;
  if (verdict.kind === "deny") return `${n === 1 ? "A rule" : `${n} rules`} stopped it before PayPal.`;
  return `Held by ${n === 1 ? "a rule" : `${n} rules`}. Nothing is sent until you decide.`;
}

// note: a value is cut when a rule's reason names its citation or its exact value
function findCut(cited: CitedValue, verdict: Verdict): "ask" | "deny" | undefined {
  if (verdict.kind === "allow") return undefined;
  const named = verdict.hits.filter((h) => h.reason.includes(cited.cite) || (cited.value.trim().length > 2 && h.reason.includes(cited.value.trim())));
  if (named.length === 0) return undefined;
  return named.some((h) => h.outcome === "deny") ? "deny" : "ask";
}

function segmentPathOf(docket: Docket, cite: Citation): string | undefined {
  return isSegmentId(cite) ? docket.segments.find((s) => s.id === cite)?.path : undefined;
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
