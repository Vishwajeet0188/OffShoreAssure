import { VENDORS, JURISDICTIONS, SEED_ASSESSMENTS } from '../data/prototype-data.js';
import { initials } from '../lib/constants.js';
import { portfolio } from '../lib/portfolio.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Badge, MuteBadge, CountryCode } from '../components/common/Badges.jsx';
import { PageHead, Tabs, useTab } from '../components/common/Blocks.jsx';

export default function Suppliers() {
  const { S, act } = useAssessment();
  const P = portfolio(S.list); const sel = S.sel.supplier || 'globalassist';
  const list = [['all', 'All', Object.keys(VENDORS).length + SEED_ASSESSMENTS.length], ['uc', 'Use-case suppliers', 2], ['sample', 'Sample portfolio', SEED_ASSESSMENTS.length]];
  const cur = useTab('sup', list);
  const v = VENDORS[sel]; const j = JURISDICTIONS[v.country];
  const country = c => <span className="row" style={{ gap: 7, flexWrap: 'nowrap' }}><CountryCode c={c} />{c}</span>;
  return (
    <>
      <PageHead eyebrow="Supplier discovery" title="Suppliers" lead="Candidate and existing suppliers. The two use-case suppliers carry full profiles, questionnaires and contracts. The rest are labelled sample records."
        right={<button className="btn primary" data-act="new" onClick={() => act.create()}>+ New assessment</button>} />
      <div className="grid g-side top-al">
        <div className="card">
          <div style={{ padding: '4px 18px 0' }}><Tabs k="sup" list={list} cur={cur} /></div>
          <div className="tw"><table><thead><tr><th>Supplier</th><th>Country</th><th>Service</th><th>Status</th></tr></thead><tbody>
            {cur !== 'sample' && Object.values(VENDORS).map(x => { const live = P.find(p => p.live && p.supplier === x.name); return (
              <tr key={x.id} className={'click' + (sel === x.id ? ' sel' : '')} data-act="selSup" data-id={x.id} onClick={() => act.selectSupplier(x.id)}>
                <td><span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><span className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{initials(x.name)}</span><b>{x.name}</b></span></td>
                <td>{country(x.country)}</td><td>{x.service}</td><td>{live ? <Badge s={live.status} /> : <MuteBadge>Not assessed</MuteBadge>}</td>
              </tr>); })}
            {cur !== 'uc' && P.filter(x => x.sample).map(x => (
              <tr key={x.id} className="sample">
                <td><span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><span className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: 'var(--card-2)', color: 'var(--muted)' }}>{initials(x.supplier)}</span>{x.supplier} <span className="proto">sample</span></span></td>
                <td>{country(x.country)}</td><td>{x.service}</td><td><Badge s={x.status} /></td>
              </tr>))}
          </tbody></table></div>
        </div>
        <div className="card pad stack">
          <div className="row" style={{ gap: 12 }}><span className="avatar" style={{ width: 46, height: 46 }}>{initials(v.name)}</span><div><div className="eyebrow">Supplier profile</div><h2 className="serif" style={{ fontSize: 20 }}>{v.name}</h2></div></div>
          <dl className="kv">
            <dt>Location</dt><dd>{v.location + ', ' + v.country}</dd><dt>Service</dt><dd>{v.service}</dd><dt>Staff involved</dt><dd>{v.staff}</dd>
            <dt>Transfer rule table</dt><dd><Badge s={j.status === 'adequate' ? 'Adequate' : 'Restricted transfer'} label={j.status === 'adequate' ? 'UK adequacy' : 'Restricted transfer'} /><div className="note" style={{ marginTop: 4 }}>{j.basis}</div></dd>
            <dt>Prepared documents</dt><dd>{v.docs.map(n => <div className="mono" key={n}>{n}</div>)}</dd>
            <dt>Contract</dt><dd className="mono">{v.contract}</dd>
          </dl>
          <div className="row"><button className="btn primary" data-act="new" data-preset={sel === 'globalassist' ? 'uc1' : 'uc2'} onClick={() => act.create(sel === 'globalassist' ? 'uc1' : 'uc2')}>Start assessment with this supplier</button></div>
          <p className="note">Ranking candidate suppliers against thresholds appears in the architecture journey. PROPOSED IMPLEMENTATION: not built in this prototype.</p>
        </div>
      </div>
    </>
  );
}
