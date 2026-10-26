import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import { PARTY_TONE, TYPE_TONE, CONFIDENCE_TONE, describeTiming } from '../lib/obligations.js';
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

/* Stage 5 landing page: every assessment and whether its obligations have been extracted. */
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
          <p className="note pad">No assessments yet. Start with <Link className="link" to="/requirements">Stage 1 · Requirement</Link>.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr><th>Assessment</th><th>Service</th><th>Vendor</th><th>Obligations</th><th></th></tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr key={assessment.reference} className="click" onClick={() => navigate('/obligations/' + assessment.reference)}>
                    <td>
                      <Link className="adm-ulink" to={'/obligations/' + assessment.reference} onClick={e => e.stopPropagation()}>
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td><RegisterStatus assessment={assessment} /></td>
                    <td style={{ textAlign: 'right' }}><span className="link">Open <Icon n="arrow" s={13} /></span></td>
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
    return <Badge s="Complete" label={`v${register.version} · ${obligations + prohibitions + rights} items`} />;
  }
  if (assessment.contract) return <span className="muted">Ready to extract</span>;
  return <span className="muted">Waiting for Stage 4</span>;
}

/* Stage 5 for one assessment. */
export default function Obligations() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback((version) => {
    const query = version ? `?version=${version}` : '';
    return api(`/assessments/${ref}/obligations${query}`)
      .then(setState)
      .catch(err => setError(err.message));
  }, [ref]);

  useEffect(() => { load(); }, [load]);

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
      <Link className="link" to="/obligations" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>← Obligation extraction</Link>
      <PageHead
        eyebrow={`Buyer · Stage 5 · Obligation extraction · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Contract with ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 5 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={number <= lastDoneStep ? 'done' : ''}>
            <span className="journey-n">{number}</span>{title}
          </li>
        ))}
      </ol>

      {error ? <div className="rq-msg err" role="alert"><b>{error}</b></div> : null}

      {state.blocked ? (
        <section className="card pad stack" data-section="obligations-blocked">
          <h2 style={{ margin: 0 }}>Extract the obligations</h2>
          <div className="rq-flag warning">
            <Icon n="alert" s={16} />
            <span>{state.blocked} <Link className="link" to={'/contract/' + ref}>Open contract analysis</Link></span>
          </div>
        </section>
      ) : state.canExtract ? (
        <ExtractCard state={state} busy={busy} onExtract={extract} />
      ) : null}

      {register ? (
        <>
          <VersionBar state={state} onPick={load} />
          <SummaryCard register={register} />
          <RuleTrace register={register} />
          <RegisterTable register={register} topics={state.topics} parties={state.parties} missed={state.missed || []} reference={ref} latest={!state.versions.length || state.versions[0].version === register.version} onChange={setState} />
          <div className="card rq-next">
            <Icon n="clock" s={20} />
            <div>
              <b>Stage 5 is complete for this assessment. Next: Stage 6 — Transfer assessment.</b>{' '}
              <span className="note">Check every route your data takes out of the UK.</span>
            </div>
            <Link className="btn primary" to={'/transfers/' + state.assessment.reference} data-act="go-transfers">Open transfer assessment</Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ExtractCard({ state, busy, onExtract }) {
  const isUpdate = state.versions.length > 0;
  return (
    <section className="card pad stack" data-section="obligations-extract">
      <h2 style={{ margin: 0 }}>{isUpdate ? `A newer contract (v${state.contract.version}) is available` : 'Step 21 · Extract the obligations'}</h2>
      <p style={{ margin: 0 }}>
        OffshoreAssure reads the <b>{state.contract.clauses} clauses</b> of <b>{state.contract.fileName}</b> (v{state.contract.version}),
        finds every obligation, prohibition and right, works out who each one applies to, and checks them against the rules.
      </p>
      <ul className="cp-facts">
        <li><Icon n="users" s={15} />Vendor, buyer or both</li>
        <li><Icon n="clock" s={15} />Deadlines and how often</li>
        <li><Icon n="doc" s={15} />Linked to the source clause</li>
      </ul>
      <div>
        <button className="btn primary" onClick={onExtract} disabled={busy} data-act="extract-obligations">
          {busy ? 'Extracting…' : isUpdate ? `Extract again from contract v${state.contract.version}` : 'Extract obligations'}
        </button>
      </div>
    </section>
  );
}

function VersionBar({ state, onPick }) {
  const register = state.register;
  return (
    <section className="card pad ca-version" data-section="obligations-version">
      <div className="ca-version-main">
        <Icon n="list" s={20} />
        <div>
          <b>Obligation register v{register.version}</b>
          <div className="note">
            From contract v{register.contractVersion} · saved {fmtTime(register.createdAt)} · rule pack {register.rulePackVersion}
          </div>
          <div className="note">Fingerprint <span className="mono">{register.snapshotSha256.slice(0, 16)}…</span></div>
        </div>
      </div>
      {state.versions.length > 1 ? (
        <select aria-label="Register version" value={register.version} onChange={e => onPick(Number(e.target.value))}>
          {state.versions.map(v => (
            <option key={v.version} value={v.version}>
              v{v.version} · contract v{v.contractVersion}{v.version === state.versions[0].version ? ' (latest)' : ''}
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
    ['With a deadline', totals.withDeadline],
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
          <div className="eyebrow">Steps 21–23 · Obligations, sources and confidence</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>Who must do what</h2>
          <div className="ob-parties">
            {parties.map(([label, value, tone]) => <span key={label} className={'b ' + tone}>{label}: {value}</span>)}
          </div>
        </div>
      </div>
      <div className="ca-figures">
        {figures.map(([label, value]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}
      </div>
      {register.gaps.length ? (
        <div className="asr-block" data-section="obligations-gaps">
          <h3>Gaps</h3>
          <ul className="cp-gaps">
            {register.gaps.map(gap => (
              <li key={gap.ruleId}><span className="b b-coral">No obligation</span><span>{gap.text} <span className="note">({gap.source})</span></span></li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ir-foot note"><Icon n="shield" s={14} /> {register.note}</p>
    </section>
  );
}

function RuleTrace({ register }) {
  return (
    <section className="card" data-section="obligations-rules">
      <div className="ch">
        <div>
          <h2>Step 22 · Rule trace</h2>
          <div className="sub">Each rule, whether an obligation in the contract covers it, and which ones.</div>
        </div>
        <span className="note">{register.totals.rulesCovered} of {register.totals.rulesTotal} covered</span>
      </div>
      <ul className="ob-rules">
        {register.ruleTrace.map(rule => (
          <li key={rule.id} className={rule.status === 'COVERED' ? 'covered' : rule.appliesToRequirement ? 'missing' : ''}>
            <div>
              <span className="rid">{rule.id}</span> <b>{rule.text}</b>
              <div className="note">{rule.source}{rule.controls.length ? ` · ${rule.controls.join(', ')}` : ''}</div>
            </div>
            {rule.status === 'COVERED' ? (
              <span className="ca-chips">{rule.obligationIds.map(id => <span key={id} className="mono">{id}</span>)}</span>
            ) : rule.appliesToRequirement ? (
              <span className="b b-coral">Not found</span>
            ) : (
              <span className="b b-mute">Not needed</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RegisterTable({ register, topics, parties, missed, reference, latest, onChange }) {
  const [reporting, setReporting] = useState(null);
  const [party, setParty] = useState('all');
  const [topic, setTopic] = useState('all');
  const [search, setSearch] = useState('');

  const topicName = Object.fromEntries(topics.map(t => [t.id, t.name]));
  const usedTopics = topics.filter(t => register.obligations.some(o => o.topics.includes(t.id)));

  const visible = register.obligations.filter(obligation => {
    if (party !== 'all' && obligation.party !== party) return false;
    if (topic !== 'all' && !obligation.topics.includes(topic)) return false;
    if (search && !obligation.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <section className="card" data-section="obligations-register">
      <div className="ch">
        <div>
          <h2>Step 23 · Obligation register</h2>
          <div className="sub">Every obligation, prohibition and right, with the clause it comes from.</div>
        </div>
        <span className="note">{visible.length} of {register.obligations.length}</span>
      </div>

      <div className="ca-filters">
        <select aria-label="Filter by party" value={party} onChange={e => setParty(e.target.value)}>
          <option value="all">All parties</option>
          {Object.entries(parties).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Filter by topic" value={topic} onChange={e => setTopic(e.target.value)}>
          <option value="all">All topics</option>
          {usedTopics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="search" placeholder="Search the obligations" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search the obligations" />
      </div>

      {visible.length === 0 ? <p className="note pad">No obligations match.</p> : (
        <div className="tw">
          <table className="ob-table">
            <thead>
              <tr><th>Ref</th><th>Who</th><th>Obligation</th><th>When</th><th>If missed</th><th>Source</th><th>Confidence</th></tr>
            </thead>
            <tbody>
              {visible.map(obligation => (
                <tr key={obligation.id} data-obligation={obligation.id}>
                  <td className="mono">{obligation.id}</td>
                  <td>
                    <span className={'b ' + PARTY_TONE[obligation.party]}>{parties[obligation.party]}</span>
                    <div><span className={'b ' + TYPE_TONE[obligation.type]} style={{ marginTop: 4 }}>{obligation.type}</span></div>
                  </td>
                  <td className="ob-text">
                    {obligation.text}
                    {obligation.topics.length ? <div className="note">{obligation.topics.map(id => topicName[id]).join(' · ')}</div> : null}
                    {obligation.requirementControls.length ? <div className="note">Requirement controls: {obligation.requirementControls.join(', ')}</div> : null}
                  </td>
                  <td>{describeTiming(obligation) || <span className="muted">—</span>}
                    {obligation.monitored ? <div><span className="b b-plum" style={{ marginTop: 4 }}>Monitored</span></div> : null}</td>
                  <td className="ob-if-missed">
                    <Consequence obligation={obligation} />
                    <MissedControl obligation={obligation} action={missed.filter(m => m.obligationId === obligation.id).at(-1)} canReport={latest}
                      open={reporting === obligation.id} onOpen={() => setReporting(obligation.id)} onClose={() => setReporting(null)} reference={reference} onChange={onChange} />
                  </td>
                  <td className="mono">Clause {obligation.source.clauseNumber}<div className="note">p. {obligation.source.page}</div></td>
                  <td><span className={'b ' + CONFIDENCE_TONE[obligation.confidence]}>{obligation.confidence}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* What the contract says happens if the obligation is missed. */
function Consequence({ obligation }) {
  if (obligation.type === 'Right') return <span className="muted">—</span>;
  if (obligation.consequence === undefined) return <span className="muted">Extract again to see it</span>;
  if (!obligation.consequence) return <span className="note">Not stated in the contract</span>;
  return (
    <div className="note" title={obligation.consequence.text}>
      {obligation.consequence.text.length > 90 ? obligation.consequence.text.slice(0, 88) + '…' : obligation.consequence.text}
      <div>Clause {obligation.consequence.clauseNumber}{obligation.consequence.scope === 'contract' ? ' (general term)' : ''}</div>
    </div>
  );
}

/* Report a monitored obligation as missed: it becomes a Stage 8 action for whoever owns it. */
function MissedControl({ obligation, action, canReport, open, onOpen, onClose, reference, onChange }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (obligation.type === 'Right') return null;
  const active = action && ['OPEN', 'RETURNED', 'SUBMITTED'].includes(action.status);
  const canOpen = canReport && !active && (obligation.monitored || action);

  async function send() {
    setBusy(true); setError('');
    try {
      onChange(await api(`/assessments/${reference}/obligations/${obligation.id}/missed`, { method: 'POST', body: { note } }));
      setNote(''); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="ob-missed">
      {action ? (
        <Link className={'b ' + (active ? 'b-coral' : 'b-sage')} to={'/remediation/' + reference} data-missed={obligation.id}>
          Missed · {action.code} · {action.statusLabel}
        </Link>
      ) : null}
      {canOpen && !open ? <button className="btn sm" onClick={onOpen} data-act="report-missed">{action ? 'Report again' : 'Report missed'}</button> : null}
      {open ? (
        <div className="ob-missed-form" data-section="report-missed">
          <textarea rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} aria-label={'What was missed: ' + obligation.id}
            placeholder="What was missed and when (at least 10 characters)" />
          {error ? <span className="form-err">{error}</span> : null}
          <div className="row">
            <button className="btn primary sm" disabled={busy} onClick={send} data-act="send-missed">{busy ? 'Sending…' : obligation.party === 'buyer' ? 'Create action' : 'Send to the vendor'}</button>
            <button className="btn sm" onClick={onClose}>Cancel</button>
          </div>
          <span className="note">It becomes an action in Stage 8, due in 14 days.</span>
        </div>
      ) : null}
    </div>
  );
}
