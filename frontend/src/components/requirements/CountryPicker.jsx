import { useId, useMemo, useRef, useState } from 'react';

/* Searchable country picker. multi=false → one ISO code; multi=true → array of codes (optionally with "Unknown"). */
export default function CountryPicker({ id, value, onChange, countries, multi = false, allowUnknown = false, unknown = 'UNKNOWN', invalid }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const inputRef = useRef(null);
  const name = useMemo(() => Object.fromEntries(countries.map(c => [c.code, c.name]).concat([[unknown, 'Unknown']])), [countries, unknown]);
  const selected = multi ? (value || []) : (value ? [value] : []);
  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = (allowUnknown ? [{ code: unknown, name: 'Unknown (to be clarified)' }] : []).concat(countries);
    const rank = c => { const n = c.name.toLowerCase(); return n === t || c.code.toLowerCase() === t ? 0 : n.startsWith(t) ? 1 : n.split(/[\s(]+/).some(w => w.startsWith(t)) ? 2 : 3; };
    return all.filter(c => !(multi && selected.includes(c.code)) && (!t || c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t))
      .map((c, i) => [t ? rank(c) : 0, i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]).slice(0, 60);
  }, [q, countries, allowUnknown, unknown, multi, selected]);

  const pick = code => {
    if (multi) onChange([...selected, code]); else onChange(code);
    setQ(''); setHi(0); setOpen(false);   // close after each pick so the list never covers the buttons below; typing reopens it
    inputRef.current?.focus();
  };
  const remove = code => onChange(selected.filter(c => c !== code));
  const key = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && options[hi]) { e.preventDefault(); pick(options[hi].code); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !q && multi && selected.length) remove(selected[selected.length - 1]);
  };
  return (
    <div className={'cpick' + (invalid ? ' bad' : '')} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <div className="cpick-box" onClick={() => inputRef.current?.focus()}>
        {multi ? selected.map(c => (
          <span key={c} className={'cchip' + (c === unknown ? ' unk' : '')}>{name[c] || c}
            <button type="button" aria-label={'Remove ' + (name[c] || c)} onClick={e => { e.stopPropagation(); remove(c); }}>×</button></span>
        )) : null}
        <input ref={inputRef} id={id} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
          placeholder={multi ? (selected.length ? 'Add another…' : 'Type to search countries') : (value ? '' : 'Type to search')}
          value={!multi && !open && value ? name[value] || value : q}
          onFocus={() => { setOpen(true); if (!multi && value) setQ(''); }}
          onClick={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }} onKeyDown={key} />
      </div>
      {open ? (
        <ul className="cpick-list" id={listId} role="listbox">
          {options.length ? options.map((c, i) => (
            <li key={c.code} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} tabIndex={-1}
              onMouseDown={e => e.preventDefault()} onClick={() => pick(c.code)} onMouseEnter={() => setHi(i)}>
              {c.name}{c.code !== unknown ? <span className="mono note">{c.code}</span> : null}
            </li>)) : <li className="note" aria-disabled="true">No matching country</li>}
        </ul>
      ) : null}
    </div>
  );
}
