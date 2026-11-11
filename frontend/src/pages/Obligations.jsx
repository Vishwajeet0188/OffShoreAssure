/*
 * Stage 5 · Obligation extraction (steps 21–24), to the client's specification.
 *
 *  - Step 21: the draft register, 12 fields per obligation (a missing deadline shows as UNSPECIFIED)
 *  - Step 22: the clause → rule → obligation trace, the 8 mapping fields and the engine checks
 *  - Step 23: the searchable register (9 fields) with filters for party, deadline, status and source contract
 *  - Step 24: register versions (v1.0, v1.1 …), reviewer edits and the monitoring triggers
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import {
  PARTY_TONE,
  TYPE_TONE,
  STATUS_TONE,
  RULE_TONE,
  RULE_LABEL,
  CHECK_TONE,
  CHECK_LABEL,
  confidenceTone,
  confidenceText,
  sourceOf,
  consequenceOf,
} from '../lib/obligations.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';

const STEPS = [
  [21, 'Extract obligations'],
  [22, 'Map to rules'],
  [23, 'Register'],
  [24, 'Saved'],
];

/* ================================================================== */
/*  Stage 5 landing page                                              */
/* ================================================================== */

export function ObligationsList() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/assessments')
      .then(result => setAssessments(result.assessments))
      .catch(err => setError(err.message));
  }, []);

  return (
    <>
      <PageHead
        eyebrow="Buyer · Stage 5 · Obligation extraction"
        title="Obligation extraction"
        lead="See who must do what, and by when, under the contract with your vendor, with the clause each obligation comes from."
      />
      <div className="card" data-section="obligations-list">
        {error ? <p className="form-err pad">{error}</p> : null}

        {!assessments ? (
          <Loading pad />
        ) : assessments.length === 0 ? (
          <p className="note pad">
            No assessments yet. Start with{' '}
            <Link className="link" to="/requirements">
              Stage 1 · Requirement
            </Link>
            .
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Service</th>
                  <th>Vendor</th>
                  <th>Obligations</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr
                    key={assessment.reference}
                    className="click"
                    onClick={() => navigate('/obligations/' + assessment.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/obligations/' + assessment.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td>
                      <RegisterStatus assessment={assessment} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="link">
                        Open <Icon n="arrow" s={13} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function RegisterStatus({ assessment }) {
  const register = assessment.obligations;

  if (register) {
    const { obligations, prohibitions, rights } = register.totals;
    return (
      <Badge s="Complete" label={`v${register.version} · ${obligations + prohibitions + rights} items`} />
    );
  }
  if (assessment.contract) return <span className="muted">Ready to extract</span>;
  return <span className="muted">Waiting for Stage 4</span>;
}

/* ================================================================== */
/*  Stage 5 for one assessment                                        */
/* ================================================================== */

export default function Obligations() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    version => {
      const query = version ? `?version=${version}` : '';
      return api(`/assessments/${ref}/obligations${query}`)
        .then(setState)
        .catch(err => setError(err.message));
    },
    [ref],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function extract() {
    setBusy(true);
    setError('');
    try {
      setState(await api(`/assessments/${ref}/obligations`, { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) return <p className="form-err">{error}</p>;
  if (!state) return <Loading />;

  const register = state.register;
  const lastDoneStep = register ? 24 : 20;

  return (
    <div className="vs">
      <Link
        className="link"
        to="/obligations"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        ← Obligation extraction
      </Link>

      <PageHead
        eyebrow={`Buyer · Stage 5 · Obligation extraction · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Contract with ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 5 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={number <= lastDoneStep ? 'done' : ''}>
            <span className="journey-n">{number}</span>
            {title}
          </li>
        ))}
      </ol>

      {error ? (
        <div className="rq-msg err" role="alert">
          <b>{error}</b>
        </div>
      ) : null}

      {/* Nothing to extract from yet, or a newer contract analysis to extract from. */}
      {state.blocked ? (
        <section className="card pad stack" data-section="obligations-blocked">
          <h2 style={{ margin: 0 }}>Extract the obligations</h2>
          <div className="rq-flag warning">
            <Icon n="alert" s={16} />
            <span>
              {state.blocked}{' '}
              <Link className="link" to={'/contract/' + ref}>
                Open contract analysis
              </Link>
            </span>
          </div>
        </section>
      ) : state.canExtract ? (
        <ExtractCard state={state} busy={busy} onExtract={extract} />
      ) : null}

      {register && register.legacy ? <LegacyRegister register={register} /> : null}

      {register && !register.legacy ? (
        <>
          <VersionBar state={state} onPick={load} />
          <SummaryCard register={register} />
          <ChecksCard register={register} />
          <RuleTrace register={register} categories={state.categories} />
          <RegisterTable state={state} reference={ref} onChange={setState} />
          <MonitorsCard register={register} frequencies={state.frequencies} />
          <HistoryCard state={state} onPick={load} />

          <div className="card rq-next">
            <Icon n="clock" s={20} />
            <div>
              <b>Stage 5 is complete for this assessment. Next: Stage 6 — Transfer assessment.</b>{' '}
              <span className="note">Check every route your data takes, entity by entity.</span>
            </div>
            <Link
              className="btn primary"
              to={'/transfers/' + state.assessment.reference}
              data-act="go-transfers"
            >
              Open transfer assessment
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 21 · start                                                   */
/* ------------------------------------------------------------------ */

function ExtractCard({ state, busy, onExtract }) {
  const isUpdate = state.versions.length > 0;
  const { contract } = state;

  return (
    <section className="card pad stack" data-section="obligations-extract">
      <h2 style={{ margin: 0 }}>
        {isUpdate
          ? `A newer contract analysis (v${contract.version}) is available`
          : 'Step 21 · Extract the obligations'}
      </h2>
      <p style={{ margin: 0 }}>
        OffshoreAssure reads the <b>{contract.clauses} clauses</b> of the contract set ({contract.documents}{' '}
        document{contract.documents === 1 ? '' : 's'}, analysis v{contract.version}). It finds every
        obligation, works out who must do it and for whom, the trigger, the deadline and the evidence needed,
        and maps each one to the rules.
      </p>
      <ul className="cp-facts">
        <li>
          <Icon n="users" s={15} />
          Responsible party and beneficiary
        </li>
        <li>
          <Icon n="clock" s={15} />
          Deadline as written, or UNSPECIFIED
        </li>
        <li>
          <Icon n="doc" s={15} />
          Source document and clause
        </li>
      </ul>
      {contract.status === 'HUMAN_REVIEW' ? (
        <div className="rq-flag warning">
          <Icon n="alert" s={16} />
          <span>
            Some of the contract could not be read well. Rules it might cover are marked for human review, not
            as missing.
          </span>
        </div>
      ) : null}
      <div>
        <button className="btn primary" onClick={onExtract} disabled={busy} data-act="extract-obligations">
          {busy
            ? 'Extracting…'
            : isUpdate
              ? `Extract again from contract analysis v${contract.version}`
              : 'Extract obligations'}
        </button>
      </div>
    </section>
  );
}

/* A register saved with the earlier draft rules: shown as it was, with a prompt to extract again. */
function LegacyRegister({ register }) {
  return (
    <section className="card pad stack" data-section="obligations-legacy">
      <h2 style={{ margin: 0 }}>Obligation register v{register.label} (earlier rules)</h2>
      <p className="note" style={{ margin: 0 }}>
        This register was made with the earlier draft rules ({register.rulePackVersion}) before the client’s
        specification. Extract again to get the 12 fields per obligation, the rule trace and the monitoring
        triggers.
      </p>
      <div className="tw">
        <table className="ob-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Who</th>
              <th>Obligation</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {register.obligations.map(o => (
              <tr key={o.id}>
                <td className="mono">{o.id}</td>
                <td>{o.party}</td>
                <td className="ob-text">{o.text}</td>
                <td className="mono">{sourceOf(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Version, summary and checks                                       */
/* ------------------------------------------------------------------ */

function VersionBar({ state, onPick }) {
  const register = state.register;
  const how =
    register.trigger === 'review'
      ? `after a reviewer ${register.edit?.action === 'VERIFY' ? 'verified' : register.edit?.action === 'REJECT' ? 'rejected' : register.edit?.action?.endsWith('MAPPING') ? 'reviewed a mapping of' : 'edited'} ${register.edit?.obligationId} (${register.edit?.by})`
      : `extracted from contract analysis v${register.contractVersion}`;

  return (
    <section className="card pad ca-version" data-section="obligations-version">
      <div className="ca-version-main">
        <Icon n="list" s={20} />
        <div>
          <b>Obligation Register v{register.label}</b>
          <div className="note">
            Saved {fmtTime(register.createdAt)} {how} · rule pack {register.rulePackVersion}
          </div>
          <div className="note">
            Fingerprint <span className="mono">{register.snapshotSha256.slice(0, 16)}…</span>
          </div>
        </div>
      </div>

      {state.versions.length > 1 ? (
        <select
          aria-label="Register version"
          value={register.version}
          onChange={e => onPick(Number(e.target.value))}
        >
          {state.versions.map(v => (
            <option key={v.version} value={v.version}>
              v{v.label} · {v.trigger === 'review' ? 'reviewer edit' : `contract v${v.contractVersion}`}
              {v.version === state.versions[0].version ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}

function SummaryCard({ register }) {
  const { totals } = register;

  const figures = [
    ['Obligations', totals.obligations],
    ['Prohibitions', totals.prohibitions],
    ['Rights', totals.rights],
    ['Deadline UNSPECIFIED', totals.unspecifiedDeadline, totals.unspecifiedDeadline > 0],
    ['Requires verification', totals.requiresVerification, totals.requiresVerification > 0],
    ['Monitored', totals.monitored],
  ];
  const parties = [
    ['Vendor', totals.vendor, 'b-plum'],
    ['Buyer', totals.buyer, 'b-sage'],
    ['Both parties', totals.both, 'b-amber'],
    ['Not clear', totals.unclear, 'b-mute'],
  ];

  return (
    <section className="card cp-result" data-section="obligations-summary">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Step 21 · Draft Obligation Register</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            Who must do what
          </h2>
          <div className="ob-parties">
            {parties.map(([label, value, tone]) => (
              <span key={label} className={'b ' + tone}>
                {label}: {value}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ca-figures">
        {figures.map(([label, value, warn]) => (
          <div key={label} className={warn ? 'warn' : ''}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {register.gaps.length ? (
        <div className="asr-block" data-section="obligations-gaps">
          <h3>Gaps ({register.gaps.length})</h3>
          <ul className="cp-gaps">
            {register.gaps.map(gap => (
              <li key={gap.ruleId}>
                <span className={'b ' + (gap.kind === 'PARTIAL' ? 'b-amber' : 'b-coral')}>
                  {gap.kind === 'PARTIAL' ? 'Partly covered' : 'No obligation'}
                </span>
                <span>
                  <span className="mono">{gap.ruleId}</span> {gap.text}{' '}
                  <span className="note">({gap.source})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {register.note}
      </p>
    </section>
  );
}

/* Step 22: legal or contractual basis, party, completeness, conflicts, downstream duties, evidence. */
function ChecksCard({ register }) {
  if (!register.checks.length) return null;

  // Issues first, then warnings, then information.
  const order = { issue: 0, warning: 1, info: 2 };
  const checks = [...register.checks].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <section className="card" data-section="obligations-checks">
      <div className="ch">
        <div>
          <h2>Step 22 · Engine checks</h2>
          <div className="sub">
            Basis, responsible party, completeness, conflicting clauses, downstream duties and evidence.
          </div>
        </div>
        <span className="note">
          {register.totals.issues} issue{register.totals.issues === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="cp-gaps pad" style={{ paddingTop: 0 }}>
        {checks.map((check, index) => (
          <li key={index} data-check={check.kind}>
            <span className={'b ' + CHECK_TONE[check.severity]}>{CHECK_LABEL[check.kind]}</span>
            <span>{check.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Step 22: clause → rule → obligation. */
function RuleTrace({ register, categories }) {
  const categoryName = Object.fromEntries(categories.map(c => [c.id, c.name]));

  return (
    <section className="card" data-section="obligations-rules">
      <div className="ch">
        <div>
          <h2>Step 22 · Clause-to-rule-to-obligation trace</h2>
          <div className="sub">
            Each rule, whether it is a legal requirement or a contract term, the clauses behind it and the
            obligations that cover it. One rule may need several clauses.
          </div>
        </div>
        <span className="note">
          {register.totals.rulesCovered} of {register.totals.rulesTotal} applicable rules covered
        </span>
      </div>

      <ul className="ob-rules">
        {register.ruleTrace.map(rule => (
          <li
            key={rule.id}
            data-rule={rule.id}
            className={
              rule.status === 'COVERED'
                ? 'covered'
                : ['NOT_FOUND', 'PARTIAL'].includes(rule.status)
                  ? 'missing'
                  : ''
            }
          >
            <div>
              <span className="rid">{rule.id}</span> <b>{rule.text}</b>
              <div className="note">
                <span
                  className={'b ' + (rule.basis === 'LEGAL' ? 'b-plum' : 'b-mute')}
                  style={{ marginRight: 6 }}
                >
                  {rule.basis === 'LEGAL' ? 'Legal requirement' : 'Contract term'}
                </span>
                {rule.source} · {rule.categories.map(id => `${id} ${categoryName[id] || ''}`).join(', ')}
              </div>
              <div className="note">
                {rule.clauseIds.length ? `Clauses ${rule.clauseIds.join(', ')}` : 'No clause'}
                {rule.obligationIds.length ? ` → ${rule.obligationIds.join(', ')}` : ''}
                {rule.status !== 'COVERED' ? ` · ${rule.explanation}` : ''}
              </div>
            </div>
            <span className={'b ' + RULE_TONE[rule.status]}>{RULE_LABEL[rule.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 23 · the register                                            */
/* ------------------------------------------------------------------ */

function RegisterTable({ state, reference, onChange }) {
  const { register, parties, statuses } = state;
  const [open, setOpen] = useState(null);

  // Filters: party, deadline, status, source contract, search.
  const [party, setParty] = useState('all');
  const [deadline, setDeadline] = useState('all');
  const [status, setStatus] = useState('all');
  const [document, setDocument] = useState('all');
  const [search, setSearch] = useState('');

  const documents = [
    ...new Map(register.obligations.map(o => [o.sourceDocument.id, o.sourceDocument])).values(),
  ];

  const visible = register.obligations.filter(o => {
    if (party !== 'all' && o.party !== party) return false;
    if (deadline === 'set' && o.deadline.type === 'UNSPECIFIED') return false;
    if (deadline === 'unspecified' && o.deadline.type !== 'UNSPECIFIED') return false;
    if (status !== 'all' && o.status !== status) return false;
    if (document !== 'all' && o.sourceDocument.id !== document) return false;
    if (search) {
      const text = `${o.id} ${o.description} ${o.text}`.toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <section className="card" data-section="obligations-register">
      <div className="ch">
        <div>
          <h2>Step 23 · Obligation register</h2>
          <div className="sub">
            Open an obligation to see all its fields, its rule mappings and to verify, correct or reject it.
          </div>
        </div>
        <span className="note">
          {visible.length} of {register.obligations.length}
        </span>
      </div>

      <div className="ca-filters">
        <select aria-label="Filter by party" value={party} onChange={e => setParty(e.target.value)}>
          <option value="all">All parties</option>
          {Object.entries(parties).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by deadline" value={deadline} onChange={e => setDeadline(e.target.value)}>
          <option value="all">Any deadline</option>
          <option value="set">Deadline stated</option>
          <option value="unspecified">Deadline UNSPECIFIED</option>
        </select>
        <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          {Object.entries(statuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by source contract"
          value={document}
          onChange={e => setDocument(e.target.value)}
        >
          <option value="all">All documents</option>
          {documents.map(d => (
            <option key={d.id} value={d.id}>
              {d.id}
              {d.type ? ` · ${d.type}` : ''}
              {d.title ? ` · ${d.title}` : ''}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search obligations"
          aria-label="Search obligations"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <p className="note pad">No obligations match.</p>
      ) : (
        <div className="tw">
          <table className="ob-table">
            <thead>
              <tr>
                <th>Obligation ID</th>
                <th>Description</th>
                <th>Owner</th>
                <th>Trigger</th>
                <th>Deadline</th>
                <th>Source document</th>
                <th>Source clause</th>
                <th>Confidence</th>
                <th>Review status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(o => (
                <Fragment key={o.id}>
                  <tr
                    className="click"
                    data-obligation={o.id}
                    onClick={() => setOpen(open === o.id ? null : o.id)}
                  >
                    <td className="mono">
                      {o.id}
                      {o.version > 1 ? <div className="note">version {o.version}</div> : null}
                    </td>
                    <td className="ob-text">
                      <span className={'b ' + TYPE_TONE[o.type]} style={{ marginRight: 6 }}>
                        {o.type}
                      </span>
                      {o.description}
                    </td>
                    <td>
                      <span className={'b ' + PARTY_TONE[o.party]}>{o.responsibleParty.name}</span>
                    </td>
                    <td>{o.trigger.text}</td>
                    <td className={o.deadline.type === 'UNSPECIFIED' ? 'mono muted' : ''}>
                      {o.deadline.text}
                    </td>
                    <td className="mono">
                      {o.sourceDocument.id}
                      {o.sourceDocument.type ? <div className="note">{o.sourceDocument.type}</div> : null}
                    </td>
                    <td className="mono">
                      §{o.sourceClause.section}
                      <div className="note">
                        {o.sourceClause.clauseId}
                        {o.sourceClause.page ? ` · p. ${o.sourceClause.page}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className={'b ' + confidenceTone(o.confidence)}>
                        {confidenceText(o.confidence)}
                      </span>
                    </td>
                    <td>
                      <span className={'b ' + STATUS_TONE[o.status]}>{statuses[o.status]}</span>
                    </td>
                  </tr>
                  {open === o.id ? (
                    <tr className="ob-detail-row">
                      <td colSpan={9}>
                        <ObligationDetail
                          obligation={o}
                          state={state}
                          reference={reference}
                          onChange={onChange}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* All 12 fields, the mappings (8 fields each), the reviewer actions and the missed-obligation control. */
function ObligationDetail({ obligation: o, state, reference, onChange }) {
  const { register, statuses, frequencies, mappingReview } = state;
  const mappings = register.mappings.filter(m => m.obligationId === o.id);
  const monitor = register.monitors.find(m => m.obligationId === o.id);
  const consequence = consequenceOf(o);

  return (
    <div className="ob-detail" data-section="obligation-detail">
      <dl className="ob-fields">
        <dt>Responsible party</dt>
        <dd>{o.responsibleParty.name}</dd>
        <dt>Beneficiary</dt>
        <dd>{o.beneficiary.name}</dd>
        <dt>Trigger</dt>
        <dd>{o.trigger.text}</dd>
        <dt>Deadline</dt>
        <dd>{o.deadline.text}</dd>
        <dt>Frequency</dt>
        <dd>{frequencies[o.frequency] || o.frequency}</dd>
        <dt>Required evidence</dt>
        <dd>{o.requiredEvidence.length ? o.requiredEvidence.join('; ') : '—'}</dd>
        <dt>Consequence</dt>
        <dd>
          {consequence ? (
            <>
              {consequence.text}
              {consequence.clause ? (
                <span className="note">
                  {' '}
                  (clause {consequence.clause}
                  {consequence.general ? ', general term' : ''})
                </span>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </dd>
        <dt>Status</dt>
        <dd>{statuses[o.status]}</dd>
        <dt>Contract text</dt>
        <dd className="ob-quote">“{o.text}”</dd>
        {o.original ? (
          <>
            <dt>As first extracted</dt>
            <dd className="note">
              {o.original.description} · {o.original.deadline?.text} · {o.original.trigger?.text}
            </dd>
          </>
        ) : null}
        {o.reviewed ? (
          <>
            <dt>Reviewed</dt>
            <dd className="note">
              {o.reviewed.by}, {fmtTime(o.reviewed.at)}
              {o.reviewed.note ? ` — ${o.reviewed.note}` : ''}
            </dd>
          </>
        ) : null}
        {o.downstream ? (
          <>
            <dt>Downstream</dt>
            <dd>Applies to sub-processors as well</dd>
          </>
        ) : null}
      </dl>

      {/* Step 22: the 8 mapping fields. */}
      {mappings.length ? (
        <div className="tw">
          <table className="ob-map">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Clause</th>
                <th>Requirement</th>
                <th>Applicability</th>
                <th>Basis</th>
                <th>Mapping confidence</th>
                <th>Reviewer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.ruleId} data-mapping={m.ruleId}>
                  <td className="mono">
                    {m.ruleId}
                    <div className="note">{m.ruleVersion}</div>
                  </td>
                  <td className="mono">{m.clauseId}</td>
                  <td className="mono">{m.requirementIds.length ? m.requirementIds.join(', ') : '—'}</td>
                  <td>{m.applicabilityStatus === 'APPLICABLE' ? 'Applies' : 'Not applicable'}</td>
                  <td>{m.basis === 'LEGAL' ? 'Legal' : 'Contract'}</td>
                  <td>
                    <span className={'b ' + confidenceTone(m.mappingConfidence)}>
                      {m.mappingConfidence.toFixed(2)}
                    </span>
                    {!m.partyFits ? <div className="note">party does not fit</div> : null}
                  </td>
                  <td>{mappingReview[m.reviewerStatus]}</td>
                  <td>
                    {state.latest ? (
                      <MappingButtons obligation={o} mapping={m} reference={reference} onChange={onChange} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="note">Not mapped to a rule (outside the clause categories).</p>
      )}

      {monitor ? (
        <p className="note">
          <Icon n="clock" s={13} /> Monitoring trigger: {monitor.watch} ·{' '}
          {monitor.state === 'ACTIVE' ? 'active' : 'waiting for a reviewer to verify the obligation'}
        </p>
      ) : null}

      {state.latest ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <ReviewActions obligation={o} state={state} reference={reference} onChange={onChange} />
          <MissedControl
            obligation={o}
            monitor={monitor}
            missed={state.missed}
            reference={reference}
            onChange={onChange}
          />
        </div>
      ) : (
        <p className="note">This is an earlier version. Open the latest version to review obligations.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reviewer actions (step 24: each one is a new version)             */
/* ------------------------------------------------------------------ */

function MappingButtons({ obligation, mapping, reference, onChange }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(action) {
    setBusy(true);
    setError('');
    try {
      onChange(
        await api(`/assessments/${reference}/obligations/review`, {
          method: 'POST',
          body: { obligationId: obligation.id, action, ruleId: mapping.ruleId, note },
        }),
      );
      setRejecting(false);
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Rejecting a mapping needs a short reason, typed in place.
  if (rejecting) {
    return (
      <span className="stack" style={{ gap: 4 }}>
        <input
          value={note}
          maxLength={500}
          placeholder="Why it does not support this rule"
          aria-label={`Why ${obligation.id} does not support ${mapping.ruleId}`}
          onChange={e => setNote(e.target.value)}
        />
        <span className="row" style={{ gap: 4 }}>
          <button
            className="btn sm primary"
            disabled={busy}
            onClick={() => send('REJECT_MAPPING')}
            data-act="confirm-reject-mapping"
          >
            Reject
          </button>
          <button className="btn sm" onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </span>
        {error ? <span className="form-err">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="row" style={{ gap: 4 }}>
      <button
        className="btn sm"
        disabled={busy || mapping.reviewerStatus === 'CONFIRMED'}
        onClick={() => send('CONFIRM_MAPPING')}
        data-act="confirm-mapping"
      >
        Confirm
      </button>
      <button
        className="btn sm"
        disabled={busy || mapping.reviewerStatus === 'REJECTED'}
        onClick={() => setRejecting(true)}
        data-act="reject-mapping"
      >
        Reject
      </button>
      {error ? <span className="form-err">{error}</span> : null}
    </span>
  );
}

function ReviewActions({ obligation: o, state, reference, onChange }) {
  const [mode, setMode] = useState(null); // null, 'edit' or 'reject'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The edit form starts from the current values.
  const [description, setDescription] = useState(o.description);
  const [party, setParty] = useState(o.party);
  const [deadlineType, setDeadlineType] = useState(o.deadline.type);
  const [deadlineText, setDeadlineText] = useState(o.deadline.type === 'UNSPECIFIED' ? '' : o.deadline.text);
  const [triggerType, setTriggerType] = useState(o.trigger.type);
  const [triggerText, setTriggerText] = useState(o.trigger.text);
  const [frequency, setFrequency] = useState(o.frequency);

  async function send(action, extra = {}) {
    setBusy(true);
    setError('');
    try {
      onChange(
        await api(`/assessments/${reference}/obligations/review`, {
          method: 'POST',
          body: { obligationId: o.id, action, note, ...extra },
        }),
      );
      setMode(null);
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function saveEdit() {
    // Only send what changed.
    const changes = {};
    if (description !== o.description) changes.description = description;
    if (party !== o.party) changes.party = party;
    if (
      deadlineType !== o.deadline.type ||
      (deadlineType !== 'UNSPECIFIED' && deadlineText !== o.deadline.text)
    )
      changes.deadline = { type: deadlineType, text: deadlineText };
    if (triggerType !== o.trigger.type || triggerText !== o.trigger.text)
      changes.trigger = { type: triggerType, text: triggerText };
    if (frequency !== o.frequency) changes.frequency = frequency;
    send('EDIT', { changes });
  }

  if (o.status === 'REJECTED')
    return <span className="note">Rejected by a reviewer; it no longer counts.</span>;

  if (mode === 'edit') {
    return (
      <div className="ob-edit stack" data-section="edit-obligation">
        <label>
          Description
          <input value={description} maxLength={300} onChange={e => setDescription(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label>
            Responsible party
            <select value={party} onChange={e => setParty(e.target.value)}>
              {Object.entries(state.parties).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trigger
            <select value={triggerType} onChange={e => setTriggerType(e.target.value)}>
              {Object.entries(state.triggerTypes).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Frequency
            <select value={frequency} onChange={e => setFrequency(e.target.value)}>
              {Object.entries(state.frequencies).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Trigger in words
          <input value={triggerText} maxLength={200} onChange={e => setTriggerText(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label>
            Deadline
            <select value={deadlineType} onChange={e => setDeadlineType(e.target.value)}>
              {Object.entries(state.deadlineTypes).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {deadlineType !== 'UNSPECIFIED' ? (
            <label style={{ flex: 1 }}>
              As the contract states it
              <input
                value={deadlineText}
                maxLength={200}
                placeholder="within 24 hours"
                onChange={e => setDeadlineText(e.target.value)}
              />
            </label>
          ) : null}
        </div>
        <label>
          Why (shown in the history)
          <textarea
            rows={2}
            value={note}
            maxLength={1000}
            onChange={e => setNote(e.target.value)}
            placeholder="For example: Schedule 2 shortens the notice period"
          />
        </label>
        {error ? <span className="form-err">{error}</span> : null}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary sm" disabled={busy} onClick={saveEdit} data-act="save-edit">
            {busy ? 'Saving…' : 'Save as a new version'}
          </button>
          <button className="btn sm" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
        <span className="note">
          The contract text and source clause never change; the extracted values are kept.
        </span>
      </div>
    );
  }

  if (mode === 'reject') {
    return (
      <div className="ob-edit stack" data-section="reject-obligation">
        <textarea
          rows={2}
          value={note}
          maxLength={1000}
          onChange={e => setNote(e.target.value)}
          placeholder="Why this is not an obligation (at least 5 characters)"
          aria-label="Why it is rejected"
        />
        {error ? <span className="form-err">{error}</span> : null}
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn sm primary"
            disabled={busy}
            onClick={() => send('REJECT')}
            data-act="confirm-reject"
          >
            Reject
          </button>
          <button className="btn sm" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <span className="row" style={{ gap: 6 }}>
      {o.status !== 'VERIFIED' ? (
        <button
          className="btn sm primary"
          disabled={busy}
          onClick={() => send('VERIFY')}
          data-act="verify-obligation"
        >
          Verify
        </button>
      ) : null}
      <button className="btn sm" onClick={() => setMode('edit')} data-act="edit-obligation">
        Correct
      </button>
      <button className="btn sm" onClick={() => setMode('reject')} data-act="reject-obligation">
        Not an obligation
      </button>
      {error ? <span className="form-err">{error}</span> : null}
    </span>
  );
}

/* Report a monitored obligation as missed: it becomes a Stage 8 action. Only for active triggers. */
function MissedControl({ obligation, monitor, missed, reference, onChange }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (obligation.type === 'Right' || !monitor) return null;

  const action = missed.filter(m => m.obligationId === obligation.id).at(-1);
  const active = action && ['OPEN', 'RETURNED', 'SUBMITTED'].includes(action.status);

  async function send() {
    setBusy(true);
    setError('');
    try {
      onChange(
        await api(`/assessments/${reference}/obligations/${obligation.id}/missed`, {
          method: 'POST',
          body: { note },
        }),
      );
      setNote('');
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob-missed">
      {action ? (
        <Link
          className={'b ' + (active ? 'b-coral' : 'b-sage')}
          to={'/remediation/' + reference}
          data-missed={obligation.id}
        >
          Missed · {action.code} · {action.statusLabel}
        </Link>
      ) : null}

      {monitor.state !== 'ACTIVE' ? (
        <span className="note">Verify it before it can be escalated.</span>
      ) : !active && !open ? (
        <button className="btn sm" onClick={() => setOpen(true)} data-act="report-missed">
          {action ? 'Report again' : 'Report missed'}
        </button>
      ) : null}

      {open ? (
        <div className="ob-missed-form" data-section="report-missed">
          <textarea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={e => setNote(e.target.value)}
            aria-label={'What was missed: ' + obligation.id}
            placeholder="What was missed and when (at least 10 characters)"
          />
          {error ? <span className="form-err">{error}</span> : null}
          <div className="row">
            <button className="btn primary sm" disabled={busy} onClick={send} data-act="send-missed">
              {busy ? 'Sending…' : obligation.party === 'buyer' ? 'Create action' : 'Send to the vendor'}
            </button>
            <button className="btn sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <span className="note">It becomes an action in Stage 8, due in 14 days.</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 24 · monitoring triggers and history                         */
/* ------------------------------------------------------------------ */

function MonitorsCard({ register, frequencies }) {
  if (!register.monitors.length) return null;

  return (
    <section className="card" data-section="obligations-monitors">
      <div className="ch">
        <div>
          <h2>Step 24 · Monitoring triggers</h2>
          <div className="sub">
            Obligations with a deadline, a repeat or an event. Low-confidence ones wait for a reviewer before
            any escalation.
          </div>
        </div>
        <span className="note">{register.totals.monitored} active</span>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Obligation</th>
              <th>Watch for</th>
              <th>How often</th>
              <th>If missed</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {register.monitors.map(m => (
              <tr key={m.obligationId} data-monitor={m.obligationId}>
                <td className="mono">{m.obligationId}</td>
                <td>{m.watch}</td>
                <td>{frequencies[m.frequency] || m.frequency}</td>
                <td className="note">
                  {m.escalation
                    ? m.escalation.length > 90
                      ? m.escalation.slice(0, 88) + '…'
                      : m.escalation
                    : '—'}
                </td>
                <td>
                  <span className={'b ' + (m.state === 'ACTIVE' ? 'b-sage' : 'b-amber')}>
                    {m.state === 'ACTIVE' ? 'Active' : 'Awaiting verification'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* Every version of the register: extractions and reviewer edits, with who and why. */
function HistoryCard({ state, onPick }) {
  if (state.versions.length < 2 && !state.register.edits.length) return null;

  return (
    <section className="card" data-section="obligations-history">
      <div className="ch">
        <div>
          <h2>Register history</h2>
          <div className="sub">
            Each extraction and each reviewer edit is a locked version. Edits keep the original contractual
            source.
          </div>
        </div>
      </div>
      <ul className="cp-gaps pad" style={{ paddingTop: 0 }}>
        {state.versions.map(v => (
          <li key={v.version}>
            <button className="btn sm" onClick={() => onPick(v.version)}>
              v{v.label}
            </button>
            <span>
              {v.trigger === 'review'
                ? 'Reviewer edit'
                : `Extracted from contract analysis v${v.contractVersion}`}{' '}
              · {v.createdBy} · {fmtTime(v.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      {state.register.edits.length ? (
        <div className="pad" style={{ paddingTop: 0 }}>
          <h3 style={{ margin: '0 0 6px' }}>Reviewer edits in force</h3>
          <ul className="cp-gaps">
            {state.register.edits.map((edit, index) => (
              <li key={index}>
                <span className="b b-mute">{edit.action.replace('_', ' ').toLowerCase()}</span>
                <span>
                  <span className="mono">{edit.obligationId}</span>
                  {edit.ruleId ? ` → ${edit.ruleId}` : ''} · {edit.by} · {fmtTime(edit.at)}
                  {edit.note ? ` — ${edit.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
