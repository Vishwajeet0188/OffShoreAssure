import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { fmtBytes } from '../lib/requirements.js';
import { serviceLabel } from '../lib/assessments.js';
import { uploadContract, contractFileUrl, CONFIDENCE_TONE } from '../lib/contracts.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';

const STEPS = [
  [17, 'Upload contract'],
  [18, 'Extract clauses'],
  [19, 'Saved'],
  [20, 'Clause list'],
];

/* Stage 4 landing page: every assessment and whether its contract has been analysed. */
export function ContractList() {
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
        eyebrow="Buyer · Stage 4 · Contract analysis"
        title="Contract analysis"
        lead="Upload the contract with your selected vendor. OffshoreAssure reads it, lists every clause and shows which important topics it covers."
      />
      <div className="card" data-section="contract-list">
        {error ? <p className="form-err pad">{error}</p> : null}
        {!assessments ? (
          <Loading pad />
        ) : assessments.length === 0 ? (
          <p className="note pad">No assessments yet. Start with <Link className="link" to="/requirements">Stage 1 · Requirement</Link>.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr><th>Assessment</th><th>Service</th><th>Vendor</th><th>Contract</th><th></th></tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr key={assessment.reference} className="click" onClick={() => navigate('/contract/' + assessment.reference)}>
                    <td>
                      <Link className="adm-ulink" to={'/contract/' + assessment.reference} onClick={e => e.stopPropagation()}>
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td><ContractStatus assessment={assessment} /></td>
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

function ContractStatus({ assessment }) {
  if (assessment.contract) {
    const { version, totals } = assessment.contract;
    return <Badge s="Complete" label={`v${version} · ${totals.clauses} clauses`} />;
  }
  if (!assessment.selectedVendor) return <span className="muted">Select a vendor first</span>;
  if (assessment.compliance?.status !== 'submitted') return <span className="muted">Waiting for Stage 3</span>;
  return <span className="muted">Not uploaded</span>;
}

/* Stage 4 for one assessment: upload (step 17) and the analysis (steps 18–20). */
export default function ContractAnalysis() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback((version) => {
    const query = version ? `?version=${version}` : '';
    return api(`/assessments/${ref}/contract${query}`)
      .then(setState)
      .catch(err => setError(err.message));
  }, [ref]);

  useEffect(() => { load(); }, [load]);

  if (error && !state) return <p className="form-err">{error}</p>;
  if (!state) return <Loading />;

  const hasContract = state.versions.length > 0;
  const lastDoneStep = hasContract ? 20 : 16;

  return (
    <div className="vs">
      <Link className="link" to="/contract" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>← Contract analysis</Link>
      <PageHead
        eyebrow={`Buyer · Stage 4 · Contract analysis · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Contract with ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 4 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={number <= lastDoneStep ? 'done' : ''}>
            <span className="journey-n">{number}</span>{title}
          </li>
        ))}
      </ol>

      {state.blocked ? (
        <BlockedNotice reason={state.blocked} reference={ref} hasVendor={!!state.vendor} />
      ) : (
        <UploadCard
          reference={ref}
          isNewVersion={hasContract}
          rules={state.rules}
          onUploaded={setState}
        />
      )}

      {hasContract && state.analysis ? (
        <>
          <VersionBar state={state} reference={ref} onPick={load} />
          <SummaryCard analysis={state.analysis} />
          <TopicsCard analysis={state.analysis} />
          <ClauseList analysis={state.analysis} />
          <div className="card rq-next">
            <Icon n="clock" s={20} />
            <div>
              <b>Stage 4 is complete for this assessment. Next: Stage 5 — Obligation extraction.</b>{' '}
              <span className="note">The obligations in these clauses will be listed with who must do what. Not available yet (next build stage).</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function BlockedNotice({ reason, reference, hasVendor }) {
  const link = hasVendor
    ? <Link className="link" to={'/compliance/' + reference}>Open the compliance assessment</Link>
    : <Link className="link" to={'/vendor-selection/' + reference}>Open vendor selection</Link>;

  return (
    <section className="card pad stack" data-section="contract-blocked">
      <h2 style={{ margin: 0 }}>Upload the contract</h2>
      <div className="rq-flag warning"><Icon n="alert" s={16} /><span>{reason} {link}</span></div>
    </section>
  );
}

function UploadCard({ reference, isNewVersion, rules, onUploaded }) {
  const fileInput = useRef(null);
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(!isNewVersion);

  async function handleFile(file) {
    if (fileInput.current) fileInput.current.value = ''; // lets the same file be picked again after an error
    setMessage(null);

    if (isNewVersion && reason.trim().length < 10) {
      setMessage({ tone: 'err', text: 'Say why you are uploading a new version (at least 10 characters).' });
      return;
    }

    setBusy(true);
    try {
      const result = await uploadContract(reference, file, { label, reason });
      onUploaded(result);
      setLabel('');
      setReason('');
      setOpen(false);
      const { clauses, relevant } = result.analysis.totals;
      setMessage({ tone: 'ok', text: `Contract v${result.shownVersion} analysed: ${clauses} clauses found, ${relevant} relevant.` });
    } catch (err) {
      setMessage({ tone: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        {message ? <div className={'rq-msg ' + message.tone} role="status"><b>{message.text}</b></div> : null}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setOpen(true)} data-act="new-contract-version">
            <Icon n="upload" s={14} />Upload a new version
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="card pad stack" data-section="contract-upload">
      <h2 style={{ margin: 0 }}>{isNewVersion ? 'Upload a new version' : 'Step 17 · Upload the contract'}</h2>
      <p style={{ margin: 0 }}>
        Upload the agreement with the vendor, including any data processing schedule.
        OffshoreAssure extracts the text, splits it into clauses and shows which topics are covered.
      </p>
      <ul className="cp-facts">
        <li><Icon n="doc" s={15} />PDF, Word (.docx) or text, up to {fmtBytes(rules.maxBytes)}</li>
        <li><Icon n="shield" s={15} />The original file is encrypted and kept unchanged</li>
        <li><Icon n="scan" s={15} />Scanned PDFs without text cannot be read</li>
      </ul>

      <div className="ca-form">
        <label>
          <span>Label <span className="note">(optional)</span></span>
          <input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Draft from vendor, Signed copy" />
        </label>
        {isNewVersion ? (
          <label>
            <span>Why a new version?</span>
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="e.g. Signed copy received from the vendor" data-field="reason" />
          </label>
        ) : null}
      </div>

      {message ? <div className={'rq-msg ' + message.tone} role="status"><b>{message.text}</b></div> : null}

      <div className="row" style={{ gap: 8 }}>
        <label className={'btn primary' + (busy ? ' disabled' : '')} aria-disabled={busy}>
          <Icon n="upload" s={15} />{busy ? 'Reading the contract…' : 'Choose contract file'}
          <input
            ref={fileInput}
            type="file"
            hidden
            disabled={busy}
            accept={rules.formats.map(ext => '.' + ext).join(',')}
            data-upload="contract"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
          />
        </label>
        {isNewVersion ? <button className="btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button> : null}
      </div>
    </section>
  );
}

function VersionBar({ state, reference, onPick }) {
  const shown = state.versions.find(v => v.version === state.shownVersion);

  return (
    <section className="card pad ca-version" data-section="contract-version">
      <div className="ca-version-main">
        <Icon n="doc" s={20} />
        <div>
          <b>{shown.fileName}</b>
          {shown.label ? <span className="b b-plum" style={{ marginLeft: 8 }}>{shown.label}</span> : null}
          <div className="note">
            Version {shown.version} · {shown.pages} page{shown.pages === 1 ? '' : 's'} · {shown.words.toLocaleString('en-GB')} words · {fmtBytes(shown.size)} ·
            uploaded {fmtTime(shown.uploadedAt)} by {shown.uploadedBy}
          </div>
          {shown.changeReason ? <div className="note">Reason: {shown.changeReason}</div> : null}
          <div className="note">File fingerprint <span className="mono">{shown.sha256.slice(0, 16)}…</span></div>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {state.versions.length > 1 ? (
          <select aria-label="Contract version" value={state.shownVersion} onChange={e => onPick(Number(e.target.value))}>
            {state.versions.map(v => (
              <option key={v.version} value={v.version}>
                v{v.version}{v.label ? ` · ${v.label}` : ''}{v.version === state.versions[0].version ? ' (latest)' : ''}
              </option>
            ))}
          </select>
        ) : null}
        <a className="btn sm" href={contractFileUrl(reference, shown.version)}><Icon n="doc" s={14} />Download original</a>
      </div>
    </section>
  );
}

function SummaryCard({ analysis }) {
  const { totals } = analysis;
  const figures = [
    ['Clauses found', totals.clauses],
    ['Relevant clauses', totals.relevant],
    ['Topics covered', totals.topicsFound],
    ['Expected topics not found', totals.expectedNotFound],
  ];

  return (
    <section className="card cp-result" data-section="contract-summary">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Steps 18–20 · Contract analysis</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>What the contract covers</h2>
          <div className="note">
            Analysed {fmtTime(analysis.createdAt)} · fingerprint <span className="mono">{analysis.snapshotSha256.slice(0, 16)}…</span> · rule pack {analysis.rulePackVersion}
          </div>
        </div>
      </div>
      <div className="ca-figures">
        {figures.map(([label, value]) => (
          <div key={label} className={label.startsWith('Expected') && value > 0 ? 'warn' : ''}>
            <b>{value}</b><span>{label}</span>
          </div>
        ))}
      </div>
      {analysis.notFound.length ? (
        <div className="asr-block" data-section="contract-not-found">
          <h3>Not found in the contract</h3>
          <ul className="cp-gaps">
            {analysis.notFound.map(item => (
              <li key={item.topicId}><span className="b b-coral">Not found</span><span>{item.text}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ir-foot note"><Icon n="shield" s={14} /> {analysis.note}</p>
    </section>
  );
}

function TopicsCard({ analysis }) {
  return (
    <section className="card" data-section="contract-topics">
      <div className="ch">
        <div>
          <h2>Topics</h2>
          <div className="sub">Each topic, the clauses that cover it and the assurance controls it relates to.</div>
        </div>
      </div>
      <ul className="ca-topics">
        {analysis.topics.map(topic => (
          <li key={topic.id} className={topic.status === 'FOUND' ? 'found' : topic.expected ? 'missing' : ''}>
            <div>
              <b>{topic.name}</b>
              {topic.controls.length ? <span className="note"> · {topic.controls.join(', ')}</span> : null}
            </div>
            {topic.status === 'FOUND' ? (
              <span className="ca-chips">{topic.clauseNumbers.map(number => <span key={number} className="mono">{number}</span>)}</span>
            ) : topic.expected ? (
              <span className="b b-coral">Not found</span>
            ) : (
              <span className="b b-mute">Not in this contract</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClauseList({ analysis }) {
  const [filter, setFilter] = useState('relevant');
  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState({});

  const topicName = useMemo(
    () => Object.fromEntries(analysis.topics.map(topic => [topic.id, topic.name])),
    [analysis.topics]
  );

  const visible = analysis.clauses.filter(clause => {
    if (filter === 'relevant' && !clause.relevant) return false;
    if (filter !== 'all' && filter !== 'relevant' && !clause.topics.some(t => t.topicId === filter)) return false;
    if (search) {
      const haystack = `${clause.number} ${clause.heading} ${clause.text}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const toggle = id => setOpenIds(current => ({ ...current, [id]: !current[id] }));

  return (
    <section className="card" data-section="contract-clauses">
      <div className="ch">
        <div>
          <h2>Clause list</h2>
          <div className="sub">Open a clause to read it, with the topics it covers and any time limits or figures it states.</div>
        </div>
        <span className="note">{visible.length} of {analysis.clauses.length}</span>
      </div>

      <div className="ca-filters">
        <select aria-label="Filter clauses" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="relevant">Relevant clauses</option>
          <option value="all">All clauses</option>
          {analysis.topics.filter(t => t.status === 'FOUND').map(topic => (
            <option key={topic.id} value={topic.id}>{topic.name}</option>
          ))}
        </select>
        <input type="search" placeholder="Search the clauses" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search the clauses" />
      </div>

      {visible.length === 0 ? <p className="note pad">No clauses match.</p> : (
        <div className="cp-controls">
          {visible.map(clause => {
            const isOpen = !!openIds[clause.id];
            return (
              <div key={clause.id} className={'cp-ctl' + (isOpen ? ' open' : '')} data-clause={clause.number}>
                <button className="cp-ctl-h ca-clause-h" onClick={() => toggle(clause.id)} aria-expanded={isOpen}>
                  <span className="rid">{clause.number}</span>
                  <b>{clause.heading || clause.text.slice(0, 60) + (clause.text.length > 60 ? '…' : '')}</b>
                  <span className="ca-tags">
                    {clause.topics.slice(0, 2).map(t => <span key={t.topicId} className="b b-plum">{topicName[t.topicId]}</span>)}
                    {clause.topics.length > 2 ? <span className="note">+{clause.topics.length - 2}</span> : null}
                  </span>
                  <span className="note">p. {clause.page}</span>
                </button>
                {isOpen ? (
                  <div className="cp-ctl-b">
                    <p className="ca-text">{clause.text}</p>
                    {clause.keyTerms.length ? (
                      <div className="ca-terms">
                        {clause.keyTerms.map((term, index) => (
                          <span key={index} className="b b-amber">{term.kind}: {term.value}</span>
                        ))}
                      </div>
                    ) : null}
                    {clause.topics.length ? (
                      <ul className="ca-why">
                        {clause.topics.map(t => (
                          <li key={t.topicId}>
                            <b>{topicName[t.topicId]}</b>
                            <span className={'b ' + CONFIDENCE_TONE[t.confidence]}>{t.confidence} confidence</span>
                            <span className="note">matched on: {t.matchedOn.join(', ')}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="note" style={{ margin: 0 }}>Not linked to any topic.</p>}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
