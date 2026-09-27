import { DELIVERY_WEEKS } from '../../data/prototype-data.js';

/* Weekly metric values against the contract target (dashed copper line). Breaches are coral dots. */
export default function Sparkline({ m }) {
  const W = 240, H = 58, vals = m.series; const nums = vals.filter(v => v != null).concat([m.target]);
  let lo = Math.min(...nums), hi = Math.max(...nums); const pad = (hi - lo) * 0.2 || 1; lo -= pad; hi += pad;
  const x = i => 6 + i * (W - 12) / Math.max(1, DELIVERY_WEEKS.length - 1), y = v => H - 6 - (v - lo) / (hi - lo) * (H - 12);
  let pts = ''; vals.forEach((v, i) => { if (v != null) pts += (pts ? ' ' : '') + x(i).toFixed(1) + ',' + y(v).toFixed(1); });
  const ty = y(m.target).toFixed(1);
  return (
    <svg className="spark" width="100%" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ maxWidth: '100%', height: H + 'px' }} role="img" aria-label="Weekly values against target">
      <line x1="0" x2={W} y1={ty} y2={ty} stroke="var(--copper)" strokeDasharray="4 3" strokeWidth="1.2" />
      {m.key === 'incident-notify' ? null : <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="1.6" />}
      {vals.map((v, i) => v == null ? null : <circle key={i} cx={x(i).toFixed(1)} cy={y(v).toFixed(1)} r={i === vals.length - 1 ? 3.6 : 2.3} fill={(m.dir === 'min' ? v < m.target : v > m.target) ? 'var(--coral-fill)' : 'var(--ink)'} />)}
    </svg>
  );
}
