/* Score ring and category donut (SVG, same geometry as the plain-JS prototype). */
import { CAT_COL } from '../../lib/constants.js';

export function Ring({ pct, size, label }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r, col = pct >= 80 ? 'var(--sage-fill)' : pct >= 65 ? 'var(--amber-fill)' : 'var(--coral-fill)';
  const h = size / 2;
  return (
    <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} role="img" aria-label={pct + ' out of 100'} style={{ flex: 'none' }}>
      <circle cx={h} cy={h} r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx={h} cy={h} r={r} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={(c * pct / 100).toFixed(1) + ' ' + c.toFixed(1)} transform={'rotate(-90 ' + h + ' ' + h + ')'} />
      <text x="50%" y={label ? '47%' : '53%'} textAnchor="middle" dominantBaseline="middle" fill="var(--ink)" style={{ font: '600 ' + Math.round(size / 4.2) + 'px var(--f-serif)' }}>{pct}</text>
      {label ? <text x="50%" y="67%" textAnchor="middle" fill="var(--muted)" style={{ font: '500 11px var(--f-sans)' }}>{label}</text> : null}
    </svg>
  );
}

export function Donut({ parts, size }) {
  const tot = parts.reduce((s, p) => s + p[1], 0); const r = size / 2 - 14, c = 2 * Math.PI * r; let off = 0; const h = size / 2;
  return (
    <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} aria-hidden="true">
      {parts.map((p, i) => {
        const len = c * p[1] / tot; const o = off; off += len;
        return <circle key={i} cx={h} cy={h} r={r} fill="none" stroke={CAT_COL[i % 6]} strokeWidth="22" strokeDasharray={Math.max(0, len - 2).toFixed(1) + ' ' + c.toFixed(1)} strokeDashoffset={(-o).toFixed(1)} transform={'rotate(-90 ' + h + ' ' + h + ')'} />;
      })}
    </svg>
  );
}
