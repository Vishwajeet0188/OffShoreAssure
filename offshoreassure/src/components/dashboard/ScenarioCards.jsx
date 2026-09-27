import { VENDORS, SCENARIOS } from '../../data/prototype-data.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { CountryCode } from '../common/Badges.jsx';

const CARDS = [
  ['uc1', 'globalassist', 'Customer support with access to customer accounts. Restricted transfer, subcontractors, 24-hour incident clause, contact-centre service levels.'],
  ['uc2', 'nordtech', 'Managed IT support with privileged access. Named sub-processor (CloudOps Polska), UK adequacy destination, 99.9% availability target.']
];

/* The two demonstration scenarios (Use Case 1 and Use Case 2). */
export default function ScenarioCards() {
  const { act } = useAssessment();
  return (
    <div className="card">
      <div className="ch"><div><h2>Demonstration scenarios</h2><div className="sub">Each preset loads a supplied use case. You still trigger every stage, and each stage reads the stored output of the one before.</div></div></div>
      <div className="grid g2 pad">
        {CARDS.map(([k, vid, txt]) => { const v = VENDORS[vid]; return (
          <div className="req" key={k}>
            <div className="spread"><span className="code">{SCENARIOS[k].label}</span><CountryCode c={v.country} /></div>
            <h3 className="serif" style={{ fontSize: 19 }}>{v.name}</h3>
            <p className="why">{v.location + ', ' + v.country} · {txt}</p>
            <div><button className={'btn sm ' + (k === 'uc1' ? 'primary' : 'dark')} data-act="new" data-preset={k} onClick={() => act.create(k)}>Start this assessment</button></div>
          </div>); })}
      </div>
    </div>
  );
}
