import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import CountryPicker from '../requirements/CountryPicker.jsx';

const EMPTY = {
  fullName: '',
  jobRole: '',
  phone: '',
  organisationName: '',
  registrationNumber: '',
  country: '',
  services: [],
  deliveryCountries: [],
  website: '',
  description: '',
};
const EMPTY_DIRECTORY = {
  deliveryModel: '',
  industries: [],
  staffCount: '',
  foundedYear: '',
  certifications: [],
  insuranceCover: '',
  insuranceCurrency: '',
  supportHours: '',
  languages: [],
  minAnnualValue: '',
  valueCurrency: '',
  usesSubprocessors: '',
};

/* Vendor (supplier) company profile: the person, plus the company's reusable profile shown to buyers once verified. */
export default function VendorProfileForm({ initial, submitLabel, onSaved, extraButtons, notice }) {
  const [ref, setRef] = useState(null);
  const [f, setF] = useState({
    ...EMPTY,
    ...(initial || {}),
    directory: { ...EMPTY_DIRECTORY, ...(initial?.directory || {}) },
  });
  const [showDirectory, setShowDirectory] = useState(false);
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/reference')
      .then(setRef)
      .catch(x => setMsg(x.message));
  }, []);
  const set = k => e => {
    setF(x => ({ ...x, [k]: e.target.value }));
    setErrs(x => ({ ...x, [k]: undefined }));
  };
  const setV = k => v => {
    setF(x => ({ ...x, [k]: v }));
    setErrs(x => ({ ...x, [k]: undefined }));
  };
  const toggle = s =>
    setF(x => ({
      ...x,
      services: x.services.includes(s) ? x.services.filter(y => y !== s) : [...x.services, s],
    }));

  const submit = async e => {
    e.preventDefault();
    setMsg('');
    const v = {};
    if (f.fullName.trim().length < 2) v.fullName = 'Enter your full name.';
    if (!f.jobRole) v.jobRole = 'Choose your role.';
    if (f.organisationName.trim().length < 2) v.organisationName = 'Enter your company’s legal name.';
    if (f.registrationNumber.trim().length < 2)
      v.registrationNumber = 'Enter the company registration number.';
    if (!f.country) v.country = 'Choose the country of registration.';
    if (!f.services.length) v.services = 'Choose at least one service you provide.';
    if (!f.deliveryCountries.length) v.deliveryCountries = 'Choose at least one country you deliver from.';
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await onSaved({ ...f });
    } catch (x) {
      setErrs(x.fields || {});
      setMsg(x.message);
      if (Object.keys(x.fields || {}).some(k => k.startsWith('directory.'))) setShowDirectory(true);
    } finally {
      setBusy(false);
    }
  };
  const err = k => (errs[k] ? <span className="form-err">{errs[k]}</span> : null);
  if (!ref) return <p className="note">{msg || 'Loading…'}</p>;
  return (
    <form className="form" noValidate onSubmit={submit} data-form="vendor-profile">
      <div className="field full">
        <h3 className="vp-h">About you</h3>
      </div>
      <div className="field">
        <label htmlFor="vp-name">Full name</label>
        <input type="text" id="vp-name" autoComplete="name" value={f.fullName} onChange={set('fullName')} />
        {err('fullName')}
      </div>
      <div className="field">
        <label htmlFor="vp-role">Your role</label>
        <select id="vp-role" value={f.jobRole} onChange={set('jobRole')}>
          <option value="">Select…</option>
          {ref.vendorJobRoles.map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {err('jobRole')}
      </div>
      <div className="field">
        <label htmlFor="vp-phone">Phone (optional)</label>
        <input type="tel" id="vp-phone" autoComplete="tel" value={f.phone} onChange={set('phone')} />
        {err('phone')}
      </div>

      <div className="field full">
        <h3 className="vp-h">Your company</h3>
        <span className="note">
          This becomes your reusable company profile. Once the OffshoreAssure team has verified it, it can be
          presented to UK buyers on the platform.
        </span>
      </div>
      <div className="field">
        <label htmlFor="vp-org">Company legal name</label>
        <input
          type="text"
          id="vp-org"
          autoComplete="organization"
          placeholder="As registered"
          value={f.organisationName}
          onChange={set('organisationName')}
        />
        {err('organisationName')}
      </div>
      <div className="field">
        <label htmlFor="vp-reg">Company registration number</label>
        <input type="text" id="vp-reg" value={f.registrationNumber} onChange={set('registrationNumber')} />
        {err('registrationNumber')}
      </div>
      <div className="field">
        <label htmlFor="vp-country">Country of registration</label>
        <CountryPicker
          id="vp-country"
          value={f.country}
          onChange={setV('country')}
          countries={ref.countries}
          invalid={!!errs.country}
        />
        {err('country')}
      </div>
      <div className="field">
        <label htmlFor="vp-web">Website (optional)</label>
        <input
          type="text"
          id="vp-web"
          placeholder="www.example.com"
          value={f.website}
          onChange={set('website')}
        />
        {err('website')}
      </div>
      <div className="field full">
        <label id="vp-services-l">Services you provide</label>
        <div className="rq-checks" role="group" aria-labelledby="vp-services-l">
          {ref.serviceCategories.map(s => (
            <label key={s} className={'rq-check' + (f.services.includes(s) ? ' on' : '')}>
              <input type="checkbox" checked={f.services.includes(s)} onChange={() => toggle(s)} />
              {s}
            </label>
          ))}
        </div>
        {err('services')}
      </div>
      <div className="field full">
        <label htmlFor="vp-delivery">Countries you deliver from</label>
        <CountryPicker
          id="vp-delivery"
          multi
          value={f.deliveryCountries}
          onChange={setV('deliveryCountries')}
          countries={ref.countries}
          invalid={!!errs.deliveryCountries}
        />
        <span className="note">Where your staff work or access client systems from.</span>
        {err('deliveryCountries')}
      </div>
      <div className="field full">
        <label htmlFor="vp-desc">Short company description (optional)</label>
        <textarea
          id="vp-desc"
          maxLength={1000}
          value={f.description}
          onChange={set('description')}
          placeholder="What you do and for whom"
        />
        {err('description')}
      </div>
      <div className="field full">
        <h3 className="vp-h">
          Directory details <span className="note">(optional)</span>
        </h3>
        <span className="note">
          Buyers can filter the OffshoreAssure directory by these. Anything you leave empty shows as "Not
          stated" and never hides your company.
        </span>
        <button
          type="button"
          className="link vs-more"
          onClick={() => setShowDirectory(x => !x)}
          aria-expanded={showDirectory}
          data-act="directory-details"
        >
          {showDirectory
            ? 'Hide directory details'
            : 'Add directory details (experience, staff, certifications, insurance, languages…)'}
        </button>
      </div>
      {showDirectory ? (
        <DirectoryDetails
          d={f.directory}
          set={d => setF(x => ({ ...x, directory: d }))}
          ref0={ref}
          errs={errs}
        />
      ) : null}
      <div className="field full">
        {notice}
        {msg ? (
          <p className="form-err" role="alert">
            {msg}
          </p>
        ) : null}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </button>
          {extraButtons}
        </div>
      </div>
    </form>
  );
}

