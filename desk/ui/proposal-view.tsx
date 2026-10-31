import type { JudgedEntry } from "../../ledger/ledger-entry.ts";
import type { CitedValue, Proposal } from "../../policy/proposal.ts";
import type { Verdict } from "../../policy/verdict.ts";
import { authorOfCitation, findSource, type Docket } from "../../provenance/author.ts";
import { AuthorTag } from "./status-mark.tsx";

export function ProposalView({ entry }: { entry: JudgedEntry }) {
  const { proposal, docket } = entry;
  return (
    <>
      <div className="block">
        <h2 className="pane-head">
          <span>{entry.proposer} proposes</span>
          <span className="mono proposal-kind">{proposal.kind}</span>
        </h2>
        <ol className="ruled">
          {namedParameters(proposal).map(([name, cited]) => (
            <CitedRow key={name} name={name} cited={cited} docket={docket} />
          ))}
        </ol>
        {proposal.kind === "send_message" && <p className="outgoing">{proposal.body}</p>}
        {proposal.kind === "send_invoice" && <p className="outgoing">{proposal.note}</p>}
        {proposal.because.length > 0 && (
          <>
            <h3 className="sub-head">because</h3>
            <ol className="ruled">
              {proposal.because.map((cited, i) => (
                <CitedRow key={i} name="" cited={cited} docket={docket} />
              ))}
            </ol>
          </>
        )}
        {entry.reasoning && (
          <details className="reasoning">
            <summary>agent reasoning{entry.tokens === undefined ? "" : ` (${entry.tokens} tokens)`}</summary>
            <pre>{entry.reasoning}</pre>
          </details>
        )}
      </div>
      <VerdictView verdict={entry.verdict} />
    </>
  );
}

function CitedRow({ name, cited, docket }: { name: string; cited: CitedValue; docket: Docket }) {
  const source = findSource(docket, cited.cite);
  return (
    <li className={`ruled-row${authorOfCitation(cited.cite) === "buyer" ? " row-buyer" : ""}`}>
      <AuthorTag author={authorOfCitation(cited.cite)} />
      <span className="mono ruled-key">
        {name && <span className="param-name">{name} </span>}
        {cited.cite}
      </span>
      <span className="mono ruled-value">
        {cited.value}
        {source !== undefined && source !== cited.value && <span className="ruled-path"> source: {source}</span>}
      </span>
    </li>
  );
}

export function VerdictView({ verdict }: { verdict: Verdict }) {
  return (
    <div className={`block block-${verdict.kind}`}>
      <h2 className="pane-head">
        <span>policy verdict</span>
        <span className={`verdict verdict-${verdict.kind}`}>{verdict.kind}</span>
      </h2>
      {verdict.kind === "allow" ? (
        <p className="pane-note">No rule fired.</p>
      ) : (
        <ol className="hits">
          {verdict.hits.map((hit, i) => (
            <li key={i} className="hit">
              <span className="mono hit-rule">{hit.rule}</span>
              <span className={`mark mark-${hit.outcome}`}>{hit.outcome}</span>
              <span className="hit-reason">{hit.reason}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function namedParameters(proposal: Proposal): [string, CitedValue][] {
  switch (proposal.kind) {
    case "accept_claim":
      return [["amount", proposal.amount]];
    case "make_offer":
      return [["amount", proposal.amount]];
    case "provide_evidence":
      return [["tracking", proposal.trackingNumber], ["carrier", proposal.carrier]];
    case "send_message":
      return [["to", proposal.to]];
    case "send_invoice":
      return [["to", proposal.to], ["amount", proposal.amount]];
    case "hold":
      return [];
  }
}
