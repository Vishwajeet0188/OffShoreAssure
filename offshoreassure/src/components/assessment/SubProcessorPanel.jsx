import { VENDORS } from '../../data/prototype-data.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Badge, Rid, Cid } from '../common/Badges.jsx';
import { Trace } from '../common/Blocks.jsx';

/* Controller → processor → sub-processor flow diagram. */
export function EntityFlow({ a, v, sp, originLabel = 'Controller', firstArrow, warnSecond = true }) {
  return (
    <div className="card pad"><div className="flow">
      <div className="ent home"><div className="role">{originLabel}</div><b>{a.org.replace(/ Ltd$/, '')}</b><div className="loc">United Kingdom</div></div>
      {firstArrow}
      <div className="ent"><div className="role">Processor</div><b>{v.name.replace(/ Sp\. z o\.o\.| Ltd/, '')}</b><div className="loc">{v.location + ', ' + v.country}</div></div>
      {sp ? <>
        <div className={'arrow' + (warnSecond ? ' warn' : '')}><small>Sub-processing</small><div className="ln"></div><small>clause {sp.clause}</small></div>
        <div className="ent sub"><div className="role">Sub-processor</div><b>{sp.name.replace(/ Sp\. z o\.o\./, '')}</b><div className="loc">{warnSecond ? [sp.city, sp.country].filter(Boolean).join(', ') : sp.country || ''}</div></div>
      </> : null}
    </div></div>
  );
}

/* Sub-processor (named, SP-001) or unnamed-subcontractor (SC-001) assessment. */
export default function SubProcessorPanel() {
  const { a, D, act } = useAssessment();
  const an = D.analysis; const v = VENDORS[a.vendorId]; const subChecks = D.checks.filter(c => c.req === 'SUB');
  if (!D.reqs.find(r => r.id === 'SUB')) return <div className="card empty"><p className="note">The scope says no subcontractors will be used, so no sub-processor rules apply.</p></div>;
  const st = D.reqStatus.SUB;
  let top;
  if (D.subMode === 'named') {
    const sp = an.subprocessors[0]; const auth = an.clauses.find(c => c.cat === 'subprocessor-auth');
    top = { flow: <EntityFlow a={a} v={v} sp={sp} firstArrow={<div className="arrow"><small>Contract</small><div className="ln"></div><small>MSA</small></div>} />, left: (
      <div className="card pad stack"><div className="eyebrow">OffshoreAssure extraction · clause {sp.clause}</div>
        <dl className="kv"><dt>Entity type</dt><dd>Sub-processor</dd><dt>Name</dt><dd>{sp.name}</dd><dt>Location</dt><dd>{sp.country}</dd><dt>Processing activity</dt><dd>{sp.activity}</dd><dt>Data access</dt><dd>Potential system and personal data access</dd>
          <dt>Authorisation model</dt><dd>{auth ? (/general/i.test(auth.text) ? 'General written authorisation' : 'Specific written authorisation') : 'Not identified'}</dd></dl>
      </div>) };
  } else {
    const cl = an.clauses.find(c => c.cat === 'subprocessor-auth') || an.clauses.find(c => c.cat === 'subprocessor');
    top = { flow: null, left: (
      <div className="card pad stack"><div className="eyebrow">Subcontractor activity detected</div>
        <p className="note">The contract permits subcontracting but names no sub-processor, so rule set SC-001 applies.</p>
        <dl className="kv"><dt>Contract requirement</dt><dd>{cl && cl.obligation ? cl.obligation.text : 'No approval mechanism found'} {cl ? <Cid id={cl.id} /> : null}</dd>
          <dt>OffshoreAssure requirement</dt><dd>Subcontractor authorisation and equivalent contractual safeguards must be verified.</dd>
          <dt>Status</dt><dd><Badge s={st} label={st.toUpperCase()} /></dd></dl>
        <div className="row">{a.requested['sub-authorisation'] ? <Badge s="Requested" label="Subcontractor evidence requested" /> : <button className="btn sm primary" data-act="request" data-ev="sub-authorisation" onClick={() => act.request('sub-authorisation')}>Request subcontractor evidence</button>}</div>
      </div>) };
  }
  return (
    <>
      {top.flow}
      <div className="grid g2 top-al">
        {top.left}
        <div className="card">
          <div className="ch"><h2>{D.subMode === 'named' ? 'Sub-processor checks · SP-001' : 'Subcontractor checks · SC-001'}</h2><Badge s={st} label={st.toUpperCase()} /></div>
          <div className="tw"><table><tbody>{subChecks.map(c => <tr key={c.id}><td><Rid id={c.id} /></td><td>{c.name}<div className="note">{c.note}</div></td><td><Badge s={c.status} /></td></tr>)}</tbody></table></div>
        </div>
      </div>
      {D.subMode === 'named' ? <div className={'outcome ' + (st === 'Satisfied' ? 'sage' : st.startsWith('Satisf') ? 'plum' : 'amber')}>
        <div className="big">{st.toUpperCase()}</div>
        <p>{st === 'Review required' ? 'Unresolved evidence and contractual verification requirements relate to the sub-processor. This is an evidence status, not a finding of non-compliance.' : 'Sub-processor evidence is on file. A reviewer should confirm it before the assessment closes.'}</p>
      </div> : null}
      <Trace title="Sub-processor rule execution" rows={subChecks.map(c => [c.input, c.id, <Badge s={c.status} />])} open />
    </>
  );
}