/* Optional details used by the Stage 2 directory filters. */
function DirectoryDetails({ d, set, ref0, errs }) {
  const on = k => e => set({ ...d, [k]: e.target.value });
  const toggle = (k, v) => set({ ...d, [k]: d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v] });
  const err = k =>
    errs['directory.' + k] ? <span className="form-err">{errs['directory.' + k]}</span> : null;
  const checks = (k, options, label) => (
    <div className="field full">
      <label id={'vd-' + k}>{label}</label>
      <div className="rq-checks" role="group" aria-labelledby={'vd-' + k}>
        {options.map(o => (
          <label key={o} className={'rq-check' + (d[k].includes(o) ? ' on' : '')}>
            <input type="checkbox" checked={d[k].includes(o)} onChange={() => toggle(k, o)} />
            {o}
          </label>
        ))}
      </div>
      {err(k)}
    </div>
  );
  const select = (k, options, label) => (
    <div className="field">
      <label htmlFor={'vd-' + k}>{label}</label>
      <select id={'vd-' + k} value={d[k]} onChange={on(k)}>
        <option value="">Not stated</option>
        {options.map(o => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {err(k)}
    </div>
  );
  const money = (amount, currency, label) => (
    <div className="field">
      <label htmlFor={'vd-' + amount}>{label}</label>
      <div className="vs-money">
        <input
          id={'vd-' + amount}
          type="number"
          min="0"
          step="0.01"
          value={d[amount]}
          onChange={on(amount)}
        />
        <select aria-label="Currency" value={d[currency]} onChange={on(currency)}>
          <option value="">Currency</option>
          {ref0.currencies.map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {err(amount)}
      {err(currency)}
    </div>
  );
  return (
    <>
      {select('deliveryModel', ['Remote', 'Onsite', 'Hybrid'], 'Delivery model')}
      {select('supportHours', ['Business hours', 'Extended hours', '24/7'], 'Support hours')}
      <div className="field">
        <label htmlFor="vd-staffCount">Number of staff</label>
        <input
          id="vd-staffCount"
          type="number"
          min="0"
          step="1"
          value={d.staffCount}
          onChange={on('staffCount')}
        />
        {err('staffCount')}
      </div>
      <div className="field">
        <label htmlFor="vd-foundedYear">Year the company started</label>
        <input
          id="vd-foundedYear"
          type="number"
          min="1800"
          step="1"
          value={d.foundedYear}
          onChange={on('foundedYear')}
        />
        {err('foundedYear')}
      </div>
      {money('insuranceCover', 'insuranceCurrency', 'Insurance cover')}
      {money('minAnnualValue', 'valueCurrency', 'Smallest annual contract you take on')}
      {select('usesSubprocessors', ['Yes', 'No', 'Unknown'], 'Do you use subprocessors?')}
      {checks('industries', ref0.sectors, 'Industry experience')}
      {checks(
        'certifications',
        ref0.vendorCertifications,
        'Certifications held (checked later with evidence)',
      )}
      {checks('languages', ref0.vendorLanguages, 'Languages your team supports')}
    </>
  );
}
