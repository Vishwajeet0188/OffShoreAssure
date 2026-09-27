import { isOpen, compute, actionState } from '../engine/engines.js';
import { STAGES, PATHCOL, CAT_COL, GROUP, reqName } from '../lib/constants.js';
import { fmtDate, fmtShort, ago } from '../lib/format.js';
import { portfolio, allAudit, evIcon } from '../lib/portfolio.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge, Sev, CountryCode } from '../components/common/Badges.jsx';
import { Ring, Donut } from '../components/common/Charts.jsx';
import { PageHead } from '../components/common/Blocks.jsx';
import FootprintMap from '../components/dashboard/FootprintMap.jsx';
import ScenarioCards from '../components/dashboard/ScenarioCards.jsx';

function Kpi({ cls, icon, title, n, foot, v, tone }) {
  const { act } = useAssessment();
  return (
    <button className={'kpi' + (cls ? ' ' + cls : '')} data-act="go" data-v={v} onClick={() => act.go(v)}>
      <span className="h"><span className={'ic ' + (tone || 'plum')}><Icon n={icon} s={17} /></span>{title}</span>
      <span className={'n ' + (tone || '')}>{n}</span>
      <span className="f"><span>{foot}</span><Icon n="arrow" s={15} /></span>
    </button>
  );
}

