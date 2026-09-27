import { EVIDENCE_TYPES, VENDORS } from '../data/prototype-data.js';
import { initials } from '../lib/constants.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge, Rid } from '../components/common/Badges.jsx';
import { Ring } from '../components/common/Charts.jsx';
import { PageHead, EngineCard, Trace, NextButton } from '../components/common/Blocks.jsx';
import { YesNo } from './Requirements.jsx';

/* Step 3 · Engine A: Compliance assessment (questionnaire + supplier documents scored by rubric). */
export default function Compliance() {
  const { a, D, act } = useAssessment();
  const v = VENDORS[a.vendorId]; const q = a.q || v.q; const vs = D.vendorScore;
  const vdocs = a.docs.filter(d => d.stage === 'vendor');
  return (
    <>
      <PageHead eyebrow="Step 3 · Engine A" title="Compliance assessment" lead={'Questionnaire answers and supplier documents are scored against the ' + D.reqs.length + ' requirements. Evidenced controls score in full; declared-only controls score 60%.'} />
      {vs ? <EngineCard L="A" sub="Compliance-to-access control"
        inputs={['Scope answers → ' + D.reqs.length + ' requirements', v.shownQ.length + ' questionnaire answers', vdocs.length + ' supplier documents']}
        rules={[<><Rid id="REQ-*" /> requirement triggers</>, <><Rid id="RUBRIC-*" /> weighted area rubric</>, <><Rid id="EV-001" /> certificate check (simulated)</>, <><Rid id="ACCESS" /> access-flag thresholds</>]}
        result={<><div className="row"><span className="big-n" style={{ fontSize: 40 }}>{vs.overall}<small>/100</small></span><Badge s={vs.flag} label={'Access: ' + vs.flag} /></div><p className="note">{vs.weak.length ? 'Weak areas named: ' + vs.weak.map(w => w.name).join(', ') : 'No area below 60'}</p></>} /> : null}
      <div className="grid g2 top-al">
        <div className="card pad stack">
          <div className="row" style={{ gap: 12 }}><span className="avatar" style={{ width: 44, height: 44 }}>{initials(v.name)}</span><div><div className="eyebrow">Supplier profile</div><h2 className="serif" style={{ fontSize: 20 }}>{v.name}</h2></div></div>
          <dl className="kv"><dt>Country</dt><dd>{v.country}</dd><dt>Primary location</dt><dd>{v.location}</dd><dt>Service</dt><dd>{v.service}</dd><dt>Staff involved</dt><dd>{v.staff}</dd><dt>Subcontractors</dt><dd>{q.usesSubs ? 'Yes' : 'No'}</dd></dl>
        </div>
        <div className="card">
          <div className="ch"><h2>Supplier questionnaire</h2><span className="note">Editable · answers feed the score</span></div>
          <div style={{ padding: '2px 22px 8px' }}>
            {v.shownQ.map(([k, label]) => { const val = q[k];
              if (typeof val === 'string') return <div className="qrow" key={k}><span>{label}</span><b>{val}</b></div>;
              return <div className="qrow" key={k}><span>{label}</span><YesNo on={val} act="vq" k={k} onYes={() => act.setAnswer(k, true)} onNo={() => act.setAnswer(k, false)} /></div>; })}
          </div>
        </div>
      </div>
      <div className="card pad stack">
        <div className="spread">
          <div><h2>Supplier documents</h2><div className="note">Certificates are auto-checked (simulated register lookup) and marked Verified. Policies and procedures are marked Submitted for a reviewer.</div></div>
          <div className="row">
            <button className="btn sm" data-act="vendorSamples" disabled={v.docs.every(n => vdocs.find(d => d.name === n))} onClick={act.vendorSamples}><Icon n="upload" s={14} /> Attach {v.docs.length} prepared documents</button>
            <label className="btn sm" htmlFor="up-vendor">Upload file</label>
            <input className="vh" type="file" id="up-vendor" data-up="vendor" multiple onChange={e => { if (e.target.files.length) act.uploadVendorDocs([...e.target.files]); e.target.value = ''; }} />
          </div>
        </div>
        {vdocs.length ? <div className="tw"><table><tbody>
          {vdocs.map(d => <tr key={d.name}><td><span className="file"><Icon n="doc" s={14} />{d.name}</span></td><td><Badge s={d.status} /></td>
            <td className="note">{d.covers.length ? '→ ' + d.covers.map(c => EVIDENCE_TYPES[c].label).join(', ') : d.policy ? '→ ' + (d.policy === 'secPolicy' ? 'Information security policy' : 'Data protection policy') : 'Unclassified'}</td></tr>)}
        </tbody></table></div> : null}
      </div>
      <div className="row"><button className="btn primary" data-act="runVendor" onClick={act.runVendor}>{a.vendorRun ? 'Re-run compliance assessment' : 'Run compliance assessment'}</button></div>
      {vs ? <>
        <div className="card">
          <div className="ch"><div><h2>{v.name}: preliminary compliance assessment</h2><div className="sub">Weighted average of {vs.areas.length} requirement areas. A risk indicator, not a legal conclusion.</div></div><Badge s={vs.flag} label={'Access recommendation: ' + vs.flag} /></div>
          <div className="grid g2 pad top-al">
            <div className="stack">
              <div className="row" style={{ gap: 22 }}><Ring pct={vs.overall} size={128} label="of 100" /><div className="stack" style={{ gap: 6, flex: 1, minWidth: 180 }}><span className="eyebrow">Access flag rule</span><span className="note">Approved ≥ 80 with no area below 60 · Conditional ≥ 60 or any area below 60 · Restricted &lt; 60</span></div></div>
              {vs.weak.length ? <div className="outcome amber" style={{ padding: '12px 16px' }}><div><div className="eyebrow">System observation</div><p>{vs.weak.map(w => w.name + ' (' + w.score + ')').join(', ')} {vs.weak.length > 1 ? 'require' : 'requires'} further review. Access stays {vs.flag.toLowerCase()} until the named controls improve.</p></div></div> : null}
            </div>
            <div className="stack" style={{ gap: 14 }}>
              {vs.areas.map(ar => <div key={ar.id}><div className="spread"><span>{ar.name} <span className="note">×{ar.weight}</span></span><b className="mono" style={{ fontSize: 13 }}>{ar.score}</b></div><div className="bar" style={{ marginTop: 5 }}><i className={ar.score < 60 ? 'lo' : ar.score < 80 ? 'mid' : ''} style={{ width: ar.score + '%' }}></i></div></div>)}
            </div>
          </div>
        </div>
        <Trace title="How each area score was calculated" rows={vs.areas.flatMap(ar => ar.items.map(it => [ar.name + ': ' + it.label, 'RUBRIC-' + ar.id, <><b>{it.earned ? '+' + it.earned : '0'}</b> / {it.pts} <span className="note">{it.basis}</span></>]))} />
        <NextButton v="contract" label="Continue to contract extraction" />
      </> : null}
    </>
  );
}
