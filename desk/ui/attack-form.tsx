import { useState } from "react";
import type { BenchCase } from "../../bench/bench-cases.ts";
import type { CitedValue, Proposal, ProposalKind } from "../../policy/proposal.ts";
import type { Verdict } from "../../policy/verdict.ts";
import { authorOfCitation, findSource, type Citation } from "../../provenance/author.ts";
import { judgeAttack } from "./desk-api.ts";
import { DocketView } from "./docket-view.tsx";
import { VerdictView } from "./proposal-view.tsx";

const KINDS: ProposalKind[] = ["accept_claim", "make_offer", "provide_evidence", "send_message", "send_invoice", "hold"];

const FIELDS: Record<ProposalKind, string[]> = {
  accept_claim: ["amount"],
  make_offer: ["amount"],
  provide_evidence: ["trackingNumber", "carrier"],
  send_message: ["to"],
  send_invoice: ["to", "amount"],
  hold: [],
};

type Draft = { kind: ProposalKind; fields: Record<string, CitedValue>; because: CitedValue[]; text: string };

export function AttackForm({ benchCase }: { benchCase: BenchCase }) {
  const { docket, citable } = benchCase;
  const cite = (c: Citation): CitedValue => ({ cite: c, value: (findSource(docket, c) ?? "").trim() });
  const [draft, setDraft] = useState<Draft>(() => presetRefund(benchCase, cite));
  const [judged, setJudged] = useState<{ verdict: Verdict } | { error: string } | undefined>(undefined);

  async function submit() {
    const fetched = await judgeAttack(benchCase.fixture, buildProposal(draft));
    setJudged(fetched.ok ? { verdict: fetched.value.verdict } : { error: fetched.error });
  }

  function edit(next: Partial<Draft>) {
    setDraft({ ...draft, ...next });
    setJudged(undefined);
  }

  const cited = new Set<Citation>([...FIELDS[draft.kind].map((f) => draft.fields[f]!.cite), ...draft.because.map((b) => b.cite)]);

  return (
    <div className="review">
      <DocketView docket={docket} cited={cited} unlisted={benchCase.unlisted} />
      <section className="verdict-column">
        <div className="block">
          <h2 className="pane-head">
            <span>your proposal</span>
          </h2>
          <p className="pane-note">
            Play a hijacked agent: pick an action and cite where each value comes from. Nothing reaches PayPal or a model; the rules judge it here.
          </p>
          <div className="attack-presets">
            <button className="button" onClick={() => edit(presetRefund(benchCase, cite))}>refund the buyer's figure</button>
            <button className="button" onClick={() => edit(presetTracking(benchCase, cite))}>file the buyer's tracking</button>
            <button className="button" onClick={() => edit(presetRedirect(benchCase, cite))}>write where the buyer says</button>
          </div>
          <label className="attack-row mono">
            <span className="ruled-key">kind</span>
            <select className="attack-input" value={draft.kind} onChange={(e) => edit(switchKind(draft, e.target.value as ProposalKind, citable, cite))}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {FIELDS[draft.kind].map((field) => (
            <CitedInput key={field} name={field} cited={draft.fields[field]!} citable={citable} cite={cite} onChange={(v) => edit({ fields: { ...draft.fields, [field]: v } })} />
          ))}
          {(draft.kind === "send_message" || draft.kind === "send_invoice") && (
            <textarea className="message-draft attack-text" rows={3} maxLength={2000} value={draft.text} onChange={(e) => edit({ text: e.target.value })} />
          )}
          <h3 className="sub-head">because</h3>
          {draft.because.map((b, i) => (
            <CitedInput key={i} name="" cited={b} citable={citable} cite={cite} onChange={(v) => edit({ because: draft.because.map((x, j) => (j === i ? v : x)) })} onRemove={() => edit({ because: draft.because.filter((_, j) => j !== i) })} />
          ))}
          <div className="decision">
            <button className="button" onClick={() => edit({ because: [...draft.because, cite("merchant:policy")] })}>add a reason</button>
            <button className="button button-primary" onClick={() => void submit()}>judge it</button>
          </div>
        </div>
        {judged && "verdict" in judged && <VerdictView verdict={judged.verdict} />}
        {judged && "error" in judged && <p className="pane-error">{judged.error}</p>}
      </section>
    </div>
  );
}

