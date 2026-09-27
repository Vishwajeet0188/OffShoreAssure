/* Brand marks and the decorative wave pattern in the sidebar. */
export function Logo({ dark = false, w = 40, h = 30 }) {
  const ink = dark ? '#271A38' : '#F5F2EB';
  return (
    <svg width={w} height={h} viewBox="0 0 40 30" aria-hidden="true">
      <path d="M15 3.5a11.5 11.5 0 1 0 8.6 19.2" fill="none" stroke="#B95F50" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 26L28 4l10 22" fill="none" stroke={ink} strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M22.5 18h11" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const WAVE_PATHS = (() => {
  const out = [];
  for (let k = 0; k < 16; k++) {
    let d = '';
    for (let x = 0; x <= 260; x += 10) { const yv = 150 - k * 5 + Math.sin(x / 42 + k * 0.22) * (22 + k * 1.6) - x * 0.28; d += (x ? 'L' : 'M') + x + ' ' + yv.toFixed(1); }
    out.push({ d, o: (0.15 + k * 0.035).toFixed(2) });
  }
  return out;
})();
export function Waves() {
  return (
    <svg className="waves" viewBox="0 0 250 230" preserveAspectRatio="none" aria-hidden="true">
      {WAVE_PATHS.map((p, i) => <path key={i} d={p.d} fill="none" stroke="#B95F50" strokeWidth=".8" opacity={p.o} />)}
    </svg>
  );
}
