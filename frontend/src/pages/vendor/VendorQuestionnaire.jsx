import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, readResponse, unavailableError } from '../../lib/api.js';
import { fmtDate, fmtTime } from '../../lib/format.js';
import { fmtBytes } from '../../lib/requirements.js';
import {
  STATUS,
  PROCESSING_TONE,
  PROCESSING_SHORT,
  gapKind,
  vendorEvidenceUrl,
} from '../../lib/compliance.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';
import { confirmAction } from '../../components/extras/ConfirmDialog.jsx';
import CountryPicker from '../../components/requirements/CountryPicker.jsx';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const OPTIONS = {
  YES_NO: ['Yes', 'No'],
  YES_NO_PARTIAL: ['Yes', 'Partial', 'No'],
  YES_NO_UNKNOWN: ['Yes', 'No', 'Unknown'],
  YES_NO_REGISTRATION: ['Yes', 'No'],
  YES_NO_TABLE: ['Yes', 'No'],
  YES_NO_FILE: ['Yes', 'No'],
};
/* Answer types whose input needs the full width under the question. */
const WIDE = ['YES_NO_TABLE', 'COUNTRIES', 'HOURS', 'AMOUNT_DATE'];
const optClass = o => ({ Yes: 'yes', Partial: 'partly', No: 'no', Unknown: 'unknown' })[o];

/* Same completeness rule as the engine: "Yes" needs its registration number or at least one subprocessor. */
function answered(c, v) {
  if (!v) return false;
  if (c.answerType === 'COUNTRIES') return (v.countries || []).length > 0;
  if (c.answerType === 'HOURS') return v.rto != null && v.rto !== '' && v.rpo != null && v.rpo !== '';
  if (c.answerType === 'AMOUNT_DATE') return v.answer === 'No' || (!!v.amount && !!v.expiresOn);
  if (!v.answer) return false;
  if (c.answerType === 'YES_NO_REGISTRATION' && v.answer === 'Yes') return !!v.registrationNumber;
  if (c.answerType === 'YES_NO_TABLE' && v.answer === 'Yes') return (v.rows || []).some(r => r.name);
  return true;
}

