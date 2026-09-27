import { portfolio } from '../lib/portfolio.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Badge, Sev, CountryCode } from '../components/common/Badges.jsx';
import { PageHead } from '../components/common/Blocks.jsx';
import ScenarioCards from '../components/dashboard/ScenarioCards.jsx';

export default function Assessments() {
  const { S, act } = useAssessment();
  const P = portfolio(S.list);
  return (
    <>
      <PageHead eyebrow="Assessments" title="Assessments" lead="Live assessments you can open, alongside the labelled sample portfolio."
        right={<button className="btn primary" data-act="new" onClick={() => act.create()}>+ New assessment</button>} />
      <div className="card"><div className="tw"><table>
        <thead><tr><th>Assessment</th><th>Supplier</th><th>Service</th><th>Jurisdiction</th><th>Risk</th><th>Status</th><th className="num">Assurance score</th></tr></thead>
        <tbody>
          {P.map(x => (
            <tr key={x.id} className={x.live ? 'click' : 'sample'} data-act={x.live ? 'open' : undefined} data-id={x.live ? x.id : undefined} onClick={x.live ? () => act.open(x.id) : undefined}>
              <td className="mono">{x.id} {x.live ? <span className="b b-plum" style={{ padding: '0 7px' }}>live</span> : <span className="proto">sample</span>}</td>
              <td><b>{x.supplier}</b></td><td>{x.service}</td>
              <td><span className="row" style={{ gap: 7, flexWrap: 'nowrap' }}><CountryCode c={x.country} />{x.country}</span></td>
              <td>{x.risk === '—' ? <span className="muted">—</span> : <Sev s={x.risk} />}</td>
              <td><Badge s={x.status} /></td><td className="num mono">{x.score != null ? x.score : '—'}</td>
            </tr>))}
        </tbody>
      </table></div></div>
      {!S.list.length ? <ScenarioCards /> : null}
    </>
  );
}
