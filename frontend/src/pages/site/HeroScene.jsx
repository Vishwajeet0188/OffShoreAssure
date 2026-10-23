import { useEffect, useState } from 'react';
import { STAGES } from '../../lib/stages.js';

/* Home hero illustration (original SVG, no external images), specific to OffshoreAssure:
   - inside: a globe with the UK buyer linked to offshore delivery locations (flowing links, travelling dots);
   - around it: the "assessment ring" — the nine stages light up in order while a progress line travels round,
     and the current stage is named underneath. Decorative (aria-hidden); still when the visitor prefers reduced motion. */
const C = [300, 250];          // centre
const R_GLOBE = 138, R_RING = 196;
const UK = [262, 196];
const SITES = [
  { id: 'pl', label: 'Poland', at: [322, 182], c: [292, 160] },
  { id: 'in', label: 'India', at: [372, 262], c: [336, 196], left: true },
  { id: 'ph', label: 'Philippines', at: [398, 302], c: [372, 196] },
  { id: 'br', label: 'Brazil', at: [252, 330], c: [226, 266] }
];
const STEP_MS = 2200;
const arc = (a, c, b) => `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}`;
const node = i => { const t = -Math.PI / 2 + (i * 2 * Math.PI) / 9; return [C[0] + R_RING * Math.cos(t), C[1] + R_RING * Math.sin(t)]; };
const RING_LEN = 2 * Math.PI * R_RING;

export default function HeroScene() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStep(8); return undefined; }
    const t = setInterval(() => setStep(s => (s + 1) % 9), STEP_MS);
    return () => clearInterval(t);
  }, []);
  const done = step / 9;            // progress line ends exactly on the current stage
  return (
    <div className="hs2" aria-hidden="true">
      <svg className="hs2-svg" viewBox="0 0 600 520" role="presentation">
        <defs>
          <radialGradient id="hs2-glow" cx="50%" cy="48%" r="52%"><stop offset="0%" stopColor="#F2DDD5" /><stop offset="100%" stopColor="#F2DDD5" stopOpacity="0" /></radialGradient>
          <linearGradient id="hs2-globe" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="100%" stopColor="#EFE7F3" /></linearGradient>
          <linearGradient id="hs2-arc" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#D66A4A" /><stop offset="100%" stopColor="#6E4A8E" /></linearGradient>
          <clipPath id="hs2-clip"><circle cx={C[0]} cy={C[1]} r={R_GLOBE} /></clipPath>
        </defs>
        <circle cx={C[0]} cy={C[1]} r="250" fill="url(#hs2-glow)" />

        {/* assessment ring: track, progress, nine stage nodes */}
        <circle cx={C[0]} cy={C[1]} r={R_RING} fill="none" stroke="#E6DDE9" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
        <circle cx={C[0]} cy={C[1]} r={R_RING} fill="none" stroke="url(#hs2-arc)" strokeWidth="3.5" strokeLinecap="round"
          className="hs2-progress" strokeDasharray={RING_LEN} strokeDashoffset={RING_LEN * (1 - done)} transform={`rotate(-90 ${C[0]} ${C[1]})`} />
        {STAGES.map((s, i) => {
          const [x, y] = node(i); const on = i <= step, cur = i === step;
          return (
            <g key={s.n} className={'hs2-node' + (on ? ' on' : '') + (cur ? ' cur' : '')}>
              {cur ? <circle cx={x} cy={y} r="22" className="hs2-halo" /> : null}
              <circle cx={x} cy={y} r="15" className="hs2-dot" />
              <text x={x} y={y + 4.5} textAnchor="middle" className="hs2-num">{s.n}</text>
            </g>);
        })}

        {/* globe */}
        <circle cx={C[0]} cy={C[1]} r={R_GLOBE} fill="url(#hs2-globe)" stroke="#E2D8EA" strokeWidth="1.5" />
        <g clipPath="url(#hs2-clip)" stroke="#E2D8EA" strokeWidth="1" fill="none">
          {[-96, -54, -18, 18, 54, 96].map(y => <ellipse key={y} cx={C[0]} cy={C[1] + y} rx={Math.sqrt(R_GLOBE * R_GLOBE - y * y)} ry="8" />)}
          <g className="hs2-spin">{[26, 58, 92, 122].map(rx => <ellipse key={rx} cx={C[0]} cy={C[1]} rx={rx} ry={R_GLOBE} />)}</g>
        </g>
        {SITES.map((s, i) => (
          <g key={s.id}>
            <path d={arc(UK, s.c, s.at)} fill="none" stroke="#EADBE0" strokeWidth="5" strokeLinecap="round" />
            <path className="hs2-flow" style={{ animationDelay: `${i * -0.5}s` }} d={arc(UK, s.c, s.at)} fill="none" stroke="url(#hs2-arc)" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 8" />
            <circle r="3.5" fill="#D66A4A" className="hs2-trav"><animateMotion dur={`${3 + i * 0.45}s`} repeatCount="indefinite" path={arc(UK, s.c, s.at)} /></circle>
            <circle cx={s.at[0]} cy={s.at[1]} r="5.5" fill="#6E4A8E" stroke="#fff" strokeWidth="2" />
            <text x={s.left ? s.at[0] - 10 : s.at[0] + 9} y={s.at[1] + (s.left ? 4 : 17)} textAnchor={s.left ? 'end' : 'start'} className="hs2-label">{s.label}</text>
          </g>
        ))}
        <circle cx={UK[0]} cy={UK[1]} r="16" className="hs2-ping" />
        <circle cx={UK[0]} cy={UK[1]} r="9" fill="#D66A4A" stroke="#fff" strokeWidth="3" />
        <text x={UK[0] - 13} y={UK[1] - 14} textAnchor="end" className="hs2-uk">UK</text>
      </svg>

      {/* current stage, named under the ring */}
      <div className="hs2-caption">
        <span className="hs2-cap-n">Stage {STAGES[step].n} of 9</span>
        <span key={step} className="hs2-cap-t">{STAGES[step].title}</span>
      </div>
    </div>
  );
}
