import { reqName, issuesWord } from '../lib/constants.js';
import { riskRows, riskCounts, riskSummary } from '../lib/risk.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge, Sev, Rid, ETag } from '../components/common/Badges.jsx';
import { PageHead, GoButton } from '../components/common/Blocks.jsx';
import EngineStrip from '../components/engines/EngineStrip.jsx';

/* Step 9 · Consolidation: actionable compliance issues, with Delivery Assurance sample-feed alerts kept separate. */
export default function Risk() {
  const { a, D, act } = useAssessment();
  const rows = riskRows(a, D); const k = riskCounts(D);
  const bt = D.overall.startsWith('ACTION') ? 'coral' : D.overall.startsWith('REVIEW') ? 'plum' : 'sage';
  return (
    <>
      <PageHead eyebrow="Step 9 · Consolidation" title="Risk assessment" lead="The four engines combined into one ranked view. Each risk links back to the engine, rule and source that produced it." />
      <div className={'outcome ' + bt}>
        <div><div className="eyebrow">Overall status · prototype output</div><div className="big">{D.overall}</div></div>
        <p><b>{riskSummary(D)}.</b> {k.sampleAlerts ? 'The sample-feed alert is tracked separately and does not create a compliance workflow action. ' : ''}Findings are risk indicators to support your decision, not a legal determination.</p>
      </div>
      <EngineStrip />
      <div className="card">
        <div className="ch"><div><h2>Compliance risk register</h2><div className="sub">{k.compliance} actionable compliance {issuesWord(k.compliance)} · these become workflow actions</div></div><span className="note">{rows.length} entries</span></div>
        <div className="tw"><table><thead><tr><th>Severity</th><th>Risk</th><th>Engine</th><th>Source</th><th>Rule</th><th>Status</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i}><td><Sev s={r.level} /></td><td><b>{r.title}</b><div className="note">{r.detail}</div></td><td><ETag L={r.eng} /></td><td>{r.source}</td><td>{r.rule ? <Rid id={r.rule} /> : '—'}</td><td>{r.ok ? <Badge s="Satisfied" /> : <Badge s={r.status} />}</td></tr>)}
        </tbody></table></div>
      </div>
      {D.delivery ? <div className="card">
        <div className="ch"><div><h2>Delivery Assurance sample-feed alerts</h2><div className="sub">Engine D · separate from the compliance workflow · no action is created unless you choose “Raise as action” on the Delivery assurance page</div></div><span className="proto">Sample feed</span></div>
        {D.delivery.alerts.length ? <div className="tw"><table><thead><tr><th>Severity</th><th>Alert</th><th>Source</th><th>Rule</th><th>Status</th></tr></thead><tbody>
          {D.delivery.alerts.map(x => <tr key={x.key}><td><Sev s={x.level} /></td><td><b>{x.metric.label}</b><div className="note">{x.detail}</div></td><td>Delivery feed (sample) · clause {x.metric.clause}</td><td><Rid id={x.rule} /></td>
            <td>{x.status !== 'Attention' ? <Badge s={x.status} /> : x.level === 'Low' ? <Badge s="Low" label="Informational" /> : <Badge s="Attention" label="Sample-feed alert" />}{x.actionId ? <> <span className="note">{x.actionId}</span></> : null}</td></tr>)}
        </tbody></table></div> : <div className="empty" style={{ padding: 22 }}><p className="note">No Delivery Assurance alerts at {D.delivery.week}.</p></div>}
      </div> : null}
      {D.combined ? <details className="trace"><summary>Assurance score {D.assurance} / 100: how it is built</summary>
        <div className="trow h"><div>Requirement</div><div>Weight</div><div>Engine A · rule results → combined</div></div>
        {D.combined.parts.map(p => <div className="trow" key={p.id}><div className="in">{reqName(p.id)} <Badge s={D.reqStatus[p.id]} /></div><div className="mono">×{p.weight}</div><div className="mono">{p.vendor} · {p.contract} → <b>{p.score}</b></div></div>)}
        <div className="trow"><div className="in">Combined A–C: <b className="mono">{D.combined.overall}</b>{D.delivery && D.delivery.score != null ? <> · Engine D delivery (sample): <b className="mono">{D.delivery.score}</b></> : null}</div><div><Rid id="SCORE" /></div><div className="mono">80% A–C + 20% D = <b>{D.assurance}</b></div></div>
      </details> : null}
      <div className="row">
        {a.actionsGenerated ? <GoButton v="actions">View {a.actions.length} actions <Icon n="arrow" s={15} /></GoButton>
          : <><button className="btn primary" data-act="genActions" onClick={act.genActions}>Generate actions from {k.compliance} actionable compliance {issuesWord(k.compliance)}</button><span className="note">Delivery alerts become actions when you raise them on the Delivery assurance page.</span></>}
      </div>
    </>
  );
}
