import { Fragment } from "react";
import { renderDocket } from "../../agent/render-docket.ts";
import type { Citation, Docket, Segment } from "../../provenance/author.ts";
import { hasInstruction, markText } from "./mark-text.tsx";
import { labelCitation, labelField } from "./plain-words.ts";
import type { Focus } from "./proposal-view.tsx";
import { AuthorTag } from "./status-mark.tsx";

type DocketProps = { docket: Docket; cited: ReadonlySet<Citation>; unlisted: string[]; marks?: string[]; focus?: Focus };

// note: free text the buyer typed comes first; values picked from a list are the least dangerous
const LOUD = [/messages\[\d+\]\.content$/, /evidences\[\d+\]\.notes$/, /items\[\d+\]\.notes$/, /item_name$/, /item_description$/, /buyer\.name$/, /buyer_requested_amount\.value$/];

// note: the same text typed into two fields is shown once, under both names
type Field = { text: string; segments: Segment[] };

export function DocketView({ docket, cited, unlisted, marks = [], focus }: DocketProps) {
  const loud = groupByText(docket.segments.filter((s) => LOUD.some((p) => p.test(s.path))));
  const quiet = docket.segments.filter((s) => !LOUD.some((p) => p.test(s.path)));
  const hasInjection = loud.some((f) => hasInstruction(f.text));
  return (
    <section className="statement">
      <h2 className="section-head">
        What the buyer wrote <AuthorTag author="buyer" />
      </h2>
      {hasInjection && (
        <p className="statement-note">
          Text <mark className="mark-inject">underlined in red</mark> reads like an order to the agent. A simple pattern finds it; the rules never rely on it.
        </p>
      )}
      <ol className="statement-fields">
        {loud.map((field) => (
          <BuyerField key={field.segments[0]!.id} field={field} cited={cited} marks={marks} focus={focus} />
        ))}
      </ol>
      {quiet.length > 0 && (
        <details className="statement-picked" open={quiet.some((s) => cited.has(s.id))}>
          <summary>{quiet.length} more fields the buyer picked or attached</summary>
          <dl className="picked-list">
            {quiet.map((s) => (
              <Fragment key={s.id}>
                <dt className={cited.has(s.id) ? "is-cited" : ""}>{labelField(s.path)}</dt>
                <dd className={cited.has(s.id) ? "is-cited" : ""}>{shorten(s.text)}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
      )}
      <DocketDetails docket={docket} cited={cited} unlisted={unlisted} />
    </section>
  );
}

function BuyerField({ field, cited, marks, focus }: { field: Field; cited: ReadonlySet<Citation>; marks: string[]; focus: Focus | undefined }) {
  const ids = field.segments.map((s) => s.id);
  const isCited = ids.some((id) => cited.has(id));
  const isFocused = focus?.cite !== undefined && ids.includes(focus.cite as Segment["id"]);
  return (
    <li
      className={`buyer-field${isCited ? " is-cited" : ""}${isFocused ? " is-focused" : ""}`}
      onMouseEnter={() => isCited && focus?.onFocus(ids.find((id) => cited.has(id)))}
      onMouseLeave={() => focus?.onFocus(undefined)}
    >
      <span className="buyer-field-head">
        {[...new Set(field.segments.map((s) => labelField(s.path)))].join(" and ")}
        {isCited && <span className="cited-flag">Used by the agent</span>}
      </span>
      {/* threat: buyer text is rendered as text, never as markup */}
      <blockquote className="buyer-voice">{markText(field.text, isCited ? marks : [])}</blockquote>
    </li>
  );
}

function DocketDetails({ docket, cited, unlisted }: Omit<DocketProps, "marks" | "focus">) {
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

function groupByText(segments: Segment[]): Field[] {
  const fields: Field[] = [];
  for (const segment of segments) {
    const same = fields.find((f) => f.text.trim() === segment.text.trim());
    if (same) same.segments.push(segment);
    else fields.push({ text: segment.text, segments: [segment] });
  }
  return fields;
}

function shorten(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
