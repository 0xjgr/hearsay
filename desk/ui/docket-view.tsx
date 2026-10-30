import { useState } from "react";
import { renderDocket } from "../../agent/render-docket.ts";
import type { Citation, Docket } from "../../provenance/author.ts";
import { AuthorTag } from "./status-mark.tsx";

type DocketProps = { docket: Docket; cited: ReadonlySet<Citation>; unlisted: string[] };

export function DocketView({ docket, cited, unlisted }: DocketProps) {
  const [allFacts, setAllFacts] = useState(false);
  const seen = new Set(renderDocket(docket).citable);
  const facts = allFacts ? docket.facts : docket.facts.filter((f) => seen.has(f.key));

  return (
    <section className="docket">
      <h2 className="pane-head">
        <span>written or picked by the buyer</span>
        <span className="pane-count">{docket.segments.length}</span>
      </h2>
      <ol className="ruled">
        {docket.segments.map((segment) => (
          <li key={segment.id} className={`ruled-row row-buyer${cited.has(segment.id) ? " is-cited" : ""}`}>
            <AuthorTag author="buyer" />
            <span className="mono ruled-key">
              {segment.id} <span className="ruled-path">{segment.path}</span>
            </span>
            {/* threat: buyer text is rendered as text, never as markup */}
            <span className="ruled-value buyer-text">{segment.text}</span>
          </li>
        ))}
      </ol>

      <h2 className="pane-head">
        <span>{allFacts ? "every paypal and store fact" : "facts the agent sees"}</span>
        <span className="pane-count">{facts.length}</span>
        <button className="link-button" onClick={() => setAllFacts(!allFacts)}>
          {allFacts ? "only the agent's" : `all ${docket.facts.length}`}
        </button>
      </h2>
      <ol className="ruled">
        {facts.map((fact) => (
          <li key={fact.key} className={`ruled-row${cited.has(fact.key) ? " is-cited" : ""}`}>
            <AuthorTag author={fact.key.startsWith("paypal:") ? "paypal" : "merchant"} />
            <span className="mono ruled-key">{fact.key.replace(/^(paypal|merchant):/, "")}</span>
            <span className="mono ruled-value">{fact.value}</span>
          </li>
        ))}
      </ol>

      {unlisted.length > 0 && (
        <p className="pane-note">
          {/* threat: a new paypal field of unknown author is treated as the buyer's until the map lists it */}
          Not in the authorship map, counted as buyer: <span className="mono">{unlisted.join(", ")}</span>
        </p>
      )}
    </section>
  );
}
