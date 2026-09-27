import { snapshot } from '../../engine/engines.js';
import { reqName } from '../../lib/constants.js';
import { fmtTime } from '../../lib/format.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Icon } from '../common/Icon.jsx';
import { Badge } from '../common/Badges.jsx';

function Column({ s, title }) {
  return (
    <div className="card pad stack" style={{ boxShadow: 'none' }}>
      <div className="eyebrow">{title}</div>
      <div style={{ font: '600 18px/1.25 var(--f-serif)' }}>{s.overall}</div>
      <div className="row" style={{ gap: 18 }}>
        <span className="stat"><span className="note">Assurance score</span><b>{s.score}</b></span>
        <span className="stat"><span className="note">Engine A</span><b>{s.vendor}</b></span>
        <span className="stat"><span className="note">Compliance issues</span><b>{s.material != null ? s.material : s.open}</b></span>
      </div>
    </div>
  );
}

/* Before/after comparison against the baseline captured when actions were generated. */
export default function Reassessment() {
  const { a, D } = useAssessment();
  const b = a.baseline; const now = snapshot(a, D, 'Now');
  const changed = Object.keys(now.reqStatus).filter(k => b.reqStatus[k] !== now.reqStatus[k]);
  return (
    <div className="card pad stack">
      <div className="spread"><h2>Reassessment</h2><span className="note">Baseline captured when actions were generated, {fmtTime(b.at)}</span></div>
      <div className="ba"><Column s={b} title="Before evidence" /><span className="muted" style={{ textAlign: 'center' }}><Icon n="arrow" s={22} /></span><Column s={now} title="After evidence" /></div>
      {changed.length ? <div className="tw"><table><tbody>
        {changed.map(k => <tr key={k}><td>{reqName(k)}</td><td><Badge s={b.reqStatus[k]} label={b.reqStatus[k].toUpperCase()} /></td><td className="muted">→</td><td><Badge s={now.reqStatus[k]} label={now.reqStatus[k].toUpperCase()} /></td></tr>)}
      </tbody></table></div> : <p className="note">No requirement status has changed yet. Upload or verify evidence to trigger reassessment.</p>}
    </div>
  );
}
