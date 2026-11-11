import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime, fmtDate } from '../lib/format.js';
import { fmtBytes } from '../lib/requirements.js';
import { serviceLabel } from '../lib/assessments.js';
import {
  uploadContract,
  contractFileUrl,
  FINDING_TONE,
  REVIEW_TONE,
  EXECUTION_LABEL,
  EXTRACTION_LABEL,
  confidenceText,
} from '../lib/contracts.js';
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
        lead="Upload the contract documents with your selected vendor (MSA, DPA, SLA, schedules). OffshoreAssure reads every clause and checks it against 20 clause categories."
      />
      <div className="card" data-section="contract-list">
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
                  <th>Contract</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr
                    key={assessment.reference}
                    className="click"
                    onClick={() => navigate('/contract/' + assessment.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/contract/' + assessment.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td>
                      <ContractStatus assessment={assessment} />
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

function ContractStatus({ assessment }) {
  if (assessment.contract) {
    const { version, totals, status } = assessment.contract;
    return status === 'HUMAN_REVIEW' ? (
      <Badge s="In review" label={`Analysis v${version} · human review needed`} />
    ) : (
      <Badge s="Complete" label={`Analysis v${version} · ${totals.clauses} clauses`} />
    );
  }
  if (!assessment.selectedVendor) return <span className="muted">Select a vendor first</span>;
  if (!['submitted', 'clarification'].includes(assessment.compliance?.status))
    return <span className="muted">Waiting for Stage 3</span>;
  return <span className="muted">Not uploaded</span>;
}

/* Stage 4 for one assessment: upload (step 17), the clause register and findings (steps 18–20). */
export default function ContractAnalysis() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    version =>
      api(`/assessments/${ref}/contract${version ? `?version=${version}` : ''}`)
        .then(setState)
        .catch(err => setError(err.message)),
    [ref],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error && !state) return <p className="form-err">{error}</p>;
  if (!state) return <Loading />;
  const a = state.analysis;
  const latest = state.versions[0]?.version;
  const lastDoneStep = a ? 20 : 16;

  return (
    <div className="vs">
      <Link className="link" to="/contract" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        ← Contract analysis
      </Link>
      <PageHead
        eyebrow={`Buyer · Stage 4 · Contract analysis · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Contract with ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />
      <ol className="vs-steps" aria-label="Stage 4 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={number <= lastDoneStep ? 'done' : ''}>
            <span className="journey-n">{number}</span>
            {title}
          </li>
        ))}
      </ol>

      {state.blocked ? (
        <BlockedNotice reason={state.blocked} reference={ref} hasVendor={!!state.vendor} />
      ) : (
        <UploadCard state={state} reference={ref} onUploaded={setState} />
      )}

      {state.documents.length ? <DocumentsCard state={state} reference={ref} /> : null}

      {a ? (
        <>
          <VersionBar state={state} onPick={load} />
          <SummaryCard state={state} analysis={a} />
          <FindingsCard
            state={state}
            analysis={a}
            reference={ref}
            editable={a.version === latest && !a.legacy}
            onSaved={setState}
          />
          <ClauseList
            state={state}
            analysis={a}
            reference={ref}
            editable={a.version === latest && !a.legacy}
            onSaved={setState}
          />
          <HistoryCard state={state} analysis={a} onPick={load} />
          <div className="card rq-next">
            <Icon n="clock" s={20} />
            <div>
              <b>Next: Stage 5 — Obligation extraction.</b>{' '}
              <span className="note">List who must do what, and by when, from these clauses.</span>
            </div>
            <Link className="btn primary" to={'/obligations/' + ref} data-act="go-obligations">
              Open obligations
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function BlockedNotice({ reason, reference, hasVendor }) {
  const link = hasVendor ? (
    <Link className="link" to={'/compliance/' + reference}>
      Open the compliance assessment
    </Link>
  ) : (
    <Link className="link" to={'/vendor-selection/' + reference}>
      Open vendor selection
    </Link>
  );
  return (
    <section className="card pad stack" data-section="contract-blocked">
      <h2 style={{ margin: 0 }}>Upload the contract</h2>
      <div className="rq-flag warning">
        <Icon n="alert" s={16} />
        <span>
          {reason} {link}
        </span>
      </div>
    </section>
  );
}

/* Step 17: the 11 input fields and the file. */
function UploadCard({ state, reference, onUploaded }) {
  const d = state.form.defaults;
  const current = state.documents.filter(x => x.current);
  const blank = () => ({
    documentType: current.length ? 'DPA' : d.documentType,
    title: '',
    governingLaw: d.governingLaw,
    effectiveOn: '',
    expiresOn: '',
    expiryExplanation: '',
    executionStatus: d.executionStatus,
    language: d.language,
    replaces: '',
    reason: '',
  });
  const [open, setOpen] = useState(!state.documents.length);
  const [f, setF] = useState(blank);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const set = k => e => setF(x => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const bad = k => (err?.field === k ? 'true' : undefined);
  const lawCountries = state.form.governingLaws.filter(x => !x.code.startsWith('GB-'));

  const submit = async e => {
    e.preventDefault();
    if (!file) return setErr({ text: 'Choose the contract file (PDF or Word).', field: 'file' });
    setBusy(true);
    setErr(null);
    try {
      const result = await uploadContract(reference, file, {
        ...f,
        assessmentId: d.assessmentId,
        buyerEntity: d.buyerEntity,
        supplierEntity: d.supplierEntity,
      });
      onUploaded(result);
      setF(blank());
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setOpen(false);
    } catch (x) {
      setErr({ text: x.message, field: x.body?.field });
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <section
        className="card pad row"
        style={{ justifyContent: 'space-between' }}
        data-section="contract-upload"
      >
        <span>
          <b>Add a document</b>{' '}
          <span className="note">
            a DPA, SLA, schedule or transfer instrument, or a new version of one already uploaded.
          </span>
        </span>
        <button className="btn sm" onClick={() => setOpen(true)} data-act="new-contract-document">
          Upload a document
        </button>
      </section>
    );

  return (
    <section className="card pad stack" data-section="contract-upload">
      <h2 style={{ margin: 0 }}>Step 17 · Upload a contract document</h2>
      <p className="note" style={{ margin: 0 }}>
        PDF or Word, up to {Math.round(state.rules.maxBytes / 1048576)} MB. The file is checked (malware,
        type, size, readability), stored encrypted and never changed. {state.relationship.text}
      </p>
      <form className="form" onSubmit={submit} noValidate data-form="contract-upload">
        <div className="field">
          <label htmlFor="c-aid">Assessment ID</label>
          <input id="c-aid" type="text" className="mono" value={d.assessmentId} readOnly />
        </div>
        <div className="field">
          <label htmlFor="c-type">Document type</label>
          <select
            id="c-type"
            value={f.documentType}
            onChange={set('documentType')}
            aria-invalid={bad('documentType')}
          >
            {state.form.documentTypes.map(t => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="c-title">Contract title</label>
          <input
            id="c-title"
            type="text"
            maxLength={200}
            value={f.title}
            onChange={set('title')}
            placeholder="e.g. IT Support Services Agreement"
            aria-invalid={bad('title')}
          />
        </div>
        <div className="field">
          <label htmlFor="c-a">Party A (buyer entity)</label>
          <input id="c-a" type="text" value={d.buyerName} readOnly aria-invalid={bad('buyerEntity')} />
        </div>
        <div className="field">
          <label htmlFor="c-b">Party B (supplier entity)</label>
          <input
            id="c-b"
            type="text"
            value={d.supplierName || ''}
            readOnly
            aria-invalid={bad('supplierEntity')}
          />
        </div>
        <div className="field">
          <label htmlFor="c-law">Governing law</label>
          <select
            id="c-law"
            value={f.governingLaw}
            onChange={set('governingLaw')}
            aria-invalid={bad('governingLaw')}
          >
            {state.form.governingLaws
              .filter(x => x.code.startsWith('GB-'))
              .map(x => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            <optgroup label="Other countries">
              {lawCountries.map(x => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-exec">Execution status</label>
          <select
            id="c-exec"
            value={f.executionStatus}
            onChange={set('executionStatus')}
            aria-invalid={bad('executionStatus')}
          >
            {state.form.executionStatuses.map(s => (
              <option key={s} value={s}>
                {EXECUTION_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-eff">
            Effective date{' '}
            {f.executionStatus === 'DRAFT' ? <span className="muted">(optional for a draft)</span> : null}
          </label>
          <input
            id="c-eff"
            type="date"
            value={f.effectiveOn}
            onChange={set('effectiveOn')}
            aria-invalid={bad('effectiveOn')}
          />
        </div>
        <div className="field">
          <label htmlFor="c-exp">
            Expiry date <span className="muted">(leave empty if none)</span>
          </label>
          <input
            id="c-exp"
            type="date"
            value={f.expiresOn}
            onChange={set('expiresOn')}
            aria-invalid={bad('expiresOn')}
          />
        </div>
        {f.effectiveOn && f.expiresOn && f.expiresOn <= f.effectiveOn ? (
          <div className="field full">
            <label htmlFor="c-why">Why is the expiry date not after the effective date?</label>
            <input
              id="c-why"
              type="text"
              value={f.expiryExplanation}
              onChange={set('expiryExplanation')}
              aria-invalid={bad('expiryExplanation')}
            />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="c-lang">Language</label>
          <select id="c-lang" value={f.language} onChange={set('language')} aria-invalid={bad('language')}>
            {state.form.languages.map(l => (
              <option key={l.code} value={l.code}>
                {l.name}
                {l.supported ? '' : ' (manual review)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-rep">This document is</label>
          <select id="c-rep" value={f.replaces} onChange={set('replaces')} aria-invalid={bad('replaces')}>
            <option value="">A new document in the contract set</option>
            {current.map(x => (
              <option key={x.documentId} value={x.documentId}>
                A new version of {x.documentId} · {x.title}
              </option>
            ))}
          </select>
        </div>
        {f.replaces ? (
          <div className="field full">
            <label htmlFor="c-reason">Why a new version?</label>
            <input
              id="c-reason"
              type="text"
              maxLength={500}
              value={f.reason}
              onChange={set('reason')}
              placeholder="e.g. Signed copy received from the vendor"
              aria-invalid={bad('reason')}
            />
          </div>
        ) : null}
        <div className="field full">
          <label htmlFor="c-file">Contract file</label>
          <input
            id="c-file"
            ref={fileInput}
            type="file"
            accept=".pdf,.docx"
            onChange={e => setFile(e.target.files[0] || null)}
            aria-invalid={bad('file')}
            data-upload="contract"
          />
        </div>
        {err ? (
          <div className="rq-msg err field full" role="alert">
            <b>{err.text}</b>
          </div>
        ) : null}
        <div className="field full row" style={{ gap: 8 }}>
          <button className="btn primary" disabled={busy} data-act="upload-contract">
            {busy ? 'Reading the contract…' : 'Upload and analyse'}
          </button>
          {state.documents.length ? (
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

/* Step 19 output: the Contract Source Record for each document and version. */
function DocumentsCard({ state, reference }) {
  return (
    <section className="card" data-section="contract-documents">
      <div className="ch">
        <div>
          <h2>Contract set</h2>
          <div className="sub">
            Every document and version is kept, with its fingerprint. The current versions are analysed
            together.
          </div>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Type · title</th>
              <th>Status</th>
              <th>Law · dates · language</th>
              <th>Extraction</th>
            </tr>
          </thead>
          <tbody>
            {state.documents.map(x => (
              <tr key={x.id} className={x.current ? '' : 'muted'}>
                <td>
                  <b className="mono">{x.documentId}</b> v{x.version}
                  {x.current ? null : <div className="note">earlier version</div>}
                </td>
                <td>
                  <b>{x.documentType}</b> · {x.title}
                  <div className="note">
                    <a className="link" href={contractFileUrl(reference, x.id)}>
                      {x.fileName}
                    </a>{' '}
                    · {fmtBytes(x.size)} · SHA-256 <span className="mono">{x.sha256.slice(0, 12)}…</span>
                  </div>
                  {x.changeReason ? <div className="note">Reason: {x.changeReason}</div> : null}
                </td>
                <td>
                  {x.executionStatus ? (
                    <Badge
                      s={x.executed ? 'Approved' : 'Pending'}
                      label={EXECUTION_LABEL[x.executionStatus]}
                    />
                  ) : (
                    '—'
                  )}
                  {x.executionStatus === 'DRAFT' ? (
                    <div className="note">Not an executed agreement</div>
                  ) : null}
                </td>
                <td>
                  {x.governingLaw?.name || '—'}
                  <div className="note">
                    {x.effectiveOn ? `from ${fmtDate(x.effectiveOn)}` : 'no effective date'}
                    {x.expiresOn ? ` to ${fmtDate(x.expiresOn)}` : ''} · {x.language?.name || '—'}
                  </div>
                </td>
                <td>
                  <span className={'b ' + EXTRACTION_LABEL[x.extractionStatus][0]}>
                    {EXTRACTION_LABEL[x.extractionStatus][1]}
                  </span>
                  <div className="note">
                    {x.clauses != null ? `${x.clauses} clauses · ` : ''}
                    {x.pages ? `${x.pages} page${x.pages === 1 ? '' : 's'} · ` : ''}
                    {fmtTime(x.uploadedAt)}
                  </div>
                  {x.extractionNote ? <div className="note">{x.extractionNote}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VersionBar({ state, onPick }) {
  const latest = state.versions[0]?.version;
  return (
    <section className="card pad ca-version" data-section="contract-version">
      <div className="ca-version-main">
        <Icon n="layers" s={18} />
        <div>
          <b>
            Analysis v{state.shownVersion}
            {state.shownVersion === latest ? ' (latest)' : ''}
          </b>
          <div className="note">
            {state.analysis.trigger === 'review'
              ? 'Saved after a reviewer correction'
              : 'Saved after an upload'}{' '}
            · {fmtTime(state.analysis.createdAt)} · rule pack {state.analysis.rulePackVersion}
          </div>
        </div>
      </div>
      {state.versions.length > 1 ? (
        <select
          aria-label="Choose an analysis version"
          value={state.shownVersion}
          onChange={e => onPick(Number(e.target.value))}
        >
          {state.versions.map(v => (
            <option key={v.version} value={v.version}>
              v{v.version} · {v.trigger === 'review' ? 'correction' : 'upload'} · {fmtTime(v.createdAt)}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}

function SummaryCard({ state, analysis: a }) {
  const t = a.totals;
  return (
    <section className="card cp-result" data-section="contract-summary">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Steps 18–20 · Clause register and preliminary findings</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            {t.documents || 1} document{(t.documents || 1) === 1 ? '' : 's'} · {t.clauses} clauses
          </h2>
          <div className="note">
            Fingerprint <span className="mono">{a.snapshotSha256.slice(0, 16)}…</span>
            {a.extractionModelVersion ? ` · ${a.extractionModelVersion}` : ''}
          </div>
        </div>
        {a.status === 'HUMAN_REVIEW' ? (
          <Badge s="In review" label="Human review needed" />
        ) : (
          <Badge s="Complete" label="Analysed" />
        )}
      </div>
      {a.legacy ? (
        <div className="rq-flag info" style={{ margin: '0 22px' }}>
          <Icon n="alert" s={16} />
          <span>
            This analysis was made with the earlier topic rules. Upload the contract again to check it against
            the 20 clause categories.
          </span>
        </div>
      ) : (
        <ul
          className="cp-counts"
          style={{ margin: '0 22px 16px', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
        >
          <li className="pass">
            <b>{t.found}</b> Found
          </li>
          <li className="partial">
            <b>{t.partial}</b> Partial
          </li>
          <li className="fail">
            <b>{t.missing}</b> Missing
          </li>
          <li className="unknown">
            <b>{t.humanReview}</b> Human review
          </li>
          <li>
            <b>{t.notApplicable}</b> Not applicable
          </li>
        </ul>
      )}
      {!a.quality.ok ? (
        <div className="asr-block">
          <h3>Extraction quality</h3>
          <p className="note" style={{ margin: 0 }}>
            {a.quality.reasons.join(' ')} Clauses that were not found are shown for human review, not as
            missing.
          </p>
        </div>
      ) : null}
      {a.preliminary.length ? (
        <div className="asr-block" data-section="contract-preliminary">
          <h3>Preliminary findings</h3>
          <ul>
            {a.preliminary.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {a.note} {state.relationship.text}
      </p>
    </section>
  );
}

/* Step 20: the 9 output fields per finding, and the reviewer's override. */
function FindingsCard({ state, analysis: a, reference, editable, onSaved }) {
  const [filter, setFilter] = useState('ALL');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const list = a.findings.filter(f => filter === 'ALL' || f.status === filter);
  const save = async () => {
    setErr('');
    try {
      onSaved(
        await api(`/assessments/${reference}/contract/review`, {
          method: 'POST',
          body: { action: 'SET_FINDING', categoryId: edit.categoryId, status: edit.status, note: edit.note },
        }),
      );
      setEdit(null);
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <section className="card" data-section="contract-findings">
      <div className="ch">
        <div>
          <h2>Clause table</h2>
          <div className="sub">
            One line per clause category: what was found, where, under which rule, and what to do next.
          </div>
        </div>
        <select
          className="sm"
          aria-label="Filter findings"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="ALL">All ({a.findings.length})</option>
          {Object.entries(state.findingStatuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v} ({a.findings.filter(f => f.status === k).length})
            </option>
          ))}
        </select>
      </div>
      <div className="tw">
        <table className="ca-findings">
          <thead>
            <tr>
              <th>Clause</th>
              <th>Status</th>
              <th>Source</th>
              <th>Rule</th>
              <th>Explanation · recommended action</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {list.map(f => (
              <tr key={f.categoryId} data-finding={f.categoryId}>
                <td>
                  <span className="rid">{f.categoryId}</span> <b>{f.name}</b>
                  {f.check ? <div className="note">{f.check}</div> : null}
                </td>
                <td>
                  <span className={'b ' + FINDING_TONE[f.status]}>{state.findingStatuses[f.status]}</span>
                  {f.reviewed ? <div className="note">by {f.reviewed.by}</div> : null}
                </td>
                <td>
                  {f.clauseId ? <span className="mono">{f.clauseId}</span> : '—'}
                  {f.sourceRef ? <div className="note">{f.sourceRef}</div> : null}
                  {f.heading ? <div className="note">“{f.heading}”</div> : null}
                </td>
                <td className="note">{f.rule}</td>
                <td>
                  {f.explanation}
                  {f.recommendedAction && f.recommendedAction !== 'None.' ? (
                    <div className="note">
                      <b>Next:</b> {f.recommendedAction}
                    </div>
                  ) : null}
                  {editable ? (
                    edit?.categoryId === f.categoryId ? (
                      <div className="ca-edit">
                        <select
                          aria-label="New status"
                          value={edit.status}
                          onChange={e => setEdit({ ...edit, status: e.target.value })}
                        >
                          {Object.entries(state.findingStatuses).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Why (kept with the correction)"
                          aria-label="Reason for the correction"
                          value={edit.note}
                          onChange={e => setEdit({ ...edit, note: e.target.value })}
                        />
                        <button className="btn sm primary" onClick={save}>
                          Save
                        </button>
                        <button className="btn sm" onClick={() => setEdit(null)}>
                          Cancel
                        </button>
                        {err ? <span className="form-err">{err}</span> : null}
                      </div>
                    ) : (
                      <div>
                        <button
                          className="link"
                          onClick={() => setEdit({ categoryId: f.categoryId, status: f.status, note: '' })}
                        >
                          Correct this finding
                        </button>
                      </div>
                    )
                  ) : null}
                </td>
                <td>{confidenceText(f.confidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* Step 18: the clause register with the 10 fields, and the reviewer's corrections. */
function ClauseList({ state, analysis: a, reference, editable, onSaved }) {
  const [filter, setFilter] = useState('relevant');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null);
  const [cat, setCat] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const names = useMemo(
    () => Object.fromEntries(state.categories.map(c => [c.id, c.name])),
    [state.categories],
  );
  const list = a.clauses.filter(
    c =>
      (filter === 'all' ||
        (filter === 'relevant'
          ? c.relevant
          : filter === 'review'
            ? c.reviewStatus === 'HUMAN_REVIEW'
            : c.categories?.includes(filter))) &&
      (!search || (c.heading + ' ' + c.text).toLowerCase().includes(search.toLowerCase())),
  );
  const correct = async body => {
    setErr('');
    try {
      onSaved(await api(`/assessments/${reference}/contract/review`, { method: 'POST', body }));
      setNote('');
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <section className="card" data-section="contract-clauses">
      <div className="ch">
        <div>
          <h2>Clause register ({a.clauses.length})</h2>
          <div className="sub">
            Each clause with its source, category, responsible party, extraction confidence and review status.
          </div>
        </div>
        <div className="ca-filters">
          <input
            type="search"
            placeholder="Search clauses"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search clauses"
          />
          <select aria-label="Filter clauses" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="relevant">Relevant clauses</option>
            <option value="all">All clauses</option>
            <option value="review">Needs human review</option>
            {state.categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.id} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Clause</th>
              <th>Source</th>
              <th>Heading · text</th>
              <th>Category</th>
              <th>Responsible party</th>
              <th>Confidence</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.key || c.id} data-clause={c.id}>
                <td className="mono">{c.id}</td>
                <td className="note">
                  {c.documentId || 'DOC-001'} §{c.number}
                  {c.page ? ` · p.${c.page}` : ''}
                </td>
                <td>
                  {c.heading ? <b>{c.heading}</b> : null}
                  <div className="ca-text">
                    {open === c.id || c.text.length < 220 ? c.text : c.text.slice(0, 220) + '…'}
                  </div>
                  {c.keyTerms?.length ? (
                    <div className="note">Key terms: {c.keyTerms.map(t => t.value).join(', ')}</div>
                  ) : null}
                  {editable && c.key ? (
                    <button className="link" onClick={() => setOpen(open === c.id ? null : c.id)}>
                      {open === c.id ? 'Close' : 'Review or correct'}
                    </button>
                  ) : null}
                  {open === c.id ? (
                    <div className="ca-edit">
                      <button
                        className="btn sm"
                        onClick={() => correct({ action: 'VERIFY', clauseKey: c.key })}
                      >
                        Mark verified
                      </button>
                      <select
                        aria-label="Correct category"
                        value={cat}
                        onChange={e => setCat(e.target.value)}
                      >
                        <option value="">Move to category…</option>
                        <option value="NONE">No category</option>
                        {state.categories.map(k => (
                          <option key={k.id} value={k.id}>
                            {k.id} {k.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Why"
                        aria-label="Reason"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                      />
                      <button
                        className="btn sm"
                        disabled={!cat}
                        onClick={() =>
                          correct({
                            action: 'RECATEGORISE',
                            clauseKey: c.key,
                            categoryId: cat === 'NONE' ? null : cat,
                            note,
                          })
                        }
                      >
                        Save category
                      </button>
                      {err ? <span className="form-err">{err}</span> : null}
                    </div>
                  ) : null}
                </td>
                <td>
                  {c.category ? (
                    <>
                      <span className="rid">{c.category}</span> {names[c.category]}
                      {c.categories.length > 1 ? (
                        <div className="note">also {c.categories.slice(1).join(', ')}</div>
                      ) : null}
                    </>
                  ) : c.topics?.length && a.legacy ? (
                    c.topics.map(t => t.topicId).join(', ')
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{c.responsibleParty || '—'}</td>
                <td>{confidenceText(c.confidence)}</td>
                <td>
                  {c.reviewStatus ? (
                    <span className={'b ' + REVIEW_TONE[c.reviewStatus]}>
                      {state.reviewStatuses[c.reviewStatus]}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.length ? <p className="note pad">No clauses match.</p> : null}
    </section>
  );
}

/* Step 19 output: the extraction history, with every reviewer correction attributed. */
function HistoryCard({ state, analysis: a, onPick }) {
  return (
    <section className="card" data-section="contract-history">
      <div className="ch">
        <div>
          <h2>Extraction history</h2>
          <div className="sub">
            Each upload and each correction saves a new analysis version. The original files never change.
          </div>
        </div>
      </div>
      <ul className="cp-versions">
        {state.versions.map(v => (
          <li key={v.version}>
            <b className="mono">v{v.version}</b>
            <span>
              {v.trigger === 'review' ? 'Correction' : 'Upload'} by {v.by || '—'} · {fmtTime(v.createdAt)} ·{' '}
              {v.totals?.found ?? '—'} found, {v.totals?.partial ?? '—'} partial, {v.totals?.missing ?? '—'}{' '}
              missing
            </span>
            {v.version !== state.shownVersion ? (
              <button className="link" onClick={() => onPick(v.version)}>
                View
              </button>
            ) : (
              <span className="note">shown</span>
            )}
          </li>
        ))}
      </ul>
      {a.corrections.length ? (
        <div className="asr-block">
          <h3>Reviewer corrections in this version</h3>
          <ul>
            {a.corrections.map((k, i) => (
              <li key={i}>
                {fmtTime(k.at)} · {k.by}:{' '}
                {k.action === 'SET_FINDING'
                  ? `${k.categoryId} set to ${state.findingStatuses[k.status]}`
                  : k.action === 'VERIFY'
                    ? 'clause verified'
                    : k.action === 'RECATEGORISE'
                      ? `clause moved to ${k.categoryId || 'no category'}`
                      : `responsible party set to ${k.party}`}
                {k.note ? ` — “${k.note}”` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