/* Evidence upload for one question (step 13): document type, issuer, issue date and expiry date. */
function Uploader({ refId, control, d, onDone }) {
  const types = [...control.evidence.filter(t => t !== 'OTHER'), 'OTHER'];
  const [f, setF] = useState({ type: types[0], issuer: '', issued: '', expires: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const expires = d.expiringTypes.includes(f.type);
  const dated = f.type === 'PENTEST';
  const send = async file => {
    setErr('');
    if (fileRef.current) fileRef.current.value = ''; // so the same file can be chosen again after a correction
    if (expires && !f.expires) return setErr('Enter the expiry date shown on the document.');
    if (dated && !f.issued) return setErr('Enter the date of the test or report.');
    setBusy(true);
    try {
      const q = new URLSearchParams({
        control: control.id,
        type: f.type,
        name: file.name,
        ...(f.issuer ? { issuer: f.issuer } : {}),
        ...(f.issued ? { issued: f.issued } : {}),
        ...(f.expires ? { expires: f.expires } : {}),
      });
      let response;
      try {
        response = await fetch(`${BASE}/vendor/compliance/${refId}/evidence?${q}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
      } catch (error) {
        throw unavailableError(0, error.message);
      }
      const result = await readResponse(response);
      setF({ type: types[0], issuer: '', issued: '', expires: '' });
      onDone(result.evidence);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vq-up">
      <select
        aria-label={`Document type for ${control.id}`}
        value={f.type}
        onChange={e => setF(x => ({ ...x, type: e.target.value }))}
      >
        {types.map(t => (
          <option key={t} value={t}>
            {d.documentTypes[t]}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Issuer (e.g. BSI)"
        aria-label="Issuer"
        value={f.issuer}
        maxLength={200}
        onChange={e => setF(x => ({ ...x, issuer: e.target.value }))}
      />
      <label className="vq-exp">
        Issued{' '}
        <input
          type="date"
          value={f.issued}
          onChange={e => setF(x => ({ ...x, issued: e.target.value }))}
          aria-label="Issue date"
        />
      </label>
      {expires ? (
        <label className="vq-exp">
          Expires{' '}
          <input
            type="date"
            value={f.expires}
            onChange={e => setF(x => ({ ...x, expires: e.target.value }))}
            aria-label="Expiry date"
          />
        </label>
      ) : null}
      <label className={'btn sm' + (busy ? ' disabled' : '')} aria-disabled={busy}>
        <Icon n="upload" s={14} />
        {busy ? 'Checking…' : 'Choose file'}
        <input
          ref={fileRef}
          type="file"
          hidden
          disabled={busy}
          data-upload={control.id}
          onChange={e => e.target.files[0] && send(e.target.files[0])}
        />
      </label>
      {err ? <span className="form-err">{err}</span> : null}
    </div>
  );
}

/* The answer input for one control, by answer type (step 11). */
function AnswerInput({ c, v, set, disabled, countries }) {
  const opts = OPTIONS[c.answerType];
  return (
    <div className="vq-input">
      {opts ? (
        <div className="vq-ans" role="radiogroup" aria-label={c.question}>
          {opts.map(o => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={v.answer === o}
              disabled={disabled}
              className={'vq-opt ' + optClass(o) + (v.answer === o ? ' on' : '')}
              onClick={() => set({ answer: o })}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}
      {c.answerType === 'YES_NO_REGISTRATION' && v.answer === 'Yes' ? (
        <input
          type="text"
          placeholder="Company registration number"
          aria-label="Company registration number"
          value={v.registrationNumber || ''}
          disabled={disabled}
          maxLength={60}
          onChange={e => set({ registrationNumber: e.target.value })}
        />
      ) : null}
      {c.answerType === 'YES_NO_TABLE' && v.answer === 'Yes' ? (
        <div className="vq-table">
          {(v.rows?.length ? v.rows : [{}]).map((row, i) => {
            const rows = v.rows?.length ? v.rows : [{}];
            const put = patch => set({ rows: rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="vq-row">
                <input
                  type="text"
                  placeholder="Subprocessor name"
                  aria-label={`Subprocessor ${i + 1} name`}
                  value={row.name || ''}
                  disabled={disabled}
                  onChange={e => put({ name: e.target.value })}
                />
                <select
                  aria-label={`Subprocessor ${i + 1} country`}
                  value={row.country || ''}
                  disabled={disabled}
                  onChange={e => put({ country: e.target.value })}
                >
                  <option value="">Country…</option>
                  {countries.map(k => (
                    <option key={k.code} value={k.code}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="What it does (e.g. hosting)"
                  aria-label={`Subprocessor ${i + 1} service`}
                  value={row.service || ''}
                  disabled={disabled}
                  onChange={e => put({ service: e.target.value })}
                />
                {!disabled && rows.length > 1 ? (
                  <button
                    type="button"
                    className="link"
                    onClick={() => set({ rows: rows.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })}
          {!disabled ? (
            <button type="button" className="link" onClick={() => set({ rows: [...(v.rows || [{}]), {}] })}>
              + Add a subprocessor
            </button>
          ) : null}
        </div>
      ) : null}
      {c.answerType === 'COUNTRIES' ? (
        disabled ? (
          <b>
            {(v.countries || []).map(k => countries.find(x => x.code === k)?.name || k).join(', ') || '—'}
          </b>
        ) : (
          <CountryPicker
            id={'q-' + c.id}
            multi
            value={v.countries || []}
            onChange={list => set({ countries: list })}
            countries={countries}
          />
        )
      ) : null}
      {c.answerType === 'HOURS' ? (
        <div className="row" style={{ gap: 12 }}>
          {['rto', 'rpo'].map(k => (
            <label key={k} className="vq-exp">
              {k.toUpperCase()} (hours){' '}
              <input
                type="number"
                min="0"
                step="0.5"
                value={v[k] ?? ''}
                disabled={disabled}
                onChange={e => set({ [k]: e.target.value === '' ? null : Number(e.target.value) })}
                aria-label={`${k.toUpperCase()} in hours`}
              />
            </label>
          ))}
        </div>
      ) : null}
      {c.answerType === 'AMOUNT_DATE' ? (
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label className="vq-exp">
            <input
              type="checkbox"
              checked={v.answer === 'No'}
              disabled={disabled}
              onChange={e =>
                set(e.target.checked ? { answer: 'No', amount: null, expiresOn: null } : { answer: null })
              }
            />{' '}
            No cover
          </label>
          {v.answer !== 'No' ? (
            <>
              <label className="vq-exp">
                Insured limit (GBP){' '}
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={v.amount ?? ''}
                  disabled={disabled}
                  onChange={e =>
                    set({ amount: e.target.value === '' ? null : Number(e.target.value), currency: 'GBP' })
                  }
                  aria-label="Insured limit"
                />
              </label>
              <label className="vq-exp">
                Expiry date{' '}
                <input
                  type="date"
                  value={v.expiresOn || ''}
                  disabled={disabled}
                  onChange={e => set({ expiresOn: e.target.value || null })}
                  aria-label="Insurance expiry date"
                />
              </label>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* Vendor portal · the compliance questionnaire for one assessment (steps 12–13), then the receipt and summary. */
export default function VendorQuestionnaire() {
  const { ref } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [ans, setAns] = useState({});
  const [evidence, setEvidence] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState('');
  const [dirty, setDirty] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [missing, setMissing] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const timer = useRef(null);

  const load = useCallback(
    () =>
      api('/vendor/compliance/' + ref)
        .then(r => {
          setD(r);
          setAns(r.compliance.answers || {});
          setEvidence(r.compliance.evidence || []);
        })
        .catch(x => setErr(x.message)),
    [ref],
  );
  useEffect(() => {
    const token = params.get('invite');
    if (!token) {
      load();
      return;
    }
    // The invitation link: check it, then open the questionnaire without the token in the address bar.
    api('/vendor/compliance/invite/' + encodeURIComponent(token))
      .then(() => navigate('/vendor/assessments/' + ref, { replace: true }))
      .catch(x => setErr(x.message));
  }, [load, params, navigate, ref]);

  const save = useCallback(
    async (next = ans, changed = dirty, quiet = true) => {
      const ids = Object.keys(changed);
      if (!ids.length) {
        if (!quiet)
          setMsg({ tone: 'ok', text: 'Your answers are saved. You can come back and finish later.' });
        return true;
      }
      setSaving('saving');
      try {
        const body = Object.fromEntries(ids.map(id => [id, next[id] || {}]));
        const r = await api(`/vendor/compliance/${ref}/answers`, { method: 'PUT', body: { answers: body } });
        setD(x => ({
          ...x,
          compliance: { ...x.compliance, status: r.compliance.status, progress: r.compliance.progress },
        }));
        setDirty(old => Object.fromEntries(Object.entries(old).filter(([k]) => !ids.includes(k))));
        setSaving('saved');
        if (!quiet)
          setMsg({ tone: 'ok', text: 'Your answers are saved. You can come back and finish later.' });
        return true;
      } catch (x) {
        setSaving('');
        setMsg({ tone: 'err', text: x.message });
        return false;
      }
    },
    [ans, dirty, ref],
  );

  const setA = (id, patch) => {
    const next = { ...ans, [id]: { ...(ans[id] || {}), ...patch } };
    const changed = { ...dirty, [id]: true };
    setAns(next);
    setDirty(changed);
    setSaving('');
    setMissing(m => m.filter(x => x !== id));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next, changed), 900); // autosave shortly after each change
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const removeDoc = async e => {
    try {
      await api(`/vendor/compliance/${ref}/evidence/${e.id}`, { method: 'DELETE' });
      setEvidence(v => v.filter(x => x.id !== e.id));
    } catch (x) {
      setMsg({ tone: 'err', text: x.message });
    }
  };
  const submit = async () => {
    setMsg(null);
    clearTimeout(timer.current);
    try {
      if (Object.keys(dirty).length && !(await save(ans, dirty))) return setConfirm(false);
      const r = await api(`/vendor/compliance/${ref}/submit`, { method: 'POST' });
      setConfirm(false);
      setReceipt(r.receipt);
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setConfirm(false);
      if (x.body?.missing) {
        setMissing(x.body.missing);
        setMsg({ tone: 'err', text: x.message + ' They are highlighted below.' });
        setTimeout(
          () => document.querySelector('.vq-q.miss')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
          50,
        );
      } else setMsg({ tone: 'err', text: x.message });
    }
  };

  const controls = useMemo(() => d?.compliance.questionnaire.controls || [], [d]);
  const families = useMemo(() => [...new Set(controls.map(c => c.family))], [controls]);
  if (err) return <p className="form-err">{err}</p>;
  if (!d) return <Loading />;
  const c = d.compliance;
  if (d.mode === 'legacy')
    return (
      <div className="vs">
        <PageHead
          eyebrow={`Vendor · Stage 3 · ${d.reference}`}
          title={d.title}
          lead={`For ${d.buyerName}.`}
        />
        <section className="card pad">
          <p style={{ margin: 0 }}>
            This questionnaire is from an earlier version of OffshoreAssure and can no longer be answered
            here. Ask {d.buyerName} to start it again; you will then receive a new link.
          </p>
        </section>
      </div>
    );
  const editableNow = id => (d.mode === 'answering' || d.mode === 'clarification') && d.editable.includes(id);
  const total = d.mode === 'clarification' ? d.editable.length : controls.length;
  const answeredN = controls.filter(
    k => (d.mode !== 'clarification' || d.editable.includes(k.id)) && answered(k, ans[k.id]),
  ).length;
  const percent = total ? Math.round((answeredN / total) * 100) : 100;
  const canWrite = d.mode === 'answering' || d.mode === 'clarification';
  return (
    <div className="vs">
      <Link
        className="link"
        to="/vendor/assessments"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        ← Assessments
      </Link>
      <PageHead
        eyebrow={`Vendor · Stage 3 · Compliance questionnaire · ${d.reference}`}
        title={d.title}
        lead={`For ${d.buyerName} · ${d.serviceCategory}. Answer each question, explain where useful, and upload the documents that support your answers.`}
        right={
          <Badge
            s={(STATUS[c.status] || STATUS.in_progress)[0]}
            label={(STATUS[c.status] || STATUS.in_progress)[1]}
          />
        }
      />
      {msg ? (
        <div className={'rq-msg ' + msg.tone} role="status">
          <b>{msg.text}</b>
        </div>
      ) : null}

      {receipt ? (
        <section className="card pad stack" data-section="vq-receipt">
          <h2 style={{ margin: 0 }}>Submission receipt</h2>
          <dl className="cp-dl">
            <dt>Receipt</dt>
            <dd className="mono">{receipt.id}</dd>
            <dt>Submitted</dt>
            <dd>{fmtTime(receipt.submittedAt)}</dd>
            <dt>Completeness</dt>
            <dd>
              {receipt.completeness}% ({receipt.answered} of {receipt.total} questions)
            </dd>
            <dt>Version</dt>
            <dd>v{receipt.snapshotVersion}</dd>
          </dl>
          <h3 style={{ margin: 0 }}>Evidence processing status</h3>
          <ul className="prf-docs">
            {receipt.evidence.map((e, i) => (
              <li key={i}>
                <Icon n="doc" s={15} />
                <span>
                  {e.fileName} <span className="note">· {e.controlId}</span>
                </span>
                <span className={'b ' + (PROCESSING_TONE[e.status] || 'b-mute')}>{e.label || e.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.mode === 'submitted' ? (
        <section className="card pad stack" data-section="vq-submitted">
          <h2 style={{ margin: 0 }}>Submitted {fmtTime(c.submittedAt)}</h2>
          {d.result ? (
            <p style={{ margin: 0 }}>
              Provisional assurance score: <b>{d.result.overall}/100</b> ({d.result.rating.label}).{' '}
              {d.result.gaps.length} item{d.result.gaps.length === 1 ? '' : 's'} may need attention; the buyer
              may ask you for clarification or corrections later.
            </p>
          ) : null}
          {d.result?.gaps.length ? (
            <ul className="cp-gaps">
              {d.result.gaps.map((g, i) => (
                <li key={i}>
                  <span className={'b ' + gapKind(g.kind)[0]}>{gapKind(g.kind)[1]}</span>
                  <span>{g.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="note" style={{ margin: 0 }}>
            Your answers are locked. These are provisional findings, not a final legal approval.
          </p>
        </section>
      ) : null}

      {d.mode === 'expired' ? (
        <div className="rq-flag warning">
          <Icon n="alert" s={16} />
          <span>
            The request expired on {fmtDate(d.request.dueOn)}. You can read your answers, but not change them.
            Ask {d.buyerName} to issue a new link.
          </span>
        </div>
      ) : null}

      {d.mode === 'clarification' ? (
        <div className="rq-flag info" data-section="vq-clarification">
          <Icon n="flag" s={16} />
          <span>
            <b>
              {d.buyerName} asked for clarification on {d.editable.join(', ')} by {fmtDate(d.request.dueOn)}.
            </b>{' '}
            {d.request.message ? `“${d.request.message}” ` : ''}Change those answers or add new documents,
            then submit again. Your earlier answers and documents are kept.
          </span>
        </div>
      ) : null}

      {canWrite ? (
        <>
          <section className="card pad stack" data-section="vq-request">
            <h2 style={{ margin: 0 }}>What is requested</h2>
            <ul className="vq-instr">
              {d.request.instructions.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <details>
              <summary className="link">
                Documents on the checklist ({d.request.requestedDocuments.length})
              </summary>
              <ul>
                {d.request.requestedDocuments.map(doc => (
                  <li key={doc.type}>
                    {doc.label}
                    <span className="note">
                      {' '}
                      · for {doc.controls.join(', ')}
                      {doc.expires ? ' · expiry date needed' : ''}
                      {evidence.some(e => e.docType === doc.type) ? ' · uploaded' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <div className="card vq-bar" data-section="vq-progress">
            <div>
              <b>{percent}% complete</b> · {answeredN} of {total} questions answered ·{' '}
              <b>{evidence.length}</b> document
              {evidence.length === 1 ? '' : 's'} · due <b>{fmtDate(d.request.dueOn)}</b>
            </div>
            <div className="cp-progress">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="note vq-save" aria-live="polite">
                {saving === 'saving'
                  ? 'Saving…'
                  : Object.keys(dirty).length
                    ? 'Unsaved changes'
                    : saving === 'saved'
                      ? 'All changes saved'
                      : ''}
              </span>
              <button className="btn sm" onClick={() => save(ans, dirty, false)} data-act="save-answers">
                Save draft
              </button>
              <button
                className="btn sm primary"
                onClick={() => setConfirm(true)}
                data-act="submit-questionnaire"
              >
                Submit
              </button>
            </div>
            {confirm ? (
              <div className="vq-confirm" role="alertdialog" aria-label="Confirm submission">
                <span>
                  Submit your answers to {d.buyerName}? You will not be able to change them afterwards unless
                  the buyer asks for clarification.
                </span>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn sm" onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                  <button className="btn sm primary" onClick={submit} data-act="confirm-submit">
                    Yes, submit
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {families.map(fam => {
        const list = controls.filter(k => k.family === fam);
        return (
          <section key={fam} className="card vq-ctl" data-family={fam}>
            <div className="ch">
              <div>
                <h2>{d.families[fam]}</h2>
              </div>
              <span className="note">
                {list.filter(k => answered(k, ans[k.id])).length}/{list.length}
              </span>
            </div>
            <div className="vq-qs">
              {list.map(k => {
                const v = ans[k.id] || {};
                const can = editableNow(k.id);
                const docs = evidence.filter(e => e.controlId === k.id);
                return (
                  <div
                    key={k.id}
                    className={
                      'vq-q' +
                      (WIDE.includes(k.answerType) ? ' wide' : '') +
                      (missing.includes(k.id) ? ' miss' : '') +
                      (can || !canWrite ? '' : ' locked')
                    }
                    data-q={k.id}
                  >
                    <div className="vq-qt">
                      <span>
                        <span className="rid">{k.id}</span> {k.question}
                        {k.mandatory ? <span className="vq-req"> Required</span> : null}
                      </span>
                      {k.help ? <span className="note">{k.help}</span> : null}
                      {k.evidence.filter(t => t !== 'OTHER').length ? (
                        <span className="note">
                          Evidence:{' '}
                          {k.evidence
                            .filter(t => t !== 'OTHER')
                            .map(t => d.documentTypes[t])
                            .join(' or ')}
                          {k.evidenceWhen ? ` (if “${k.evidenceWhen}”)` : ''}
                        </span>
                      ) : null}
                    </div>
                    <AnswerInput
                      c={k}
                      v={v}
                      set={patch => setA(k.id, patch)}
                      disabled={!can}
                      countries={d.countries}
                    />
                    {can || v.explanation ? (
                      <textarea
                        className="vq-comment"
                        rows={2}
                        maxLength={2000}
                        disabled={!can}
                        value={v.explanation || ''}
                        placeholder="Explanation (optional): add detail, e.g. scope, certificate number or exceptions"
                        onChange={e => setA(k.id, { explanation: e.target.value })}
                        aria-label={`Explanation for ${k.id}`}
                      />
                    ) : null}
                    <div className="vq-docs">
                      {docs.length ? (
                        <ul className="prf-docs">
                          {docs.map(e => (
                            <li key={e.id}>
                              <Icon n="doc" s={15} />
                              <a className="link" href={vendorEvidenceUrl(ref, e.id)}>
                                {e.fileName}
                              </a>
                              <span className="note">
                                {d.documentTypes[e.docType] || e.docType} · v{e.version}
                                {e.issuer ? ` · ${e.issuer}` : ''}
                                {e.expiresOn ? ` · expires ${fmtDate(e.expiresOn)}` : ''} · {fmtBytes(e.size)}
                              </span>
                              <span
                                className={'b ' + (PROCESSING_TONE[e.processingStatus] || 'b-mute')}
                                title={(e.checks || []).map(x => `${x.check}: ${x.outcome}`).join('\n')}
                              >
                                {PROCESSING_SHORT[e.processingStatus] || 'Received'}
                              </span>
                              {e.duplicateOf ? <span className="b b-amber">Duplicate file</span> : null}
                              {can && !e.locked ? (
                                <button
                                  className="link vq-del"
                                  onClick={async () => {
                                    if (
                                      await confirmAction({
                                        title: `Remove ${e.fileName}?`,
                                        message:
                                          'The document will be deleted. You can upload it again before you submit.',
                                        confirmLabel: 'Remove',
                                      })
                                    )
                                      removeDoc(e);
                                  }}
                                  aria-label={`Remove ${e.fileName}`}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {can && k.evidence.length ? (
                        <Uploader refId={ref} control={k} d={d} onDone={e => setEvidence(x => [...x, e])} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
