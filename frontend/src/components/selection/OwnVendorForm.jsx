import { useState } from 'react';
import { api } from '../../lib/api.js';
import { isRequired } from '../../lib/requirements.js';
import { uploadVendorDocument } from '../../lib/selection.js';
import RequirementField from '../requirements/RequirementField.jsx';

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', region: '', postcode: '' };

/* Step 5 · Route B: add our own vendor (25 onboarding fields). The vendor starts as BUYER_PROVIDED and UNVERIFIED;
   no certificate or signed DPA is needed to create it. The contract and DPA files are uploaded right after. */
export default function OwnVendorForm({ reference, def, onChange }) {
  const blank = () => ({
    ...def.onboardingDefaults,
    registeredAddress: EMPTY_ADDRESS,
    deliveryCountries: [],
    certificationsClaimed: [],
  });
  const [data, setData] = useState(blank);
  const [files, setFiles] = useState({ existingContract: null, existingDpa: null });
  const [errors, setErrors] = useState({});
  const [dupes, setDupes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const form = { countries: def.countries, currencies: def.currencies, unknown: def.unknown };
  const set = key => v => {
    setData(d => ({ ...d, [key]: v }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const submit = async (e, notDuplicate = false) => {
    e?.preventDefault();
    setBusy(true);
    setMsg('');
    setErrors({});
    try {
      const r = await api(`/assessments/${reference}/own-vendors`, {
        method: 'POST',
        body: { ...data, notDuplicate },
      });
      let state = r.state;
      const failed = [];
      for (const [key, type] of [
        ['existingContract', 'contract'],
        ['existingDpa', 'dpa'],
      ]) {
        if (!files[key]) continue;
        try {
          state = await uploadVendorDocument(reference, r.vendorId, type, files[key]);
        } catch (x) {
          failed.push(`${files[key].name}: ${x.message}`);
        }
      }
      setDupes(null);
      setData(blank());
      setFiles({ existingContract: null, existingDpa: null });
      onChange(
        state,
        `${data.legalName.trim()} added as a buyer-provided vendor (unverified).${r.notes?.length ? ' ' + r.notes.join(' ') : ''}${failed.length ? ' Not uploaded: ' + failed.join('; ') : ''}`,
      );
    } catch (x) {
      if (x.code === 'possible_duplicate') setDupes(x.body.duplicates);
      setErrors(x.fields || {});
      setMsg(x.message);
      setTimeout(
        () =>
          document
            .querySelector('[data-form="own-vendor"] .has-err')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        50,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="vs-route stack" onSubmit={submit} noValidate data-form="own-vendor">
      <p className="note pad" style={{ paddingBottom: 0 }}>
        Adding a vendor does not certify it. It is checked against your requirement as a preliminary,
        unverified profile, and verified during the assessment.
      </p>
      {def.onboardingGroups.map((g, i) => (
        <fieldset key={g.id} className="vs-group" data-group={g.id}>
          <legend>
            <span className="rq-num">{i + 1}</span> {g.title}
          </legend>
          <div className="form">
            {g.fields.map(f => {
              if (f.type === 'address')
                return (
                  <AddressField
                    key={f.key}
                    value={data.registeredAddress}
                    set={set('registeredAddress')}
                    error={errors.registeredAddress}
                  />
                );
              if (f.type === 'file')
                return (
                  <FileField
                    key={f.key}
                    f={f}
                    file={files[f.key]}
                    set={file => setFiles(x => ({ ...x, [f.key]: file }))}
                  />
                );
              const field = f.type === 'url' || f.type === 'phone' ? { ...f, type: 'text' } : f;
              return (
                <RequirementField
                  key={f.key}
                  f={field}
                  value={data[f.key]}
                  set={set(f.key)}
                  data={data}
                  form={form}
                  required={isRequired(f, data)}
                  error={errors[f.key]}
                />
              );
            })}
          </div>
        </fieldset>
      ))}
      {dupes ? (
        <div className="rq-flag warning" data-section="duplicates" style={{ margin: '0 22px' }}>
          <div>
            <b>Possible duplicate.</b> Already in the OffshoreAssure directory:{' '}
            {dupes.map(d => d.name).join(', ')}. Search the directory to use the verified record.
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => submit(null, true)}
                data-act="not-duplicate"
              >
                It is a different company: add it
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="row pad" style={{ paddingTop: 0 }}>
        <button className="btn primary" type="submit" disabled={busy} data-act="add-own-vendor">
          {busy ? 'Adding…' : 'Add vendor and check it'}
        </button>
        {msg && !dupes ? <span className="form-err">{msg}</span> : null}
      </div>
    </form>
  );
}

function AddressField({ value, set, error }) {
  const v = value || EMPTY_ADDRESS;
  const part = k => e => set({ ...v, [k]: e.target.value });
  return (
    <div className={'field rq-field full' + (error ? ' has-err' : '')} data-field="registeredAddress">
      <label htmlFor="ov-line1">
        Registered address
        <span className="rq-req" aria-label="required">
          {' '}
          *
        </span>
      </label>
      <div className="vs-address">
        <input
          id="ov-line1"
          type="text"
          placeholder="Address line 1"
          maxLength={200}
          value={v.line1}
          onChange={part('line1')}
          aria-invalid={!!error}
        />
        <input
          type="text"
          placeholder="Address line 2 (optional)"
          aria-label="Address line 2"
          maxLength={200}
          value={v.line2}
          onChange={part('line2')}
        />
        <input
          type="text"
          placeholder="Town or city"
          aria-label="Town or city"
          maxLength={100}
          value={v.city}
          onChange={part('city')}
        />
        <input
          type="text"
          placeholder="Region (optional)"
          aria-label="Region"
          maxLength={100}
          value={v.region}
          onChange={part('region')}
        />
        <input
          type="text"
          placeholder="Postcode"
          aria-label="Postcode"
          maxLength={20}
          value={v.postcode}
          onChange={part('postcode')}
        />
      </div>
      <span className="note">The postcode is checked against the registered country.</span>
      {error ? <p className="form-err">{error}</p> : null}
    </div>
  );
}

function FileField({ f, file, set }) {
  return (
    <div className="field rq-field" data-field={f.key}>
      <label htmlFor={'ov-' + f.key}>
        {f.label} <span className="note">(optional)</span>
      </label>
      <input
        id={'ov-' + f.key}
        type="file"
        accept=".pdf,.docx"
        onChange={e => set(e.target.files?.[0] || null)}
      />
      <span className="note">{file ? `${file.name} will be uploaded when you add the vendor.` : f.help}</span>
    </div>
  );
}
