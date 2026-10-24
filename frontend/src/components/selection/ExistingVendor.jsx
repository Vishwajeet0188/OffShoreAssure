import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { SOURCE_LABEL } from '../../lib/selection.js';
import Loading from '../extras/Loading.jsx';

/* Step 5 · Route C: reuse a vendor our organisation added or selected before. The engine loads the saved
   profile and reports material changes since our last selection. Updated contact details make a new profile version. */
export default function ExistingVendor({ reference, def, serviceCategories, onChange }) {
  const [vendors, setVendors] = useState(null);
  const [f, setF] = useState({ vendorId: '', serviceCategory: def.onboardingDefaults.serviceCategory || '', scopeDescription: '', reviewReason: '' });
  const [contact, setContact] = useState({ contactName: '', contactEmail: '', contactRole: '', contactPhone: '' });
  const [showContact, setShowContact] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [changes, setChanges] = useState(null);

  useEffect(() => { api(`/assessments/${reference}/existing-vendors`).then(r => setVendors(r.vendors)).catch(x => setMsg(x.message)); }, [reference]);
  const set = k => e => { setF(x => ({ ...x, [k]: e.target.value })); setErrors(x => ({ ...x, [k]: undefined })); };
  const setC = k => e => setContact(x => ({ ...x, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setBusy(true); setMsg(''); setErrors({});
    const filled = Object.fromEntries(Object.entries(contact).filter(([, v]) => v.trim()));
    try {
      const r = await api(`/assessments/${reference}/existing-vendors`, { method: 'POST', body: { ...f, ...(Object.keys(filled).length ? { contact: filled } : {}) } });
      setChanges(r.materialChanges);
      const name = vendors.find(v => v.id === f.vendorId)?.name;
      onChange(r.state, `${name} added as a candidate.${r.materialChanges.length ? ` ${r.materialChanges.length} material change${r.materialChanges.length > 1 ? 's' : ''} since your last selection.` : ''}`);
    } catch (x) { setErrors(x.fields || {}); setMsg(x.message); } finally { setBusy(false); }
  };

  if (!vendors) return msg ? <p className="form-err pad">{msg}</p> : <Loading pad />;
  if (!vendors.length) return <p className="note pad" data-route="existing">Your organisation has not added or selected any vendors yet. Search the directory or add your own vendor first.</p>;
  const chosen = vendors.find(v => v.id === f.vendorId);
  const err = k => errors[k] ? <p className="form-err">{errors[k]}</p> : null;

  return (
    <form className="vs-route pad stack" onSubmit={submit} noValidate data-route="existing" data-form="existing">
      <div className="form">
        <div className={'field rq-field full' + (errors.vendorId ? ' has-err' : '')} data-field="vendorId">
          <label htmlFor="ev-vendor">Existing supplier<span className="rq-req" aria-label="required"> *</span></label>
          <select id="ev-vendor" value={f.vendorId} onChange={set('vendorId')}>
            <option value="">Choose an existing supplier…</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name} · {SOURCE_LABEL[v.source]}{v.timesSelected ? ` · selected ${v.timesSelected}×` : ''}</option>)}
          </select>
          {chosen ? <span className="note">Profile v{chosen.profileVersion}{chosen.lastSelectedAt ? ` · last selected ${fmtTime(chosen.lastSelectedAt)}` : ''} · {chosen.verificationStatus}</span> : null}
          {err('vendorId')}
        </div>
        <div className={'field rq-field' + (errors.serviceCategory ? ' has-err' : '')} data-field="serviceCategory">
          <label htmlFor="ev-service">Service for this assessment<span className="rq-req" aria-label="required"> *</span></label>
          <select id="ev-service" value={f.serviceCategory} onChange={set('serviceCategory')}><option value="">Choose…</option>{serviceCategories.map(s => <option key={s}>{s}</option>)}</select>
          {err('serviceCategory')}
        </div>
        <div className={'field rq-field full' + (errors.scopeDescription ? ' has-err' : '')} data-field="scopeDescription">
          <label htmlFor="ev-scope">Desired service scope<span className="rq-req" aria-label="required"> *</span></label>
          <textarea id="ev-scope" rows={2} maxLength={2000} value={f.scopeDescription} onChange={set('scopeDescription')} placeholder="e.g. remote administration for the Manchester office" />
          {err('scopeDescription')}
        </div>
        <div className={'field rq-field full' + (errors.reviewReason ? ' has-err' : '')} data-field="reviewReason">
          <label htmlFor="ev-reason">Review reason<span className="rq-req" aria-label="required"> *</span></label>
          <input id="ev-reason" type="text" maxLength={1000} value={f.reviewReason} onChange={set('reviewReason')} placeholder="e.g. annual review, contract renewal, new site" />
          {err('reviewReason')}
        </div>
      </div>
      <button type="button" className="link vs-more" onClick={() => setShowContact(s => !s)} aria-expanded={showContact} data-act="update-contact">
        {showContact ? 'Keep the saved contact details' : 'Update contact details (optional)'}
      </button>
      {showContact ? (
        <div className="form" data-section="contact">
          {[['contactName', 'Contact name', 'text'], ['contactEmail', 'Contact email', 'email'], ['contactPhone', 'Contact telephone', 'text']].map(([k, label, type]) => (
            <div key={k} className={'field rq-field' + (errors['contact.' + k] ? ' has-err' : '')}>
              <label htmlFor={'ev-' + k}>{label} <span className="note">(optional)</span></label>
              <input id={'ev-' + k} type={type} value={contact[k]} onChange={setC(k)} />{err('contact.' + k)}
            </div>))}
          <div className="field rq-field"><label htmlFor="ev-role">Contact role <span className="note">(optional)</span></label>
            <select id="ev-role" value={contact.contactRole} onChange={setC('contactRole')}><option value="">Keep as saved</option>{def.options.contactRoles.map(r => <option key={r}>{r}</option>)}</select></div>
          {chosen?.source === 'DIRECTORY' ? <p className="note full" style={{ margin: 0 }}>Directory vendors keep their own contact details; changes here are not saved to their profile.</p> : null}
        </div>) : null}
      <div className="row"><button className="btn primary" type="submit" disabled={busy} data-act="reuse-vendor">{busy ? 'Loading…' : 'Load vendor and check it'}</button>
        {msg ? <span className="form-err">{msg}</span> : null}</div>
      {changes ? (changes.length ? (
        <div className="rq-flag warning" data-section="material-changes"><div><b>Material changes since your last selection:</b>
          <ul>{changes.map(c => <li key={c.field}>{c.label}: {fmt(c.before)} → {fmt(c.after)}</li>)}</ul></div></div>
      ) : <p className="note" data-section="material-changes">No material changes since your last selection.</p>) : null}
    </form>
  );
}
const fmt = v => v == null || (Array.isArray(v) && !v.length) ? 'not stated' : Array.isArray(v) ? v.join(', ') : String(v);
