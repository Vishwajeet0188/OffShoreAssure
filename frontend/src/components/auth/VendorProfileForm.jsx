import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import CountryPicker from '../requirements/CountryPicker.jsx';

const EMPTY = { fullName: '', jobRole: '', phone: '', organisationName: '', registrationNumber: '', country: '', services: [], deliveryCountries: [], website: '', description: '' };

/* Vendor (supplier) company profile: the person, plus the company's reusable profile shown to buyers once verified. */
export default function VendorProfileForm({ initial, submitLabel, onSaved, extraButtons, notice }) {
  const [ref, setRef] = useState(null);
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}) });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/reference').then(setRef).catch(x => setMsg(x.message)); }, []);
  const set = k => e => { setF(x => ({ ...x, [k]: e.target.value })); setErrs(x => ({ ...x, [k]: undefined })); };
  const setV = k => v => { setF(x => ({ ...x, [k]: v })); setErrs(x => ({ ...x, [k]: undefined })); };
  const toggle = s => setF(x => ({ ...x, services: x.services.includes(s) ? x.services.filter(y => y !== s) : [...x.services, s] }));

  const submit = async e => {
    e.preventDefault(); setMsg('');
    const v = {};
    if (f.fullName.trim().length < 2) v.fullName = 'Enter your full name.';
    if (!f.jobRole) v.jobRole = 'Choose your role.';
    if (f.organisationName.trim().length < 2) v.organisationName = 'Enter your company’s legal name.';
    if (f.registrationNumber.trim().length < 2) v.registrationNumber = 'Enter the company registration number.';
    if (!f.country) v.country = 'Choose the country of registration.';
    if (!f.services.length) v.services = 'Choose at least one service you provide.';
    if (!f.deliveryCountries.length) v.deliveryCountries = 'Choose at least one country you deliver from.';
    setErrs(v); if (Object.keys(v).length) return;
    setBusy(true);
    try { await onSaved({ ...f }); }
    catch (x) { setErrs(x.fields || {}); setMsg(x.message); } finally { setBusy(false); }
  };
  const err = k => errs[k] ? <span className="form-err">{errs[k]}</span> : null;
  if (!ref) return <p className="note">{msg || 'Loading…'}</p>;
  return (
    <form className="form" noValidate onSubmit={submit} data-form="vendor-profile">
      <div className="field full"><h3 className="vp-h">About you</h3></div>
      <div className="field"><label htmlFor="vp-name">Full name</label><input type="text" id="vp-name" autoComplete="name" value={f.fullName} onChange={set('fullName')} />{err('fullName')}</div>
      <div className="field"><label htmlFor="vp-role">Your role</label>
        <select id="vp-role" value={f.jobRole} onChange={set('jobRole')}><option value="">Select…</option>{ref.vendorJobRoles.map(s => <option key={s}>{s}</option>)}</select>{err('jobRole')}</div>
      <div className="field"><label htmlFor="vp-phone">Phone (optional)</label><input type="tel" id="vp-phone" autoComplete="tel" value={f.phone} onChange={set('phone')} />{err('phone')}</div>

      <div className="field full"><h3 className="vp-h">Your company</h3>
        <span className="note">This becomes your reusable company profile. Once the OffshoreAssure team has verified it, it can be presented to UK buyers on the platform.</span></div>
      <div className="field"><label htmlFor="vp-org">Company legal name</label><input type="text" id="vp-org" autoComplete="organization" placeholder="As registered" value={f.organisationName} onChange={set('organisationName')} />{err('organisationName')}</div>
      <div className="field"><label htmlFor="vp-reg">Company registration number</label><input type="text" id="vp-reg" value={f.registrationNumber} onChange={set('registrationNumber')} />{err('registrationNumber')}</div>
      <div className="field"><label htmlFor="vp-country">Country of registration</label>
        <CountryPicker id="vp-country" value={f.country} onChange={setV('country')} countries={ref.countries} invalid={!!errs.country} />{err('country')}</div>
      <div className="field"><label htmlFor="vp-web">Website (optional)</label><input type="text" id="vp-web" placeholder="www.example.com" value={f.website} onChange={set('website')} />{err('website')}</div>
      <div className="field full"><label id="vp-services-l">Services you provide</label>
        <div className="rq-checks" role="group" aria-labelledby="vp-services-l">{ref.serviceCategories.map(s => (
          <label key={s} className={'rq-check' + (f.services.includes(s) ? ' on' : '')}><input type="checkbox" checked={f.services.includes(s)} onChange={() => toggle(s)} />{s}</label>))}</div>{err('services')}</div>
      <div className="field full"><label htmlFor="vp-delivery">Countries you deliver from</label>
        <CountryPicker id="vp-delivery" multi value={f.deliveryCountries} onChange={setV('deliveryCountries')} countries={ref.countries} invalid={!!errs.deliveryCountries} />
        <span className="note">Where your staff work or access client systems from.</span>{err('deliveryCountries')}</div>
      <div className="field full"><label htmlFor="vp-desc">Short company description (optional)</label>
        <textarea id="vp-desc" maxLength={1000} value={f.description} onChange={set('description')} placeholder="What you do and for whom" />{err('description')}</div>
      <div className="field full">
        {notice}
        {msg ? <p className="form-err" role="alert">{msg}</p> : null}
        <div className="row"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>{extraButtons}</div>
      </div>
    </form>
  );
}