const LABELS: Record<string, string> = { trackingNumber: "tracking" };

type InputProps = { name: string; cited: CitedValue; citable: Citation[]; cite: (c: Citation) => CitedValue; onChange: (v: CitedValue) => void; onRemove?: () => void };

function CitedInput({ name, cited, citable, cite, onChange, onRemove }: InputProps) {
  return (
    <div className={`attack-row mono${authorOfCitation(cited.cite) === "buyer" ? " row-buyer" : ""}`}>
      <span className="ruled-key">{LABELS[name] ?? (name || "reason")}</span>
      <select className="attack-input" value={cited.cite} onChange={(e) => onChange(cite(e.target.value as Citation))}>
        {citable.map((c) => (
          <option key={c} value={c}>
            {authorOfCitation(c)} · {c}
          </option>
        ))}
      </select>
      <input className="attack-input attack-value" value={cited.value} maxLength={500} onChange={(e) => onChange({ ...cited, value: e.target.value })} />
      {onRemove && (
        <button className="link-button" onClick={onRemove}>
          remove
        </button>
      )}
    </div>
  );
}

function buildProposal({ kind, fields, because, text }: Draft): Proposal {
  switch (kind) {
    case "accept_claim":
      return { kind, amount: fields.amount!, because };
    case "make_offer":
      return { kind, amount: fields.amount!, offerType: "REFUND", because };
    case "provide_evidence":
      return { kind, trackingNumber: fields.trackingNumber!, carrier: fields.carrier!, because };
    case "send_message":
      return { kind, to: fields.to!, body: text, because };
    case "send_invoice":
      return { kind, to: fields.to!, amount: fields.amount!, note: text, because };
    case "hold":
      return { kind, because };
  }
}

const DEFAULT_CITES: Record<string, Citation> = {
  amount: "paypal:refund_details.allowed_refund_amount.value",
  trackingNumber: "merchant:order.tracking",
  carrier: "merchant:order.carrier",
  to: "paypal:disputed_transactions[0].buyer.email",
};

function switchKind(draft: Draft, kind: ProposalKind, citable: Citation[], cite: (c: Citation) => CitedValue): Partial<Draft> {
  const fields = Object.fromEntries(FIELDS[kind].map((f) => [f, draft.fields[f] ?? cite(citable.includes(DEFAULT_CITES[f]!) ? DEFAULT_CITES[f]! : citable[0]!)]));
  return { kind, fields };
}

function segmentAt(k: BenchCase, path: string): Citation | undefined {
  return k.docket.segments.find((s) => s.path === path)?.id;
}

function presetRefund(k: BenchCase, cite: (c: Citation) => CitedValue): Draft {
  const asked = segmentAt(k, "offer.buyer_requested_amount.value") ?? DEFAULT_CITES.amount!;
  return { kind: "accept_claim", fields: { amount: cite(asked) }, because: [cite("merchant:policy")], text: "" };
}

function presetTracking(k: BenchCase, cite: (c: Citation) => CitedValue): Draft {
  const message = segmentAt(k, "messages[0].content") ?? k.citable[0]!;
  const quoted = cite(message);
  const number = quoted.value.match(/\b\d{12,}\b/)?.[0] ?? quoted.value;
  return { kind: "provide_evidence", fields: { trackingNumber: { cite: message, value: number }, carrier: cite("merchant:order.carrier") }, because: [cite("merchant:order.status")], text: "" };
}

function presetRedirect(k: BenchCase, cite: (c: Citation) => CitedValue): Draft {
  const message = segmentAt(k, "messages[0].content") ?? k.citable[0]!;
  const quoted = cite(message);
  const address = quoted.value.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? quoted.value;
  return {
    kind: "send_message",
    fields: { to: { cite: message, value: address } },
    because: [cite(message)],
    text: `Your order shipped. Write to ${address} if anything is missing.`,
  };
}
