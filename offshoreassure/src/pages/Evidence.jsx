import { SCENARIOS } from '../data/prototype-data.js';
import { reqName } from '../lib/constants.js';
import { fmtTime } from '../lib/format.js';
import { SAMPLE_EV } from '../context/AssessmentContext.jsx';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge, Rid } from '../components/common/Badges.jsx';
import { PageHead, Tabs, NextButton } from '../components/common/Blocks.jsx';
import Reassessment from '../components/assessment/Reassessment.jsx';

function AuditTimeline() {
  const { a } = useAssessment();
  return (
    <div className="card pad"><div className="tl">
      {a.audit.slice().reverse().map((e, i) => (
        <div className="ev" key={i}>
          <div className="time">{fmtTime(e.at)}</div>
          <div className="rail"><i className={e.ref ? 'rule' : ''}></i></div>
          <div><b>{e.event}</b>{e.detail ? <div className="note">{e.detail}</div> : null}<div className="note" style={{ marginTop: 3 }}>{e.by}{e.ref ? <> · <Rid id={e.ref} /></> : null} · {e.rb}</div></div>
        </div>))}
    </div></div>
  );
}

/* Step 11 · Governance evidence (supporting layer, not an engine): evidence register, audit trail, reassessment.
   The audit trail tab has its own route: /assessment/:assessmentId/audit-trail. */
export default function Evidence({ audit = false }) {
  const { S, a, D, me, act } = useAssessment();
  const isCM = S.role === 'sw'; const sim = a.preset && SCENARIOS[a.preset].simulate.length;
  const stored = S.tab.ev === 'audit' ? 'ev' : S.tab.ev || 'ev';
  const cur = audit ? 'audit' : stored;
  const onTab = v => { if (v === 'audit') act.auditTab(); else { act.setTab('ev', v); if (audit) act.go('evidence'); } };
  const list = [['ev', 'Evidence', D.evidence.length], ['audit', 'Audit trail', a.audit.length], ['re', 'Reassessment']];
  const head = <>
    <PageHead eyebrow="Step 11 · Governance evidence (supporting layer)" title="Evidence & audit" lead="The traceability layer over all four engines. Evidence is attached to the rule it satisfies, and every decision is logged with its source, rule and rule-base version. Adding or verifying evidence re-runs the engines."
      right={sim ? <button className="btn demo" data-act="simulate" disabled={!!a.simulated} onClick={act.simulate}>Simulate supplier response <span className="note">(prototype demo)</span></button> : null} />
    <Tabs k="ev" list={list} cur={cur} onSelect={onTab} />
  </>;
  if (cur === 'audit') return <>{head}<AuditTimeline /></>;
  if (cur === 're') return <>{head}{a.baseline ? <Reassessment /> : <div className="card empty"><p className="note">The baseline is captured when actions are generated.</p></div>}</>;

  return (
    <>
      {head}
      <div className="card">
        <div className="ch"><h2>Compliance evidence</h2><span className="note">{D.evidence.length} items · {D.evidenceGaps} gaps</span></div>
        <div className="tw"><table><thead><tr><th>Related to</th><th>Rule</th><th>Evidence</th><th>Status</th><th></th></tr></thead><tbody>
          {D.evidence.map((r, i) => {
            const docs = r.check.evStatus ? r.check.evStatus.docs : [];
            const upId = 'up-' + r.check.id.replace(/\W+/g, '-');
            const sample = r.ev && r.status !== 'Verified' && SAMPLE_EV[r.ev] ? SAMPLE_EV[r.ev](a) : null;
            return (
              <tr key={i}>
                <td>{reqName(r.req)}</td><td><Rid id={r.check.id} /></td>
                <td>{r.label.includes('.pdf') ? <span className="file"><Icon n="doc" s={13} />{r.label}</span> : r.label}</td>
                <td><Badge s={r.status} /></td>
                <td><div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  {r.ev && r.status !== 'Verified' ? <>
                    {sample && !a.docs.find(d => d.name === sample && d.covers.includes(r.ev)) ? <button className="btn sm" data-act="attachEv" data-ev={r.ev} onClick={() => act.attachEv(r.ev)}><Icon n="upload" s={13} /> {sample}</button> : null}
                    <label className="btn sm" htmlFor={upId}>Upload file</label>
                    <input className="vh" type="file" id={upId} data-up="ev" data-ev={r.ev} onChange={e => { if (e.target.files.length) act.uploadEvidence([...e.target.files], r.ev); e.target.value = ''; }} />
                    {!['Submitted', 'Requested'].includes(r.status) ? <button className="btn sm" data-act="request" data-ev={r.ev} onClick={() => act.request(r.ev)}>Request</button> : null}
                  </> : null}
                  {docs.filter(d => d.status === 'Submitted').map(d => (
                    <button key={d.name} className="btn sm primary" data-act="verify" data-name={d.name} disabled={!isCM} title={isCM ? undefined : 'Only the Compliance Manager can verify evidence'} onClick={() => act.verify(d.name)}>Verify {d.name.length > 24 ? d.name.slice(0, 22) + '…' : d.name}</button>))}
                </div></td>
              </tr>);
          })}
        </tbody></table></div>
      </div>
      {!isCM ? <p className="note">Viewing as {me.name}. Switch to Sarah Williams (Compliance Manager) to verify submitted evidence.</p> : null}
      {a.baseline ? <Reassessment /> : null}
      <NextButton v="final" label="Continue to final assessment" />
    </>
  );
}
