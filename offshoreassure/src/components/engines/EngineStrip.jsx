import { VENDORS } from '../../data/prototype-data.js';
import { isOpen, isPass, isSoft } from '../../engine/engines.js';
import { ENGINE, engineOf } from '../../lib/constants.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Icon } from '../common/Icon.jsx';
import { Badge } from '../common/Badges.jsx';

function Tile({ L, main, st, stLabel, v }) {
  const { act } = useAssessment();
  return (
    <button className="kpi" data-act="go" data-v={v} style={{ gap: 8 }} onClick={() => act.go(v)}>
      <span className="h"><span className="eletter" style={{ width: 26, height: 26, fontSize: 13 }}>{L}</span>{ENGINE[L]}</span>
      <span className="n" style={{ fontSize: 28 }}>{main}</span>
      <span className="f"><span><Badge s={st} label={stLabel} /></span><Icon n="arrow" s={15} /></span>
    </button>
  );
}

/* The four operational engines side by side (A Compliance, B Contract, C Data Transfer, D Delivery Assurance). */
export default function EngineStrip() {
  const { a, D } = useAssessment();
  const vs = D.vendorScore, an = D.analysis, del = D.delivery;
  const bOpen = D.findings.filter(f => engineOf(f) === 'B' && isOpen(f.status)).length;
  const x2 = D.checks.find(c => c.id === 'XFER-002');
  const cSt = D.juris.status === 'adequate' ? 'Adequacy identified' : x2 ? x2.status : '—';
  return (
    <div className="grid g4">
      <Tile L="A" main={<>{vs.overall}<small className="note"> /100</small></>} st={vs.flag} stLabel={'Access: ' + vs.flag} v="compliance" />
      <Tile L="B" main={<>{an.obligations.length}<small className="note"> obligations</small></>} st={bOpen ? 'Review required' : 'Satisfied'} stLabel={bOpen ? bOpen + ' open contract issues' : 'No open contract issue'} v="mapping" />
      <Tile L="C" main={VENDORS[a.vendorId].country} st={cSt} stLabel={D.juris.status === 'adequate' ? 'Adequacy path' : isPass(cSt) ? 'Safeguard verified' : isSoft(cSt) ? 'Subject to review' : 'Gate: review required'} v="transfer" />
      <Tile L="D" main={<>{del && del.score != null ? del.score : '—'}<small className="note"> /100</small></>} st={del ? del.label : '—'} stLabel={del ? del.label + ' · sample feed' : 'Not run'} v="delivery" />
    </div>
  );
}
