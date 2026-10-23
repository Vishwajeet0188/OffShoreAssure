import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, readResponse, unavailableError } from '../../lib/api.js';
import { fmtDate, fmtTime } from '../../lib/format.js';
import { fmtBytes } from '../../lib/requirements.js';
import { STATUS, GAP_KIND, vendorEvidenceUrl } from '../../lib/compliance.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';
import { confirmAction } from '../../components/extras/ConfirmDialog.jsx';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const ANSWERS = ['Yes', 'Partly', 'No'];

/* Evidence uploader for one control (step 13). Certificates and insurance need the expiry date. */
function Uploader({ refId, control, types, expiring, onDone }) {
  const [type, setType] = useState(''); const [expires, setExpires] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const send = async file => {
    setErr('');
    if (fileRef.current) fileRef.current.value = '';   // so the same file can be chosen again after a correction
    if (!type) { setErr('Choose what kind of document this is.'); return; }
    if (expiring.includes(type) && !expires) { setErr('Enter the expiry date shown on the document.'); return; }
    setBusy(true);
    try {
      const q = new URLSearchParams({ control, type, name: file.name, ...(expires ? { expires } : {}) });
      let response;
      try {
        response = await fetch(`${BASE}/vendor/compliance/${refId}/evidence?${q}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
        });
      } catch (error) {
        throw unavailableError(0, error.message);
      }
      const result = await readResponse(response);
      setType(''); setExpires(''); onDone(result.evidence);
    } catch (x) { setErr(x.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  return (
    <div className="vq-up">
      <select aria-label={`Document type for ${control}`} value={type} onChange={e => { setType(e.target.value); setErr(''); }}>
        <option value="">Add a document…</option>{Object.entries(types).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {expiring.includes(type) ? <label className="vq-exp">Expires on <input type="date" value={expires} onChange={e => setExpires(e.target.value)} aria-label="Expiry date" /></label> : null}
      <label className={'btn sm' + (busy || !type ? ' disabled' : '')} aria-disabled={busy || !type}>
        <Icon n="upload" s={14} />{busy ? 'Uploading…' : 'Choose file'}
        <input ref={fileRef} type="file" hidden disabled={busy || !type} data-upload={control} onChange={e => e.target.files[0] && send(e.target.files[0])} />
      </label>
      {err ? <span className="form-err">{err}</span> : null}
    </div>
  );
}

/* Vendor portal · the compliance questionnaire for one assessment (step 13), then the submitted summary. */
export default function VendorQuestionnaire() {
  const { ref } = useParams();
  const [d, setD] = useState(null); const [ans, setAns] = useState({}); const [evidence, setEvidence] = useState([]);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(null); const [saving, setSaving] = useState(''); const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false); const [missing, setMissing] = useState([]); const [openNote, setOpenNote] = useState({});
  const timer = useRef(null);

  const load = useCallback(() => api('/vendor/compliance/' + ref).then(r => { setD(r); setAns(r.compliance.answers || {}); setEvidence(r.compliance.evidence || []); }).catch(x => setErr(x.message)), [ref]);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next = ans, quiet = true) => {
    setSaving('saving');
    try {
      const body = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, { answer: v?.answer || null, comment: v?.comment || '' }]));
      const r = await api(`/vendor/compliance/${ref}/answers`, { method: 'PUT', body: { answers: body } });
      setD(x => ({ ...x, compliance: { ...x.compliance, status: r.compliance.status, progress: r.compliance.progress } }));
      setDirty(false); setSaving('saved'); if (!quiet) setMsg({ tone: 'ok', text: 'Your answers are saved. You can come back and finish later.' });
    } catch (x) { setSaving(''); setMsg({ tone: 'err', text: x.message }); }
  }, [ans, ref]);

  const setA = (qid, patch) => {
    const next = { ...ans, [qid]: { ...(ans[qid] || {}), ...patch } };
    setAns(next); setDirty(true); setSaving(''); setMissing(m => m.filter(x => x !== qid));
    clearTimeout(timer.current); timer.current = setTimeout(() => save(next), 900);   // autosave shortly after each change
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const removeDoc = async e => {
    try { await api(`/vendor/compliance/${ref}/evidence/${e.id}`, { method: 'DELETE' }); setEvidence(v => v.filter(x => x.id !== e.id)); } catch (x) { setMsg({ tone: 'err', text: x.message }); }
  };
  const submit = async () => {
    setMsg(null);
    try {
      if (dirty) await save(ans);
      const r = await api(`/vendor/compliance/${ref}/submit`, { method: 'POST' });
      setConfirm(false); await load(); window.scrollTo({ top: 0, behavior: 'smooth' });
      setMsg({ tone: 'ok', text: `Submitted. The buyer has been told. Provisional score ${r.overall}/100.` });
    } catch (x) {
      setConfirm(false);
      if (x.body?.missing) { setMissing(x.body.missing); setMsg({ tone: 'err', text: x.message + ' They are highlighted below.' }); setTimeout(() => document.querySelector('.vq-q.miss')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }
      else setMsg({ tone: 'err', text: x.message });
    }
  };

  const total = useMemo(() => d ? d.compliance.questionnaire.reduce((n, c) => n + c.questions.length, 0) : 0, [d]);
  if (err) return <p className="form-err">{err}</p>;
  if (!d) return <Loading />;
  const c = d.compliance, done = c.status === 'submitted';
  const answered = Object.values(ans).filter(a => ANSWERS.includes(a?.answer)).length;
  return (
    <div className="vs">
      <Link className="link" to="/vendor/assessments" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>← Assessments</Link>
      <PageHead eyebrow={`Vendor · Stage 3 · Compliance questionnaire · ${d.reference}`} title={d.title}
        lead={`For ${d.buyerName} · ${d.serviceCategory}. Answer each question, add a short comment where useful, and upload documents that support your answers.`}
        right={<Badge s={STATUS[c.status][0]} label={STATUS[c.status][1]} />} />
      {msg ? <div className={'rq-msg ' + msg.tone} role="status"><b>{msg.text}</b></div> : null}

      {done ? (
        <section className="card pad stack" data-section="vq-submitted">
          <h2 style={{ margin: 0 }}>Submitted {fmtTime(c.submittedAt)}</h2>
          {d.result ? <p style={{ margin: 0 }}>Provisional score: <b>{d.result.overall}/100</b> ({d.result.rating.label}). {d.result.gaps.length} item{d.result.gaps.length === 1 ? '' : 's'} may need attention; the buyer may ask you for corrections later (Stage 8).</p> : null}
          {d.result?.gaps.length ? <ul className="cp-gaps">{d.result.gaps.map((g, i) => <li key={i}><span className={'b ' + GAP_KIND[g.kind][0]}>{GAP_KIND[g.kind][1]}</span><span>{g.text}</span></li>)}</ul> : null}
          <p className="note" style={{ margin: 0 }}>Your answers are locked. This score is a risk indicator, not a compliance conclusion.</p>
        </section>
      ) : (
        <div className="card vq-bar" data-section="vq-progress">
          <div><b>{answered} of {total}</b> questions answered · <b>{evidence.length}</b> document{evidence.length === 1 ? '' : 's'} · due <b>{fmtDate(c.dueOn)}</b></div>
          <div className="cp-progress"><span style={{ width: `${Math.round(answered / total * 100)}%` }} /></div>
          <div className="row" style={{ gap: 8 }}>
            <span className="note vq-save" aria-live="polite">{saving === 'saving' ? 'Saving…' : saving === 'saved' && !dirty ? 'All changes saved' : dirty ? 'Unsaved changes' : ''}</span>
            <button className="btn sm" onClick={() => save(ans, false)} data-act="save-answers">Save draft</button>
            <button className="btn sm primary" onClick={() => setConfirm(true)} data-act="submit-questionnaire">Submit</button>
          </div>
          {confirm ? <div className="vq-confirm" role="alertdialog" aria-label="Confirm submission">
            <span>Submit your answers to {d.buyerName}? You will not be able to change them afterwards.</span>
            <div className="row" style={{ gap: 8 }}><button className="btn sm" onClick={() => setConfirm(false)}>Cancel</button><button className="btn sm primary" onClick={submit} data-act="confirm-submit">Yes, submit</button></div>
          </div> : null}
        </div>
      )}

      {c.questionnaire.map(ct => {
        const docs = evidence.filter(e => e.controlId === ct.id);
        return (
          <section key={ct.id} className="card vq-ctl" data-control={ct.id}>
            <div className="ch"><div><h2><span className="rid">{ct.id}</span> {ct.name}</h2><div className="sub">{ct.verifies}</div></div>
              <span className="note">{ct.questions.filter(q => ANSWERS.includes(ans[q.id]?.answer)).length}/{ct.questions.length}</span></div>
            <div className="vq-qs">{ct.questions.map(q => {
              const a = ans[q.id] || {};
              return (
                <div key={q.id} className={'vq-q' + (missing.includes(q.id) ? ' miss' : '')} data-q={q.id}>
                  <div className="vq-qt"><span>{q.text}</span>{q.evidence ? <span className="note">Evidence: {d.evidenceTypes[q.evidence].split(' (')[0].toLowerCase()}</span> : null}{q.help ? <span className="note">{q.help}</span> : null}</div>
                  <div className="vq-ans" role="radiogroup" aria-label={q.text}>
                    {ANSWERS.map(o => <button key={o} type="button" role="radio" aria-checked={a.answer === o} disabled={done} className={'vq-opt ' + o.toLowerCase() + (a.answer === o ? ' on' : '')} onClick={() => setA(q.id, { answer: o })}>{o}</button>)}
                    {!done ? <button type="button" className="link vq-cbtn" onClick={() => setOpenNote(n => ({ ...n, [q.id]: !n[q.id] }))}>{a.comment || openNote[q.id] ? 'Comment' : '+ Comment'}</button> : null}
                  </div>
                  {(openNote[q.id] || a.comment) ? <textarea className="vq-comment" rows={2} maxLength={1000} disabled={done} value={a.comment || ''} placeholder="Optional: add detail, e.g. certificate number or scope" onChange={e => setA(q.id, { comment: e.target.value })} aria-label={`Comment for: ${q.text}`} /> : null}
                </div>);
            })}</div>
            <div className="vq-docs">
              {docs.length ? <ul className="prf-docs">{docs.map(e => <li key={e.id}><Icon n="doc" s={15} /><a className="link" href={vendorEvidenceUrl(ref, e.id)}>{e.fileName}</a><span className="note">{d.evidenceTypes[e.type].split(' (')[0]}{e.expiresOn ? ` · expires ${fmtDate(e.expiresOn)}` : ''} · {fmtBytes(e.size)}</span>
                {!done ? <button className="link vq-del" onClick={async () => { if (await confirmAction({ title: `Remove ${e.fileName}?`, message: 'The document will be deleted. You can upload it again before you submit.', confirmLabel: 'Remove' })) removeDoc(e); }} aria-label={`Remove ${e.fileName}`}>Remove</button> : null}</li>)}</ul> : null}
              {!done ? <Uploader refId={ref} control={ct.id} types={d.evidenceTypes} expiring={d.expiring} onDone={e => setEvidence(v => [...v, e])} /> : null}
            </div>
          </section>);
      })}
    </div>
  );
}
