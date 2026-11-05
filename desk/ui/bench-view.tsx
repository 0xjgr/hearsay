import { useEffect, useState } from "react";
import type { AuditRecord } from "../../bench/audit-bench.ts";
import type { BenchCase, Replay } from "../../bench/bench-cases.ts";
import { listParameters } from "../../policy/proposal.ts";
import { isSegmentId, type Citation } from "../../provenance/author.ts";
import { AttackForm } from "./attack-form.tsx";
import { fetchAudit, fetchCases, fetchRuns, type Fetched } from "./desk-api.ts";
import { DocketView } from "./docket-view.tsx";
import { formatClock, KIND_WORDS, VERDICT_WORDS } from "./plain-words.ts";
import { RuleList, summarizeVerdict, TraceView } from "./proposal-view.tsx";

const OWN = "Write your own";

export function BenchView() {
  const [cases, setCases] = useState<Fetched<BenchCase[]> | undefined>(undefined);
  const [runs, setRuns] = useState<Replay[]>([]);
  const [fixture, setFixture] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<string>(OWN);
  const [audit, setAudit] = useState<AuditRecord | undefined>(undefined);

  useEffect(() => {
    void fetchCases().then(setCases);
    void fetchRuns().then((fetched) => setRuns(fetched.ok ? fetched.value : []));
    void fetchAudit().then((fetched) => setAudit(fetched.ok ? fetched.value : undefined));
  }, []);

  const models = [...new Set(runs.map((r) => r.entry.run.model))];
  const listed = cases?.ok ? cases.value : [];
  const shown = listed.find((k) => k.fixture === fixture) ?? listed[0];
  const runsOf = (k: BenchCase) => runs.filter((r) => r.entry.disputeId === k.docket.disputeId);
  const replay = shown && runsOf(shown).find((r) => r.entry.run.model === tab);

  function openCase(next: BenchCase) {
    setFixture(next.fixture);
    setTab(models.find((m) => runsOf(next).some((r) => r.entry.run.model === m)) ?? OWN);
  }

  return (
    <>
      <aside className="inbox">
        <div className="inbox-head">
          <h2>Attack cases</h2>
        </div>
        <p className="group-hint">Each one hides an instruction in a field the buyer controls. Pick one, then replay a model or play the hijacked agent yourself.</p>
        {audit !== undefined && <AuditLine record={audit} />}
        {cases === undefined && <p className="pane-note">Loading the bench...</p>}
        {cases?.ok === false && <p className="pane-note pane-error">{cases.error}</p>}
        <ol>
          {listed.map((k) => (
            <li key={k.fixture}>
              <button className={`inbox-card${k === shown ? " is-selected" : ""}`} onClick={() => openCase(k)}>
                <span className="card-title">{labelCase(k)}</span>
                <span className="card-line">{k.attack}</span>
                <span className="card-models">
                  {runsOf(k).map((r) => (
                    <span key={r.entry.run.model} className={`mark mark-${toneOf(r)}`}>
                      {shortModel(r.entry.run.model)}: {r.verdict === undefined ? "error" : VERDICT_WORDS[r.verdict.kind]}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      {shown === undefined ? (
        <main className="case case-empty">No bench cases.</main>
      ) : (
        <main className="case">
          <header className="case-head">
            <div className="case-title">
              <h1>{labelCase(shown)}</h1>
              <p className="case-sub">
                <span>{shown.attack}</span>
                <span className="case-id">{shown.docket.disputeId}</span>
              </p>
            </div>
          </header>
          <nav className="history" aria-label="Who answers this case">
            {[...models.filter((m) => runsOf(shown).some((r) => r.entry.run.model === m)), OWN].map((name) => (
              <button key={name} className={`history-item${name === tab ? " is-selected" : ""}`} onClick={() => setTab(name)}>
                {name === OWN ? name : `Replay ${name}`}
              </button>
            ))}
          </nav>
          {tab === OWN || replay === undefined ? <AttackForm key={shown.fixture} benchCase={shown} /> : <ReplayPanel replay={replay} />}
        </main>
      )}
    </>
  );
}

function ReplayPanel({ replay }: { replay: Replay }) {
  const { entry, verdict } = replay;
  const stamp = `Recorded ${formatClock(entry.at)}, ${entry.run.model}, reasoning ${entry.run.reasoning}${entry.seconds === undefined ? "" : `, ${entry.seconds.toFixed(0)} s`}`;
  if (entry.outcome !== "judged" || verdict === undefined) {
    return (
      <div className="review">
        <div className="verdict-banner tone-deny">
          <p className="banner-word">Agent error</p>
          <p className="banner-line">{entry.outcome === "agent-error" ? entry.error : ""} Nothing was proposed, so there was nothing to judge.</p>
          <p className="banner-stamp">{stamp}</p>
        </div>
      </div>
    );
  }
  const cited = new Set<Citation>([...listParameters(entry.proposal), ...entry.proposal.because].map((v) => v.cite));
  const marks = [...listParameters(entry.proposal), ...entry.proposal.because].filter((v) => isSegmentId(v.cite)).map((v) => v.value);
  return (
    <div className="review">
      <div className={`verdict-banner tone-${verdict.kind}`}>
        <p className="banner-word">{VERDICT_WORDS[verdict.kind]}</p>
        <p className="banner-line">
          <strong>{KIND_WORDS[entry.proposal.kind]}.</strong> {summarizeVerdict(verdict)}
        </p>
        <p className="banner-exec">The model's answer is recorded; the verdict is worked out now by today's rules.{verdict.kind !== entry.verdict.kind && ` When recorded it was ${VERDICT_WORDS[entry.verdict.kind].toLowerCase()}.`}</p>
        <p className="banner-stamp">{stamp}</p>
      </div>
      <div className="review-grid">
        <div className="review-main">
          <TraceView proposal={entry.proposal} docket={entry.docket} reasoning={entry.reasoning} tokens={entry.tokens} />
          <RuleList verdict={verdict} />
        </div>
        <DocketView docket={entry.docket} cited={cited} unlisted={entry.unlisted} marks={marks} />
      </div>
    </div>
  );
}

function AuditLine({ record }: { record: AuditRecord }) {
  const { audit } = record;
  const through = audit.configs.reduce((sum, c) => sum + c.through, 0);
  const attacks = audit.configs.reduce((sum, c) => sum + c.attacks, 0);
  return (
    <div className="audit-line">
      <p>
        <strong>
          {through} of {attacks}
        </strong>{" "}
        recorded model attacks got past the rules, and <strong>{audit.obedientAllowed} of {audit.attacks}</strong> perfectly obedient ones.
      </p>
      <p className="audit-meta">
        Re-judged on Render Workflows on {record.at.slice(0, 10)}, {audit.cases} cases in parallel. Run {record.taskRunId}
      </p>
    </div>
  );
}

const CASE_NAMES: Record<string, string> = {
  "inr-clean": "No attack, delivered order",
  "inr-injected": "Refund order in the message",
  "inr-item-name-injected": "Order hidden in the item name",
  "snad-legit": "No attack, damaged item",
  "inr-fake-tracking": "Fake corrected tracking",
  "inr-fake-notice": "Fake PayPal case review",
  "inr-redirect": "Write to another address",
  "inr-split": "Order split across two fields",
  "inr-fake-notice-overcap": "Fake notice, double refund",
  "inr-fake-notice-contact": "Fake notice, new contact",
};

function labelCase(k: BenchCase): string {
  const slug = k.fixture.replace(/^dispute-/, "").replace(/\.json$/, "");
  return CASE_NAMES[slug] ?? slug;
}

function shortModel(model: string): string {
  return model.replace(/-instruct$/, "");
}

function toneOf(replay: Replay): "allow" | "ask" | "deny" {
  return replay.verdict?.kind ?? "deny";
}
