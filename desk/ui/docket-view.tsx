import { Fragment } from "react";
import { renderDocket } from "../../agent/render-docket.ts";
import type { Citation, Docket, Segment } from "../../provenance/author.ts";
import { highlight } from "./proposal-view.tsx";
import { labelCitation, labelField } from "./plain-words.ts";
import { AuthorTag } from "./status-mark.tsx";

type DocketProps = { docket: Docket; cited: ReadonlySet<Citation>; unlisted: string[]; marks?: string[] };

// note: free text the buyer typed comes first; values picked from a list are the least dangerous
const LOUD = [/messages\[\d+\]\.content$/, /evidences\[\d+\]\.notes$/, /items\[\d+\]\.notes$/, /item_name$/, /item_description$/, /buyer\.name$/, /buyer_requested_amount\.value$/];

export function DocketView({ docket, cited, unlisted, marks = [] }: DocketProps) {
  const loud = docket.segments.filter((s) => LOUD.some((p) => p.test(s.path)));
  const quiet = docket.segments.filter((s) => !loud.includes(s));
  return (
    <section className="statement">
      <h2 className="section-head">
        What the buyer wrote <AuthorTag author="buyer" />
      </h2>
      <p className="statement-note">Anyone who paid the store can open a dispute and type here. The agent reads it; the rules never trust it.</p>
      <ol className="statement-fields">
        {loud.map((segment) => (
          <BuyerField key={segment.id} segment={segment} isCited={cited.has(segment.id)} marks={marks} />
        ))}
      </ol>
      {quiet.length > 0 && (
        <div className="statement-picked">
          <h3>Also picked or attached by the buyer</h3>
          <dl className="picked-list">
            {quiet.map((s) => (
              <Fragment key={s.id}>
                <dt className={cited.has(s.id) ? "is-cited" : ""}>{labelField(s.path)}</dt>
                <dd className={cited.has(s.id) ? "is-cited" : ""}>{shorten(s.text)}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}
      <DocketDetails docket={docket} cited={cited} unlisted={unlisted} />
    </section>
  );
}

function BuyerField({ segment, isCited, marks }: { segment: Segment; isCited: boolean; marks: string[] }) {
  const mark = marks.find((m) => m.trim().length > 1 && segment.text.includes(m.trim()));
  return (
    <li className={`buyer-field${isCited ? " is-cited" : ""}`}>
      <span className="buyer-field-head">
        {labelField(segment.path)}
        <span className="seg-id">{segment.id}</span>
        {isCited && <span className="cited-flag">Used by the agent</span>}
      </span>
      {/* threat: buyer text is rendered as text, never as markup */}
      <blockquote className="buyer-voice">{mark === undefined ? segment.text : highlight(segment.text, mark)}</blockquote>
    </li>
  );
}

function DocketDetails({ docket, cited, unlisted }: Omit<DocketProps, "marks">) {
  const seen = new Set(renderDocket(docket).citable);
  return (
    <details className="details">
      <summary>Every field the agent saw, with its PayPal API path</summary>
      <table className="field-table">
        <tbody>
          {docket.segments.map((s) => (
            <tr key={s.id} className={cited.has(s.id) ? "is-cited" : ""}>
              <td><AuthorTag author="buyer" /></td>
              <td className="path">{s.id} {s.path}</td>
              <td className="buyer-voice">{s.text}</td>
            </tr>
          ))}
          {docket.facts.filter((f) => seen.has(f.key)).map((f) => (
            <tr key={f.key} className={cited.has(f.key) ? "is-cited" : ""}>
              <td><AuthorTag author={f.key.startsWith("paypal:") ? "paypal" : "merchant"} /></td>
              <td className="path">{labelCitation(f.key)}<br />{f.key}</td>
              <td>{f.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unlisted.length > 0 && (
        // threat: a new paypal field of unknown author is treated as the buyer's until the map lists it
        <p className="pane-note">Not in the authorship map, so counted as the buyer's: {unlisted.join(", ")}</p>
      )}
    </details>
  );
}

function shorten(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
