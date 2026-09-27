import { DELIVERY_WEEKS, DELIVERY_FEED } from '../data/prototype-data.js';
import { extractTargets } from '../engine/engines.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Badge, Sev, Rid, Cid } from '../components/common/Badges.jsx';
import { PageHead, EngineCard, Trace, NextButton, GoButton } from '../components/common/Blocks.jsx';
import Sparkline from '../components/engines/Sparkline.jsx';

/* Step 8 · Engine D: Delivery assurance over a clearly labelled SAMPLE feed. */
export default function DeliveryAssurance() {
  const { a, D, act } = useAssessment();
  const an = D.analysis; const del = D.delivery; const targets = extractTargets(an); const feed = DELIVERY_FEED[a.vendorId];
  const head = <>
    <PageHead eyebrow="Step 8 · Engine D" title="Delivery assurance" lead="Service-level targets come from the Contract engine. Delivery performance comes from a sample feed. The engine scores a rolling four-week window and raises alerts that name the metric that moved." />
    <div className="outcome plum" style={{ padding: '12px 18px' }}><div><div className="eyebrow" style={{ color: 'var(--plum)' }}>Sample / prototype delivery feed</div><p>{feed ? feed.source : 'No sample feed'}. Demonstration data only. It is not real supplier delivery evidence.</p></div></div>
    {del ? <EngineCard L="D" sub="Evidence-based offshore delivery assurance"
      inputs={[targets.length + ' targets from contract (' + targets.map(t => 'cl. ' + t.clause).join(', ') + ')', 'Sample weekly feed ' + DELIVERY_WEEKS[0] + '–' + del.week, 'Window: 4 weeks, weights 40/30/20/10%']}
      rules={[<><Rid id="DEL-001" /> service-level attainment</>, <><Rid id="DEL-002" /> incident notification time</>, <><Rid id="ALERT" /> rolling &lt; 80 or a breach in window</>]}
      result={<><div className="row"><span className="big-n" style={{ fontSize: 40 }}>{del.score != null ? del.score : '—'}<small>/100</small></span><Badge s={del.label} /></div><p className="note">{del.alerts.length} alert(s) at {del.week}</p></>} /> : null}
    <div className="card">
      <div className="ch"><div><h2>Targets received from the Contract engine</h2><div className="sub">Analyse a different contract and these targets change.</div></div></div>
      <div className="tw"><table><thead><tr><th>Metric</th><th>Contract target</th><th>Clause</th><th>Rule</th><th>Sample data</th></tr></thead><tbody>
        {targets.length ? targets.map(t => <tr key={t.key}><td>{t.label}</td><td className="mono">{(t.dir === 'min' ? '≥ ' : '≤ ') + t.target + t.unit}</td><td><Cid id={t.clause} /></td><td><Rid id={t.rule} /></td><td>{feed && feed.series[t.key] ? <Badge s="Sample" label="Available" /> : <span className="note">No feed</span>}</td></tr>)
          : <tr><td colSpan="5" className="note">No measurable service-level targets were extracted from this contract.</td></tr>}
      </tbody></table></div>
    </div>
  </>;
  if (!del) return <>{head}<div className="row"><button className="btn primary" data-act="runDelivery" disabled={!targets.length} onClick={act.runDelivery}>Load sample feed and run delivery assessment</button></div></>;

  const mono = { color: 'var(--ink)' };
  return (
    <>
      {head}
      <div className="grid g2 top-al">
        {del.metrics.map(m => m.noData ? <div className="card pad" key={m.key}><h3>{m.label}</h3><p className="note">No sample data for this metric.</p></div> : (
          <div className="card pad stack" key={m.key}>
            <div className="spread"><div><div className="eyebrow">{m.rule} · clause {m.clause}</div><h3>{m.label}</h3></div><Badge s={m.now >= 85 ? 'On track' : m.now >= 70 ? 'Attention' : 'High risk'} label={m.now + '/100'} /></div>
            <Sparkline m={m} />
            <div className="spread note"><span>{DELIVERY_WEEKS[0]}</span><span>Target {(m.dir === 'min' ? '≥ ' : '≤ ') + m.target + m.unit} (dashed)</span><span>{del.week}</span></div>
            <div className="row" style={{ gap: 18 }}>
              <span className="note">Latest <b className="mono" style={mono}>{m.latest ? m.latest.v + m.unit + ' (' + m.latest.week + ')' : '—'}</b></span>
              <span className="note">Rolling <b className="mono" style={mono}>{m.prev} → {m.now}</b></span>
              <span className="note">Breaches in window <b className="mono" style={mono}>{m.breaches.length}</b></span>
            </div>
          </div>))}
      </div>
      <div className="card">
        <div className="ch"><div><h2>Delivery alerts</h2><div className="sub">Alerts name the metric that moved. Creating an action puts it into the workflow.</div></div>
          <button className="btn sm demo" data-act="advance" disabled={del.end >= DELIVERY_WEEKS.length - 1} onClick={act.advance}>Advance sample feed one week</button></div>
        {del.alerts.length ? del.alerts.map(x => (
          <div className="act" key={x.key}>
            <div><div className="row"><Sev s={x.level} /><Rid id={x.rule} /><Badge s={x.status} /></div><p style={{ marginTop: 6 }}>{x.detail}</p></div>
            <div className="btns">
              {x.actionId ? <GoButton v="actions" className="btn sm">View {x.actionId}</GoButton>
                : (a.delRaised || {})[x.key] && !a.actionsGenerated ? <Badge s="Requested" label="Queued for action generation" />
                  : <button className="btn sm primary" data-act="delAction" data-k={x.key} onClick={() => act.delAction(x.key)}>{a.actionsGenerated ? 'Create action from alert' : 'Raise as action'}</button>}
            </div>
          </div>))
          : <div className="empty" style={{ padding: 24 }}><p className="note">No alerts at {del.week}. All scored metrics meet their contract targets.</p></div>}
      </div>
      <Trace title="Rolling score calculation" rows={del.metrics.filter(m => !m.noData).flatMap(m => m.used.map(u => [m.label + ' · ' + u.week + ': ' + u.value + m.unit, m.rule, <><b>{u.score}</b> × {u.weight}</>]))} />
      <NextButton v="risk" label="Continue to risk assessment" />
    </>
  );
}