export default function Dashboard() {
  const { S, me, act } = useAssessment();
  const P = portfolio(S.list).filter(x => !S.orgf || (x.live && x.a.org === S.orgf)); const live = P.filter(x => x.live);
  const scored = P.filter(x => x.score != null); const avg = scored.length ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length) : 0;
  const noGap = P.filter(x => x.status === 'No open gaps').length, attn = P.filter(x => ['Attention', 'Review required', 'Satisfactory subject to review'].includes(x.status)).length, high = P.filter(x => x.risk === 'High').length, actN = P.filter(x => x.status === 'Action required').length;
  const orgs = [...new Set(S.list.filter(a => a.createdDone).map(a => a.org))];
  const pct = n => Math.round(n / P.length * 100) + '% of total';
  const groups = {}; P.forEach(x => { const g = GROUP(x.service); groups[g] = (groups[g] || 0) + 1; }); const gparts = Object.entries(groups).sort((x, y) => y[1] - x[1]);
  const byC = {}; P.forEach(x => { byC[x.country] = (byC[x.country] || 0) + 1; });
  const ev = allAudit(S.list).slice(0, 5);
  const risks = [];
  live.forEach(x => { const d = compute(x.a); d.findings.filter(f => isOpen(f.status)).forEach(f => { const ac = x.a.actions.find(y => y.ruleId === f.id); risks.push({ id: x.id, sup: x.supplier, issue: reqName(f.req) + ': ' + f.name, sev: f.level, due: ac ? ac.due : null, st: ac ? actionState(x.a, d, ac) : 'Open' }); }); });
  P.filter(x => x.sample && x.issue !== '—').forEach(x => risks.push({ id: x.id, sup: x.supplier, issue: x.issue, sev: x.risk, sample: true, st: x.status === 'Action required' ? 'Open' : 'In progress' }));

  return (
    <>
      <PageHead eyebrow="Overview" title="Dashboard" lead={'Welcome back, ' + me.name.split(' ')[0] + '. Here\'s your outsourcing assurance at a glance. Live assessments sit alongside a labelled sample portfolio.'}
        right={<>
          <span className="chip"><Icon n="clipboard" s={15} />{fmtDate(new Date().toISOString())}</span>
          <label className="vh" htmlFor="orgf">Organisation</label>
          <select id="orgf" className="sm chipsel" data-act="orgf" value={S.orgf || ''} onChange={e => act.setOrgFilter(e.target.value)}>
            <option value="">All organisations</option>{orgs.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <button className="btn primary" data-act="new" onClick={() => act.create()}>+ New assessment</button>
        </>} />
      <div className="kpis">
        <Kpi cls="dark" icon="users" title="Total suppliers" n={P.length} foot={(live.length ? live.length + ' live · ' : '') + (P.length - live.length) + ' sample'} v="suppliers" />
        <Kpi icon="check" title="No open gaps" n={noGap} foot={pct(noGap)} v="assessments" tone="sage" />
        <Kpi icon="alert" title="Attention" n={attn} foot={pct(attn)} v="assessments" tone="amber" />
        <Kpi icon="alert" title="High risk" n={high} foot={pct(high)} v="assessments" tone="coral" />
        <Kpi icon="list" title="Actions required" n={actN} foot="assessments" v="actions" tone="copper" />
        <div className="kpi ringtile" style={{ cursor: 'default' }}><Ring pct={avg} size={88} /><div><b>Assurance score</b><div className="note">Portfolio average (prototype)</div></div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))' }}>
        <div className="card pad stack">
          <h2>Assurance by service category</h2>
          <div className="row" style={{ gap: 18, flexWrap: 'nowrap' }}>
            <div style={{ position: 'relative', flex: 'none' }}>
              <Donut parts={gparts} size={150} />
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}><div><b className="serif" style={{ fontSize: 24 }}>{avg}</b><div className="note">avg score</div></div></div>
            </div>
            <div className="legend">{gparts.map((g, i) => <div key={g[0]}><i style={{ background: CAT_COL[i % 6] }}></i><span>{g[0]}</span><span>{Math.round(g[1] / P.length * 100)}%</span></div>)}</div>
          </div>
        </div>
        <div className="card">
          <div className="ch"><h2>Recent activity</h2>{S.cur ? <button className="link" data-act="auditTab" onClick={act.auditTab}>View all <Icon n="arrow" s={13} /></button> : null}</div>
          <div className="act-list">
            {ev.length ? ev.map((e, i) => { const [t, ic] = evIcon(e); return (
              <div className="it" key={i}><span className={'ic ' + t} style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center' }}><Icon n={ic} s={15} /></span><div><b style={{ fontSize: 13 }}>{e.event}</b><div className="note">{e.aid}</div></div><span className="note">{ago(e.at)}</span></div>); })
              : <div className="empty" style={{ padding: '28px 16px' }}><p className="note">Activity from live assessments appears here as each engine runs.</p></div>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="ch"><h2>Global outsourcing footprint</h2><span className="note">Pin colour = UK transfer status from the rule table</span></div>
        <div className="row top-al" style={{ padding: '10px 18px 16px', gap: 22 }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}><FootprintMap rows={P} /></div>
          <div className="legend" style={{ flex: '0 1 190px', gap: 8 }}>{Object.entries(byC).sort((x, y) => y[1] - x[1]).map(([c, n]) => <div key={c}><CountryCode c={c} /><span>{c}</span><span>{n}</span></div>)}</div>
        </div>
      </div>
      <div className="grid top-al risks-row">
        <div className="card">
          <div className="ch"><h2>Open risks</h2><span className="note">{risks.length} open</span></div>
          <div className="tw"><table><thead><tr><th>ID</th><th>Supplier</th><th>Issue</th><th>Severity</th><th>Due date</th><th>Status</th></tr></thead><tbody>
            {risks.slice(0, 7).map((r, i) => (
              <tr key={i} className={r.sample ? 'sample' : 'click'} data-act={r.sample ? undefined : 'open'} data-id={r.sample ? undefined : r.id} data-v={r.sample ? undefined : 'risk'} onClick={r.sample ? undefined : () => act.open(r.id, 'risk')}>
                <td className="mono">{r.id.slice(-4)}{r.sample ? <div className="note" style={{ fontSize: 10.5 }}>sample</div> : null}</td><td>{r.sup}</td><td style={{ minWidth: 170 }}>{r.issue}</td><td><Sev s={r.sev} /></td><td className="mono" style={{ whiteSpace: 'nowrap' }}>{r.due ? fmtShort(r.due) : '—'}</td><td><Badge s={r.st} /></td>
              </tr>))}
          </tbody></table></div>
        </div>
        <div className="card">
          <div className="ch"><h2>Recent assessments</h2><button className="link" data-act="go" data-v="assessments" onClick={() => act.go('assessments')}>View all <Icon n="arrow" s={13} /></button></div>
          <div className="tw"><table><thead><tr><th>Supplier / service</th><th>Jurisdiction</th><th>Status</th><th className="num">Score</th></tr></thead><tbody>
            {P.slice(0, 7).map(x => (
              <tr key={x.id} className={x.live ? 'click' : 'sample'} data-act={x.live ? 'open' : undefined} data-id={x.live ? x.id : undefined} onClick={x.live ? () => act.open(x.id) : undefined}>
                <td><b>{x.supplier}</b><div className="note">{x.service}{x.sample ? ' · sample record' : ' · ' + x.id}</div></td>
                <td><span className="row" style={{ gap: 7, flexWrap: 'nowrap' }}><CountryCode c={x.country} />{x.country}</span></td>
                <td><Badge s={x.status} /></td><td className="num mono">{x.score != null ? x.score : '—'}</td>
              </tr>))}
          </tbody></table></div>
        </div>
      </div>
      <ScenarioCards />
      <div className="card">
        <div className="row top-al" style={{ padding: '20px 24px', gap: 28 }}>
          <div style={{ flex: '0 1 250px' }}><div className="eyebrow">The assurance path</div><div className="serif" style={{ fontSize: 24, margin: '6px 0' }}>From supplier to certainty.</div><p className="note">Every step feeds the next, from supplier discovery to evidence.</p></div>
          <div style={{ flex: '1 1 400px', minWidth: 0 }}>
            <div className="path" style={{ padding: 0 }}>
              {STAGES.map((s, i) => (
                <button key={s.id} className="pstep ref" data-act="go" data-v={s.id} onClick={() => act.go(s.id)}>
                  <span className="c" style={{ background: PATHCOL[i], borderColor: PATHCOL[i], color: '#FAF6F0' }}><Icon n={s.icon} s={19} /></span><span className="l">{s.label}</span>
                </button>))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
