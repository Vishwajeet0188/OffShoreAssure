import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { isEmpty, isRequired, isVisible, uploadDocument, docUrl, fmtBytes, EXAMPLE } from '../lib/requirements.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon, BackArrow } from '../components/common/Icon.jsx';
import RequirementField from '../components/requirements/RequirementField.jsx';
import AssessmentResult from '../components/requirements/AssessmentResult.jsx';
import ProfilePanel from '../components/requirements/ProfilePanel.jsx';
import InformationRequired from '../components/requirements/InformationRequired.jsx';

/* Stage 1 · Step 1 — Submit outsourcing requirement (buyer → OffshoreAssure engine).
   32 fields in six groups. Save draft at any time; Submit is accepted only when every mandatory and conditional answer is complete. */
export default function RequirementForm() {
  const { id: param } = useParams();
  const routeId = param === 'new' ? null : param;
  const selfNav = useRef(null);   // id we navigated to ourselves after the first save (no reload needed)
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [reqId, setReqId] = useState(routeId || null);
  const [rec, setRec] = useState(null);           // server record (status, dates, check)
  const [data, setData] = useState({});
  const [docs, setDocs] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [prof, setProf] = useState(null);         // { profiles, timeline, controlCatalogue } (Step 3)
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [showMissing, setShowMissing] = useState(false);
  const [msg, setMsg] = useState(null);           // { tone: 'ok'|'err', text, missing? }
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const topRef = useRef(null);

  useEffect(() => {
    if (routeId && selfNav.current === routeId) return undefined;
    let live = true;
    (async () => {
      try {
        const f = await api('/requirements/form');
        if (!live) return;
        setForm(f);
        if (routeId) {
          const r = await api('/requirements/' + routeId);
          if (!live) return;
          setRec(r.requirement); setData(r.requirement.data); setDocs(r.documents); setAssessment(r.assessment); setReqId(routeId);
          if (r.profiles) setProf({ profiles: r.profiles, timeline: r.timeline, controlCatalogue: r.controlCatalogue, summary: r.summary });
        } else setData({ ...f.prefill });
      } catch (x) { if (live) setLoadErr(x.message); }
    })();
    return () => { live = false; };
  }, [routeId]);

  useEffect(() => {
    if (!dirty) return undefined;
    const h = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const setField = useCallback((key, v) => { setData(d => ({ ...d, [key]: v })); setErrors(e => ({ ...e, [key]: undefined })); setDirty(true); }, []);

  /* Missing answers, computed live from the same rules the server uses. */
  const missingByGroup = useMemo(() => {
    if (!form) return {};
    const out = {};
    for (const g of form.groups) out[g.id] = g.fields.filter(f => isRequired(f, data) && (isEmpty(data[f.key]) || (f.minItems && (data[f.key] || []).length < f.minItems))).map(f => f.key);
    return out;
  }, [form, data]);
  const missingTotal = Object.values(missingByGroup).reduce((n, a) => n + a.length, 0);
  const visibleCount = form ? form.groups.flatMap(g => g.fields).filter(f => isVisible(f, data)).length : 0;
  const filledCount = form ? form.groups.flatMap(g => g.fields).filter(f => isVisible(f, data) && !isEmpty(data[f.key])).length : 0;

  const payload = () => {
    const out = {};
    for (const [k, v] of Object.entries(data)) if (!isEmpty(v)) out[k] = typeof v === 'string' ? v.trim() : v;
    return out;
  };
  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const fail = x => { setErrors(x.fields || {}); setMsg({ tone: 'err', text: x.message }); scrollTop(); };

  /* Creates the draft on first save; afterwards updates it. */
  const ensureSaved = async () => {
    if (reqId) { const r = await api('/requirements/' + reqId, { method: 'PUT', body: { data: payload() } }); setRec(r.requirement); return r.requirement; }
    const r = await api('/requirements', { method: 'POST', body: { data: payload() } });
    setRec(r.requirement);
    setReqId(r.requirement.id); selfNav.current = r.requirement.id; navigate('/requirements/' + r.requirement.id, { replace: true });
    return r.requirement;
  };
  const saveDraft = async () => {
    setBusy('save'); setMsg(null);
    try { const r = await ensureSaved(); setRec(r); setData(r.data); setErrors({}); setDirty(false); setMsg({ tone: 'ok', text: 'Draft saved. You can come back and finish it at any time.' }); }
    catch (x) { fail(x); } finally { setBusy(''); }
  };
  const submit = async () => {
    setBusy('submit'); setMsg(null);
    try {
      const saved = reqId ? null : await ensureSaved();
      const id = reqId || saved.id;
      const r = await api(`/requirements/${id}/submit`, { method: 'POST', body: { data: payload() } });
      setDirty(false); setRec(r.requirement); setData(r.requirement.data); setAssessment(r.assessment);
      if (r.profiles) setProf({ profiles: r.profiles, timeline: r.timeline, controlCatalogue: r.controlCatalogue, summary: r.summary });
      navigate('/requirements/' + id, { replace: true });
      setMsg({ tone: 'ok', text: `Requirement submitted. Assessment ${r.assessment_id} created.` }); scrollTop();
    } catch (x) {
      if (x.code === 'incomplete') { setShowMissing(true); setDirty(false); setMsg({ tone: 'err', text: x.message, missing: x.body.missing }); setRec(r => r ? { ...r, check: { ...r.check, flags: x.body.flags } } : r); scrollTop(); }
      else fail(x);
    } finally { setBusy(''); }
  };
  const remove = async () => {
    if (!reqId) { navigate('/requirements'); return; }
    if (!window.confirm('Delete this draft requirement? This cannot be undone.')) return;
    try { await api('/requirements/' + reqId, { method: 'DELETE' }); setDirty(false); navigate('/requirements'); } catch (x) { fail(x); }
  };
  const upload = async (type, file) => {
    setBusy('doc-' + type); setMsg(null);
    try {
      const saved = reqId ? null : await ensureSaved();
      const r = await uploadDocument(reqId || saved.id, type, file);
      setDocs(d => [...d, r.document]); if (saved) { setRec(saved); setDirty(false); }
    } catch (x) { setMsg({ tone: 'err', text: x.message }); scrollTop(); } finally { setBusy(''); }
  };
  const removeDoc = async doc => {
    try { await api(`/requirements/${reqId}/documents/${doc.id}`, { method: 'DELETE' }); setDocs(d => d.filter(x => x.id !== doc.id)); }
    catch (x) { setMsg({ tone: 'err', text: x.message }); }
  };
  /* Step 3 boundary: corrections never overwrite the saved profile; they create the next version. */
  const startCorrect = () => { setCorrecting(true); setReason(''); setErrors({}); setShowMissing(false); setMsg(null); scrollTop(); };
  const cancelCorrect = () => { setCorrecting(false); setData(rec.data); setErrors({}); setDirty(false); setMsg(null); };
  const saveCorrection = async () => {
    setBusy('correct'); setMsg(null);
    try {
      const r = await api(`/assessments/${assessment.reference}/corrections`, { method: 'POST', body: { data: payload(), reason } });
      setAssessment(r.assessment); setData(r.requirement.data); setRec(x => ({ ...x, data: r.requirement.data, title: r.requirement.data.assessmentTitle }));
      setProf({ profiles: r.profiles, timeline: r.timeline, controlCatalogue: r.controlCatalogue, summary: r.summary });
      setCorrecting(false); setDirty(false); setErrors({});
      setMsg({ tone: 'ok', text: `Correction saved as requirement profile v${r.version}. Earlier versions are kept unchanged.` }); scrollTop();
    } catch (x) {
      if (x.code === 'incomplete') { setShowMissing(true); setMsg({ tone: 'err', text: x.message, missing: x.body.missing }); scrollTop(); }
      else if (x.code === 'no_changes') { setMsg({ tone: 'err', text: x.message }); scrollTop(); }
      else fail(x);
    } finally { setBusy(''); }
  };
  const fillExample = () => { setData(d => ({ ...d, ...EXAMPLE, buyerContactEmail: d.buyerContactEmail })); setErrors({}); setDirty(true); };
  const jump = key => { const el = document.querySelector(`[data-field="${key}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.querySelector('input,select,textarea,button')?.focus({ preventScroll: true }); };

  if (loadErr) return <><Link className="link" to="/requirements"><BackArrow s={14} /> Requirements</Link><p className="form-err">{loadErr}</p></>;
  if (!form || (routeId && !rec)) return <p className="note">Loading…</p>;
  if (rec?.status === 'submitted' && !correcting) return <SubmittedView form={form} rec={rec} docs={docs} msg={msg} reqId={reqId} assessment={assessment} prof={prof} onCorrect={assessment && prof ? startCorrect : null} />;
  const nextVersion = prof ? (v => { const [a, b] = v.split('.').map(Number); return `${a}.${b + 1}`; })(prof.profiles[prof.profiles.length - 1].version) : '';

  const flags = rec?.check?.flags || [];
  return (
    <div ref={topRef} className="rq">
      <Link className="link" to="/requirements" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><BackArrow s={14} /> Requirements</Link>
      <PageHead eyebrow={correcting ? `Buyer · Stage 1 · ${assessment.reference} · Correction` : 'Buyer · Stage 1 · Requirement · Step 1'} title={reqId ? (data.assessmentTitle || 'Untitled requirement') : 'New outsourcing requirement'}
        lead={correcting ? `Change the answers that need correcting. Saving creates requirement profile v${nextVersion}; version ${prof.profiles[prof.profiles.length - 1].version} and earlier stay unchanged in the evidence record. The Assessment ID stays ${assessment.reference}.`
          : 'Tell us what you plan to outsource. OffshoreAssure uses these answers to work out which jurisdictions, data-protection checks and supplier assurance controls apply. Save a draft at any time; submit when all required answers are complete.'}
        right={<div className="row">{correcting ? <span className="mono asr-tag">{assessment.reference}</span> : <Badge s="Draft" label={'Draft' + (rec ? ' · saved ' + fmtTime(rec.updatedAt) : ' · not saved yet')} />}
          {import.meta.env.DEV && !correcting ? <button type="button" className="btn demo sm" onClick={fillExample} title="Development only: fill the worked example from the Stage 1 specification">Fill example (dev)</button> : null}</div>} />

      {msg ? (
        <div className={'rq-msg ' + msg.tone} role={msg.tone === 'err' ? 'alert' : 'status'}>
          <b>{msg.text}</b>
          {msg.missing?.length ? <ul>{msg.missing.map(m => <li key={m.field}><button type="button" className="link" onClick={() => jump(m.field)}>{m.label}</button> <span className="note">· {m.reason}</span></li>)}</ul> : null}
        </div>) : null}
      {flags.length ? (
        <div className="rq-flags" aria-label="Things to note">
          {flags.map((f, i) => <div key={i} className={'rq-flag ' + f.level}><Icon n={f.level === 'info' ? 'shield' : 'alert'} s={16} /><span>{f.message}</span></div>)}
          <span className="note">Updated when you save.</span>
        </div>) : null}

      <div className="rq-wrap">
        <nav className="rq-nav card" aria-label="Form sections">
          <div className="rq-prog"><span><b>{filledCount}</b> of {visibleCount} answered</span><span className="rq-bar"><i style={{ width: (visibleCount ? filledCount / visibleCount * 100 : 0) + '%' }} /></span></div>
          {form.groups.map((g, i) => {
            const n = missingByGroup[g.id].length;
            return <a key={g.id} href={'#grp-' + g.id} className="rq-navlink"><span className="rq-num">{i + 1}</span><span>{g.title}</span>
              {n ? <small className="rq-miss">{n} to do</small> : <Icon n="check" s={15} />}</a>;
          })}
          <a href="#grp-docs" className="rq-navlink"><span className="rq-num">+</span><span>Documents</span><small className="note">{docs.length ? docs.length : 'optional'}</small></a>
        </nav>

        <div className="rq-main">
          {form.groups.map((g, i) => (
            <section key={g.id} id={'grp-' + g.id} className="card rq-group" aria-labelledby={'grp-' + g.id + '-h'}>
              <div className="ch"><div><h2 id={'grp-' + g.id + '-h'}><span className="rq-num">{i + 1}</span> {g.title}</h2><div className="sub">{g.lead}</div></div>
                <span className="note">{g.fields.length} field{g.fields.length === 1 ? '' : 's'}</span></div>
              <div className="form pad">
                {g.fields.filter(f => isVisible(f, data)).map(f => {
                  const req = isRequired(f, data);
                  const err = errors[f.key] || (f.withOther ? errors.systemsAccessedOther : null) || (showMissing && req && missingByGroup[g.id].includes(f.key) ? 'Required' : null);
                  return <RequirementField key={f.key} f={f} value={data[f.key]} data={data} form={form} required={req} error={err}
                    set={(v, k = f.key) => setField(k, v)} />;
                })}
              </div>
            </section>
          ))}

          <section id="grp-docs" className="card rq-group" aria-labelledby="grp-docs-h">
            <div className="ch"><div><h2 id="grp-docs-h">Supporting documents</h2><div className="sub">{correcting ? 'Documents cannot be changed in a correction; the files already attached stay linked to the new version. ' : ''}Optional. {form.documents.extensions.join(', ')} · up to {fmtBytes(form.documents.maxBytes)} each. A SHA-256 fingerprint is recorded for every file.</div></div></div>
            <div className="rq-docs">
              {form.documents.types.map(t => {
                const mine = docs.filter(d => d.type === t.id);
                return (
                  <div key={t.id} className="rq-doc">
                    <div><b>{t.label}</b>{mine.map(d => (
                      <div key={d.id} className="rq-file"><Icon n="doc" s={15} /><a href={docUrl(reqId, d.id)}>{d.fileName}</a><span className="note">{fmtBytes(d.size)} · SHA-256 {d.sha256.slice(0, 12)}…</span>
                        {correcting ? null : <button type="button" className="link" onClick={() => removeDoc(d)} aria-label={'Remove ' + d.fileName}>Remove</button>}</div>))}
                    </div>
                    {correcting ? null : <label className={'btn sm' + (busy === 'doc-' + t.id ? ' busy' : '')}>
                      {busy === 'doc-' + t.id ? 'Uploading…' : <><Icon n="upload" s={14} /> Upload</>}
                      <input type="file" className="vh" data-doc={t.id} accept={form.documents.extensions.map(e => '.' + e).join(',')}
                        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload(t.id, file); }} />
                    </label>}
                  </div>);
              })}
            </div>
          </section>
        </div>
      </div>

      {correcting ? (
        <div className="rq-actions">
          <div className="rq-correct">
            <label htmlFor="rq-reason" className="ql">What was corrected, and why? <span className="rq-req">*</span></label>
            <textarea id="rq-reason" maxLength={500} value={reason} onChange={e => { setReason(e.target.value); setErrors(x => ({ ...x, reason: undefined })); }} placeholder="e.g. HR confirmed that health data is involved" />
            {errors.reason ? <p className="form-err">{errors.reason}</p> : null}
          </div>
          <button type="button" className="btn" onClick={cancelCorrect}>Cancel</button>
          <button type="button" className="btn primary" disabled={!!busy} onClick={saveCorrection} data-act="save-correction">{busy === 'correct' ? 'Saving…' : `Save correction (creates v${nextVersion})`}</button>
        </div>
      ) : (
        <div className="rq-actions">
        <span className="note">{missingTotal ? `${missingTotal} required answer${missingTotal === 1 ? '' : 's'} still to complete` : 'All required answers complete'}{dirty ? ' · unsaved changes' : ''}</span>
        <button type="button" className="btn" onClick={remove}>{reqId ? 'Delete draft' : 'Cancel'}</button>
        <button type="button" className="btn" disabled={!!busy} onClick={saveDraft} data-act="save-draft">{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button type="button" className="btn primary" disabled={!!busy} onClick={submit} data-act="submit-req">{busy === 'submit' ? 'Submitting…' : 'Submit requirement'}</button>
      </div>
      )}
    </div>
  );
}

/* Read-only view once the requirement has been accepted. */
function SubmittedView({ form, rec, docs, msg, reqId, assessment, prof, onCorrect }) {
  const d = rec.data;
  const country = c => c === form.unknown ? 'Unknown' : (form.countries.find(x => x.code === c)?.name || c);
  const show = (f, v) => {
    if (isEmpty(v)) return <span className="muted">—</span>;
    if (f.type === 'country') return country(v);
    if (f.type === 'countries') return v.map(country).join(', ');
    if (Array.isArray(v)) return v.join(', ') + (f.withOther && d.systemsAccessedOther ? ` (${d.systemsAccessedOther})` : '');
    if (f.key === 'estimatedBudget') return Number(v).toLocaleString('en-GB') + (d.currency ? ' ' + d.currency : '');
    return String(v);
  };
  const flags = rec.check?.flags || [];
  return (
    <div className="rq">
      <Link className="link" to="/requirements" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><BackArrow s={14} /> Requirements</Link>
      <PageHead eyebrow={assessment ? `Buyer · Stage 1 · Requirement · ${prof?.summary ? 'Stage 1 complete' : `Steps 1–${prof ? 3 : 2} complete`}` : 'Buyer · Stage 1 · Requirement · Step 1 complete'} title={d.assessmentTitle} lead={`${d.buyerLegalName} · ${d.serviceCategory} · submitted ${fmtTime(rec.submittedAt)}`}
        right={assessment ? <span className="mono asr-tag">{assessment.reference}</span> : <Badge s="Submitted" label="Submitted · accepted" />} />
      {msg ? <div className={'rq-msg ' + msg.tone} role="status"><b>{msg.text}</b></div> : null}
      {prof?.summary ? <InformationRequired s={prof.summary} onCorrect={onCorrect} /> : null}
      {assessment ? <AssessmentResult a={assessment} buyerName={d.buyerLegalName} /> : (
        <div className="card rq-next"><Icon n="check" s={20} /><div><b>Requirement accepted.</b> The answers are locked; corrections will create a new version.</div></div>)}
      {prof ? <ProfilePanel profiles={prof.profiles} timeline={prof.timeline} catalogue={prof.controlCatalogue} onCorrect={onCorrect} /> : null}
      {prof?.summary ? <div className="card rq-next" data-section="next-stage">
        <Icon n="clock" s={20} />
        <div><b>Stage 1 is complete. Next: Stage 2 — Vendor selection.</b> Search for a verified vendor or invite one, compare candidates and record the decision.
          <div style={{ marginTop: 8 }}><Link className="btn primary sm" to={'/vendor-selection/' + assessment.reference} data-act="go-selection">Open vendor selection</Link></div></div>
      </div> : null}
      <h2 className="rq-sub">Current answers{prof ? ` (profile v${prof.profiles[prof.profiles.length - 1].version})` : ''}</h2>
      {!assessment && flags.length ? <div className="rq-flags">{flags.map((f, i) => <div key={i} className={'rq-flag ' + f.level}><Icon n={f.level === 'info' ? 'shield' : 'alert'} s={16} /><span>{f.message}</span></div>)}</div> : null}
      {form.groups.map((g, i) => (
        <section key={g.id} className="card">
          <div className="ch"><h2><span className="rq-num">{i + 1}</span> {g.title}</h2></div>
          <dl className="kv rq-kv">{g.fields.filter(f => isVisible(f, d)).map(f => <div key={f.key}><dt>{f.label}</dt><dd>{show(f, d[f.key])}</dd></div>)}</dl>
        </section>
      ))}
      <section className="card">
        <div className="ch"><h2>Supporting documents</h2><span className="note">{docs.length} file{docs.length === 1 ? '' : 's'}</span></div>
        {docs.length ? <div className="tw"><table>
          <thead><tr><th>Document</th><th>File</th><th>Size</th><th>SHA-256</th></tr></thead>
          <tbody>{docs.map(x => <tr key={x.id}><td>{form.documents.types.find(t => t.id === x.type)?.label}</td><td><a className="link" href={docUrl(reqId, x.id)}>{x.fileName}</a></td><td>{fmtBytes(x.size)}</td><td className="mono note">{x.sha256.slice(0, 16)}…</td></tr>)}</tbody>
        </table></div> : <p className="note pad">No documents were attached.</p>}
      </section>
    </div>
  );
}
