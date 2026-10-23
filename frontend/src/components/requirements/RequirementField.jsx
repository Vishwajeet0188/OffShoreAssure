import CountryPicker from './CountryPicker.jsx';

/* One requirement field, rendered from the API's field definition. */
export default function RequirementField({ f, value, set, data, error, required, form }) {
  const id = 'rq-' + f.key;
  const desc = [f.help ? id + '-h' : null, error ? id + '-e' : null].filter(Boolean).join(' ') || undefined;
  const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': desc };
  const toggle = (opt) => { const cur = value || []; set(cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]); };
  let input;
  switch (f.type) {
    case 'textarea':
      input = <><textarea {...common} maxLength={f.max} value={value || ''} onChange={e => set(e.target.value)} placeholder={f.example ? 'e.g. ' + f.example : ''} />
        <span className="note rq-count">{(value || '').length} / {f.max}</span></>; break;
    case 'select': case 'currency': {
      const opts = f.type === 'currency' ? form.currencies : f.options;
      input = <select {...common} value={value || ''} onChange={e => set(e.target.value)}><option value="">Choose…</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select>; break;
    }
    case 'tri':
      input = <div className="seg rq-seg" role="radiogroup" aria-labelledby={id + '-l'} aria-describedby={desc}>
        {['Yes', 'No', 'Unknown'].map(o => <button type="button" role="radio" aria-checked={value === o} key={o} className={value === o ? 'on' : ''} onClick={() => set(value === o ? '' : o)} data-v={o}>{o}</button>)}
      </div>; break;
    case 'multiselect':
      input = <>
        <div className="rq-checks" role="group" aria-labelledby={id + '-l'} aria-describedby={desc} id={id}>
          {f.options.map(o => <label key={o} className={'rq-check' + ((value || []).includes(o) ? ' on' : '')}><input type="checkbox" checked={(value || []).includes(o)} onChange={() => toggle(o)} />{o}</label>)}
        </div>
        {f.withOther && (value || []).includes('Other') ? (
          <input type="text" className="rq-other" aria-label="Other systems" placeholder="Name the other systems" maxLength={300}
            value={data.systemsAccessedOther || ''} onChange={e => set(e.target.value, 'systemsAccessedOther')} />) : null}
      </>; break;
    case 'country':
      input = <CountryPicker id={id} value={value} onChange={set} countries={form.countries} invalid={!!error} />; break;
    case 'countries':
      input = <CountryPicker id={id} multi value={value} onChange={set} countries={form.countries} allowUnknown={f.allowUnknown} unknown={form.unknown} invalid={!!error} />; break;
    case 'date':
      input = <input {...common} type="date" value={value || ''} onChange={e => set(e.target.value)} />; break;
    case 'int': case 'decimal':
      input = <input {...common} type="number" inputMode={f.type === 'int' ? 'numeric' : 'decimal'} step={f.type === 'int' ? 1 : 0.01} min={f.minValue} max={f.maxValue}
        value={value ?? ''} onChange={e => set(e.target.value === '' ? '' : e.target.value)} placeholder={f.example ? 'e.g. ' + f.example : ''} />; break;
    case 'email':
      input = <input {...common} type="email" value={value || ''} onChange={e => set(e.target.value)} />; break;
    default:
      input = <input {...common} type="text" maxLength={f.max} value={value || ''} onChange={e => set(e.target.value)} placeholder={f.example ? 'e.g. ' + f.example : ''} />;
  }
  const wide = ['textarea', 'multiselect', 'countries'].includes(f.type);
  return (
    <div className={'field rq-field' + (wide ? ' full' : '') + (error ? ' has-err' : '')} data-field={f.key}>
      <label id={id + '-l'} htmlFor={['tri', 'multiselect'].includes(f.type) ? undefined : id}>
        {f.label}{required ? <span className="rq-req" aria-label="required"> *</span> : <span className="note"> (optional)</span>}
      </label>
      {input}
      {f.help ? <span className="note" id={id + '-h'}>{f.help}</span> : null}
      {error ? <p className="form-err" id={id + '-e'}>{error}</p> : null}
    </div>
  );
}
