import { useEffect, useState } from "react";
import type { AuditRecord } from "../../bench/audit-bench.ts";
import type { BenchCase, Replay } from "../../bench/bench-cases.ts";
import { listParameters } from "../../policy/proposal.ts";
import type { Citation } from "../../provenance/author.ts";
import { AttackForm } from "./attack-form.tsx";
import { fetchAudit, fetchCases, fetchRuns, type Fetched } from "./desk-api.ts";
import { DocketView } from "./docket-view.tsx";
import { ProposalView } from "./proposal-view.tsx";
import { formatClock } from "./status-mark.tsx";

const OWN = "write your own";

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
        <div className="pane-head">
          <span>bench cases</span>
          <span className="pane-count">{listed.length}</span>
        </div>
        {audit !== undefined && <AuditLine record={audit} />}
        {cases === undefined && <p className="pane-note">Loading the bench...</p>}
        {cases?.ok === false && <p className="pane-note pane-error">{cases.error}</p>}
        <ol className="inbox-list">
          {listed.map((k) => (
            <li key={k.fixture}>
              <button className={`inbox-row${k === shown ? " is-selected" : ""}`} onClick={() => openCase(k)}>
                <span className="mono inbox-id">{labelCase(k)}</span>
                <span className="mono inbox-amount">{k.docket.disputeId}</span>
                <span className="inbox-reason bench-attack">{k.attack}</span>
                <span className="inbox-flags">
                  {runsOf(k).map((r) => (
                    <span key={r.entry.run.model} className={`mark mark-${toneOf(r)}`}>
                      {shortModel(r.entry.run.model)} {r.verdict?.kind ?? "error"}
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
          <section className="case-head">
            <h1 className="mono">{labelCase(shown)}</h1>
            <p className="case-facts">
              <span>{shown.attack}</span>
            </p>
            <nav className="history">
              {[...models.filter((m) => runsOf(shown).some((r) => r.entry.run.model === m)), OWN].map((name) => (
                <button key={name} className={`history-item${name === tab ? " is-selected" : ""}`} onClick={() => setTab(name)}>
                  <span className="mono">{name === OWN ? name : `${name} recorded`}</span>
                </button>
              ))}
            </nav>
          </section>
          {tab === OWN || replay === undefined ? <AttackForm key={shown.fixture} benchCase={shown} /> : <ReplayPanel replay={replay} />}
        </main>
      )}
    </>
  );
}

function ReplayPanel({ replay }: { replay: Replay }) {
  const { entry, verdict } = replay;
  const cited = new Set<Citation>(entry.outcome === "judged" ? [...listParameters(entry.proposal), ...entry.proposal.because].map((v) => v.cite) : []);
  return (
    <div className="review">
      <DocketView docket={entry.docket} cited={cited} unlisted={entry.unlisted} />
      <section className="verdict-column">
        <p className="review-stamp mono">
          {formatClock(entry.at)} · {entry.run.model} · reasoning {entry.run.reasoning}
          {entry.seconds !== undefined && ` · ${entry.seconds.toFixed(0)} s`}
        </p>
        {entry.outcome === "judged" && verdict !== undefined ? (
          <>
            <p className="pane-note">The agent's answer is recorded. The verdict is worked out now, by the rules as they stand.</p>
            <ProposalView entry={{ ...entry, verdict }} />
            {verdict.kind !== entry.verdict.kind && (
              <p className="pane-note mono">verdict when recorded: {entry.verdict.kind}</p>
            )}
          </>
        ) : (
          <div className="block block-deny">
            <h2 className="pane-head">agent error</h2>
            <p className="mono">{entry.outcome === "agent-error" ? entry.error : ""}</p>
            <p className="pane-note">Nothing was proposed, so there was nothing to judge.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function AuditLine({ record }: { record: AuditRecord }) {
  const { audit } = record;
  const through = audit.configs.reduce((sum, c) => sum + c.through, 0);
  const attacks = audit.configs.reduce((sum, c) => sum + c.attacks, 0);
  return (
    <p className="pane-note audit-line">
      Re-judged on Render Workflows, {record.at.slice(0, 10)}: {audit.cases} cases in parallel runs. Obedient attacks allowed{" "}
      <span className="mono">{audit.obedientAllowed}/{audit.attacks}</span>, recorded model attacks through{" "}
      <span className="mono">{through}/{attacks}</span>. <span className="mono">{record.taskRunId}</span>
    </p>
  );
}

function labelCase(k: BenchCase): string {
  return k.fixture.replace(/^dispute-/, "").replace(/\.json$/, "");
}

function shortModel(model: string): string {
  return model.replace(/-instruct$/, "");
}

function toneOf(replay: Replay): "allow" | "ask" | "deny" {
  return replay.verdict?.kind ?? "deny";
}
