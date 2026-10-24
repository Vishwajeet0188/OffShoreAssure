import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { countryList } from '../../lib/selection.js';
import RequirementField from '../requirements/RequirementField.jsx';
import CountryPicker from '../requirements/CountryPicker.jsx';
import Loading from '../extras/Loading.jsx';
import { EligibilityBadge, FitBadges, ScoreBar } from './FitChecks.jsx';

const MAIN = ['search', 'serviceCategory', 'supplierCountries'];

/* Step 5 · Route A: search the directory (15 inputs), Step 6 match and Step 7 ranking for each result. */
export default function DirectorySearch({ reference, def, names, candidateIds, onChange }) {
  const [c, setC] = useState(() => ({ search: '', ...def.defaults }));
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const run = async (criteria = c) => {
    setBusy('search'); setErrors({}); setMsg('');
    const body = Object.fromEntries(Object.entries(criteria).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));
    try { setResult(await api(`/assessments/${reference}/vendors/search`, { method: 'POST', body })); }
    catch (x) { setErrors(x.fields || {}); setMsg(x.message); }
    finally { setBusy(''); }
  };
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async v => {
    setBusy('add' + v.id); setMsg('');
    try { onChange(await api(`/assessments/${reference}/shortlist`, { method: 'POST', body: { vendorId: v.id } }), `${v.name} added to the candidates.`); }
    catch (x) { setMsg(x.message); } finally { setBusy(''); }
  };

  const set = key => v => setC(prev => ({ ...prev, [key]: v }));
  const filter = key => def.directoryFilters.find(f => f.key === key);
  const any = (c.supplierCountries || []).includes(def.anyCountry);
  const form = { countries: def.countries, currencies: def.currencies, unknown: def.unknown };

  return (
    <div className="vs-route" data-route="directory">
      <form className="pad stack" onSubmit={e => { e.preventDefault(); run(); }} noValidate data-form="directory">
        <div className="form">
          <RequirementField f={filter('search')} value={c.search} set={set('search')} data={c} form={form} error={errors.search} />
          <RequirementField f={filter('serviceCategory')} value={c.serviceCategory} set={set('serviceCategory')} data={c} form={form} required error={errors.serviceCategory} />
          <div className={'field rq-field full' + (errors.supplierCountries ? ' has-err' : '')} data-field="supplierCountries">
            <label htmlFor="ds-countries">Supplier countries<span className="rq-req" aria-label="required"> *</span></label>
            <label className="vs-check"><input type="checkbox" checked={any} data-act="any-country"
              onChange={e => setC(prev => ({ ...prev, supplierCountries: e.target.checked ? [def.anyCountry] : [] }))} /> Any country</label>
            {!any ? <CountryPicker id="ds-countries" multi value={c.supplierCountries} onChange={set('supplierCountries')} countries={def.countries} invalid={!!errors.supplierCountries} /> : null}
            {errors.supplierCountries ? <p className="form-err">{errors.supplierCountries}</p> : <span className="note">Countries the vendor delivers from. Starts with your preferred countries.</span>}
          </div>
        </div>
        <button type="button" className="link vs-more" onClick={() => setMore(m => !m)} data-act="more-filters" aria-expanded={more}>
          {more ? 'Fewer filters' : 'More filters (delivery model, experience, certifications, insurance, budget…)'}
        </button>
        {more ? (
          <div className="form" data-section="more-filters">
            {def.directoryFilters.filter(f => !MAIN.includes(f.key)).map(f => {
              if (f.key === 'insuranceAmount') return (
                <MoneyField key={f.key} label={f.label} amountKey="insuranceAmount" currencyKey="insuranceCurrency" c={c} setC={setC} errors={errors} currencies={def.currencies} />);
              if (f.key === 'budgetMin') return (
                <MoneyField key={f.key} label={f.label} amountKey="budgetMin" toKey="budgetMax" currencyKey="budgetCurrency" c={c} setC={setC} errors={errors} currencies={def.currencies} />);
              return <RequirementField key={f.key} f={f} value={c[f.key]} set={set(f.key)} data={c} form={form} error={errors[f.key]} />;
            })}
          </div>) : null}
        <div className="row"><button className="btn primary" type="submit" disabled={busy === 'search'} data-act="search">{busy === 'search' ? 'Searching…' : 'Search the directory'}</button>
          {msg ? <span className="form-err">{msg}</span> : null}</div>
      </form>

      {!result ? (busy ? <Loading pad /> : null) : !result.vendors.length ? (
        <p className="note pad">No directory vendors match this search{result.hidden ? ` (${result.hidden} left out by your filters)` : ''}. Try fewer filters, or add your own vendor.</p>
      ) : (
        <>
          <p className="note pad" style={{ paddingTop: 0, paddingBottom: 6 }}>{result.total} vendor{result.total === 1 ? '' : 's'} found{result.hidden ? `, ${result.hidden} left out by your filters` : ''}. {result.scoreNote}</p>
          <div className="tw"><table data-table="results">
            <thead><tr><th>#</th><th>Vendor</th><th>Fit score</th><th>Service fit and evidence (step 6)</th><th></th></tr></thead>
            <tbody>{result.vendors.map(v => (
              <tr key={v.id} data-vendor={v.name}>
                <td className="mono">{v.rank ?? '–'}</td>
                <td><b>{v.name}</b><div className="note">{names[v.country] || v.country} · delivers from {countryList(v.deliveryCountries, names)}</div>
                  {v.description ? <div className="note vs-desc">{v.description}</div> : null}
                  {v.filter.notStated.length ? <div className="note">Not stated: {v.filter.notStated.join(', ')}</div> : null}</td>
                <td>{v.rank ? <ScoreBar score={v.fit.score} /> : <span className="note">Not ranked</span>}</td>
                <td><EligibilityBadge fit={v.fit} /><FitBadges fit={v.fit} /><div className="note vs-why">{v.rankRationale}</div></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{candidateIds.includes(v.id) ? <span className="b b-sage">Candidate</span>
                  : !v.fit.selectable ? <span className="b b-coral">Excluded</span>
                    : <button className="btn sm" disabled={busy === 'add' + v.id} onClick={() => add(v)} data-act="shortlist">Add to candidates</button>}</td>
              </tr>))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

/* Amount + currency (and an optional "to" amount for the budget range). */
function MoneyField({ label, amountKey, toKey, currencyKey, c, setC, errors, currencies }) {
  const set = k => e => setC(prev => ({ ...prev, [k]: e.target.value }));
  const err = errors[amountKey] || (toKey && errors[toKey]) || errors[currencyKey];
  return (
    <div className={'field rq-field' + (err ? ' has-err' : '')} data-field={amountKey}>
      <label htmlFor={'ds-' + amountKey}>{label} <span className="note">(optional)</span></label>
      <div className="vs-money">
        <input id={'ds-' + amountKey} type="number" min="0" step="0.01" inputMode="decimal" value={c[amountKey] ?? ''} onChange={set(amountKey)} aria-label={toKey ? 'From' : 'Amount'} />
        {toKey ? <input type="number" min="0" step="0.01" inputMode="decimal" value={c[toKey] ?? ''} onChange={set(toKey)} aria-label="To" /> : null}
        <select value={c[currencyKey] || ''} onChange={set(currencyKey)} aria-label="Currency"><option value="">Currency</option>{currencies.map(x => <option key={x}>{x}</option>)}</select>
      </div>
      {err ? <p className="form-err">{err}</p> : null}
    </div>
  );
}
