/* Map-style outsourcing footprint: dotted land from rough continent outlines (lon/lat), pins and UK arcs.
   Drawn, not geographic data. Pin colour = UK transfer status from the rule table. */
import { JURISDICTIONS } from '../../data/prototype-data.js';

const LAND = [
  [[-168, 65], [-140, 70], [-95, 72], [-80, 65], [-60, 55], [-55, 48], [-70, 43], [-76, 35], [-81, 25], [-97, 26], [-97, 18], [-88, 15], [-83, 9], [-78, 8], [-92, 15], [-105, 20], [-112, 30], [-118, 34], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 60]],
  [[-50, 60], [-40, 65], [-20, 70], [-20, 80], [-60, 82], [-70, 76], [-55, 68]],
  [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-48, -28], [-58, -38], [-65, -55], [-72, -50], [-73, -40], [-71, -18], [-80, -5], [-80, 2]],
  [[-10, 36], [-9, 43], [-2, 44], [-4, 48], [0, 50], [5, 53], [8, 57], [5, 62], [15, 69], [28, 71], [40, 67], [45, 60], [40, 45], [30, 41], [26, 38], [22, 37], [20, 40], [15, 38], [12, 44], [8, 44], [3, 42], [0, 38]],
  [[-5.5, 50], [1.5, 51], [1, 53], [-2, 56], [-3, 58.5], [-6, 58], [-5, 55], [-3, 54], [-5, 52]], [[-10, 51.5], [-6, 52], [-6, 55], [-8, 55]],
  [[-17, 21], [-10, 30], [-5, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [42, -2], [40, -15], [35, -24], [27, -34], [19, -34], [12, -18], [9, -2], [9, 4], [-8, 4], [-17, 14]],
  [[36, 32], [40, 30], [35, 28], [43, 12], [52, 16], [59, 22], [56, 26], [50, 30]],
  [[28, 41], [40, 42], [48, 30], [56, 25], [67, 24], [72, 20], [77, 8], [80, 15], [88, 22], [92, 21], [98, 16], [100, 6], [104, 1], [106, 10], [109, 12], [108, 21], [121, 30], [122, 40], [130, 43], [141, 52], [160, 60], [180, 66], [180, 72], [140, 73], [110, 77], [80, 73], [60, 70], [45, 68], [40, 60], [45, 45], [40, 42]],
  [[130, 31], [141, 36], [142, 43], [140, 41], [135, 34]], [[120, 6], [126, 7], [125, 13], [122, 18], [120, 15]], [[109, 1], [118, 7], [119, 0], [115, -4], [110, -3]], [[95, 5], [106, -6], [103, -5], [97, 1]],
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -25], [150, -37], [141, -38], [131, -31], [115, -34]]
];
const GEO = { 'United Kingdom': [-1.5, 52.5], Poland: [19, 52], India: [77.6, 13], Philippines: [121, 14.5], 'South Africa': [25, -29], Ireland: [-8, 53], Netherlands: [5, 52], Vietnam: [106, 16], Ukraine: [31, 49], Malaysia: [102, 4], 'United States': [-98, 39] };
function inPoly(x, y, p) { let o = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) o = !o; } return o; }

const W = 720, H = 330, px = lon => (lon + 170) / 360 * W, py = lat => (80 - lat) / 140 * H;
let DOTS = null;
function mapDots() {
  if (!DOTS) { DOTS = []; for (let lat = 78; lat > -58; lat -= 3.2) for (let lon = -168; lon < 180; lon += 3.2) if (LAND.some(p => inPoly(lon, lat, p))) DOTS.push([px(lon).toFixed(1), py(lat).toFixed(1)]); }
  return DOTS;
}
const PIN = 'M0 0c-5-7-8-10-8-14a8 8 0 0 1 16 0c0 4-3 7-8 14z';

export default function FootprintMap({ rows }) {
  const countries = {}; rows.forEach(r => { countries[r.country] = (countries[r.country] || 0) + 1; });
  const uk = GEO['United Kingdom']; const placed = [[px(uk[0]), py(uk[1])]];
  const marks = Object.keys(countries).sort((x, y) => (GEO[x] ? GEO[x][1] : 0) - (GEO[y] ? GEO[y][1] : 0)).filter(c => GEO[c]).map(c => {
    const g = GEO[c]; const j = JURISDICTIONS[c] || {}; const col = j.status === 'adequate' ? 'var(--sage-fill)' : j.status === 'partial' ? 'var(--amber-fill)' : 'var(--coral-fill)';
    const x1 = px(uk[0]), y1 = py(uk[1]), x2 = px(g[0]), y2 = py(g[1]); const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.18 - 12;
    const showLabel = !placed.some(([qx, qy]) => Math.abs(qx - x2) < 70 && Math.abs(qy - y2) < 18); placed.push([x2, y2]);
    return { c, col, x2, y2, arc: 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1), showLabel };
  });
  return (
    <div className="map">
      <svg viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Outsourcing footprint map">
        <g fill="var(--line)">{mapDots().map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="2.1" />)}</g>
        {marks.map(m => <path key={'a' + m.c} d={m.arc} fill="none" stroke="var(--copper)" strokeWidth="1.2" strokeDasharray="3 3" opacity=".7" />)}
        {marks.map(m => (
          <g key={'p' + m.c} transform={'translate(' + m.x2.toFixed(1) + ' ' + m.y2.toFixed(1) + ')'}>
            <path d={PIN} fill={m.col} stroke="var(--card)" strokeWidth="1.5" /><circle cy="-14" r="2.8" fill="var(--card)" />
            {m.showLabel ? <text x="10" y="-12" fill="var(--ink)" style={{ font: '600 11px var(--f-sans)' }}>{m.c}</text> : null}
          </g>
        ))}
        <g transform={'translate(' + px(uk[0]).toFixed(1) + ' ' + py(uk[1]).toFixed(1) + ')'}>
          <path d={PIN} fill="var(--ink)" stroke="var(--card)" strokeWidth="1.5" /><circle cy="-14" r="2.8" fill="var(--copper)" />
          <text x="-10" y="-24" textAnchor="end" fill="var(--ink)" style={{ font: '700 11px var(--f-sans)' }}>UK (buyer)</text>
        </g>
      </svg>
    </div>
  );
}
