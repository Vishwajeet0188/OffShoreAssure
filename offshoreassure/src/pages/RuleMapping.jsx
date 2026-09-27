import { useEffect } from 'react';
import { RULEBASE_VERSION } from '../data/prototype-data.js';
import { isPass } from '../engine/engines.js';
import { reqName, engineOf, tone } from '../lib/constants.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge, Rid, Cid, ETag } from '../components/common/Badges.jsx';
import { PageHead, Tabs, useTab, NextButton } from '../components/common/Blocks.jsx';
import SubProcessorPanel from '../components/assessment/SubProcessorPanel.jsx';

/* Clause → extraction → obligation → rule → result pipeline for one rule check. */
function RulePipeline({ ch }) {
  const { a, D, act } = useAssessment();
  const cl = ch.clauses[0]; const o = cl.obligation; const req = D.reqs.find(r => r.id === ch.req);
  const remaining = D.checks.filter(x => x.req === ch.req && x.id !== ch.id && !isPass(x.status));
  const reqSt = D.reqStatus[ch.req]; const tn = tone(reqSt);
  return (
    <div className="grid g2 top-al">
      <div className="pipe">
        <div className="node contract"><div className="k">Contract · clause {cl.id}</div><div className="body serif" style={{ fontSize: 15 }}>“{cl.text}”</div></div>
        <div className="conn"><span>extraction {cl.confidence ? Math.round(cl.confidence * 100) + '%' : ''}</span></div>
        <div className="node ai"><div className="k">AI extraction</div><div className="body">{cl.entities[0] ? cl.entities[0].name + ' is a ' + cl.entities[0].role.toLowerCase() : o ? o.partyName + ' · ' + o.event + ' · ' + o.deadline : cl.label}</div></div>
        <div className="conn"><span>classify</span></div>
        <div className="node obl"><div className="k">Contractual obligation</div><div className="body"><b>{cl.label}</b>{o ? <><br /><span className="muted">{o.text}</span></> : null}</div></div>
        <div className="conn"><span>apply rule</span></div>
        <div className="node rule"><div className="k">OffshoreAssure rule {ch.id}</div><div className="body"><b>{req.name}</b><br />{ch.name}</div></div>
        <div className="conn"><span>result</span></div>
        <div className="node res" style={{ borderColor: 'var(--' + (tn === 'mute' ? 'line' : tn + (tn === 'plum' ? '' : '-fill')) + ')' }}>
          <div className="k">Compliance result</div>
          <div className="body row" style={{ gap: 8 }}><Badge s={ch.status} /><span className="note">clause check</span><span className="note">·</span><span className="note">requirement</span><Badge s={reqSt} label={reqSt.toUpperCase()} /></div>
        </div>
      </div>
      <div className="card pad stack">
        <div className="eyebrow">Requirement</div>
        <h2 className="serif" style={{ fontSize: 22 }}>{req.name}</h2>
        <dl className="kv"><dt>Contract evidence</dt><dd>Clause {cl.id}</dd><dt>Identified obligation</dt><dd>{o ? o.text : cl.label + ' provision identified'}</dd><dt>Rule note</dt><dd>{ch.note}</dd><dt>Status</dt><dd><Badge s={reqSt} label={reqSt.toUpperCase()} /></dd></dl>
        {remaining.length ? <div><div className="eyebrow" style={{ marginBottom: 8 }}>Remaining for this requirement</div><div className="stack" style={{ gap: 8 }}>
          {remaining.map(r => <div key={r.id}><div className="spread"><span><Rid id={r.id} /> {r.name}</span><Badge s={r.status} /></div>{r.rule.verifiedNote && r.status === 'Awaiting verification' ? <p className="note">{r.rule.verifiedNote}</p> : null}</div>)}
        </div></div> : null}
        {!a.accepted[cl.id] ? <div className="row"><button className="btn sm primary" data-act="accept" data-id={cl.id} onClick={() => act.accept(cl.id)}>Accept extraction for clause {cl.id}</button></div> : null}
      </div>
    </div>
  );
}

/* Step 6 · Engine B: rule mapping (trace, sub-processor assessment, mapping matrix). */
export default function RuleMapping() {
  const { S, a, D, act } = useAssessment();
  const an = D.analysis;
  const list = [['trace', 'Clause → rule trace'], ['sub', 'Sub-processor assessment', D.reqs.find(r => r.id === 'SUB') ? (an.subprocessors.length ? an.subprocessors.length + ' named' : 'SC') : null], ['matrix', 'Mapping matrix', D.checks.length]];
  const cur = useTab('map', list);

  /* First visits are recorded in the audit trail, exactly once per assessment. */
  useEffect(() => {
    if (cur === 'sub' && !a.subSeen) { if (D.subMode === 'named') act.markSeen('subSeen', 'Sub-processor assessment opened', an.subprocessors[0].name + ' (clause ' + an.subprocessors[0].clause + ')', 'SP-001'); else act.markSeen('subSeen'); }
    if (cur === 'trace' && !a.mappingSeen) act.markSeen('mappingSeen', 'Obligations mapped to compliance rules', D.checks.length + ' rule checks executed', RULEBASE_VERSION);
  }, [cur, a, D, an, act]);

  const head = <><PageHead eyebrow="Step 6 · Engine B" title="Rule mapping" lead="How a contract clause becomes a compliance result: extraction, structured obligation, OffshoreAssure rule, result." /><Tabs k="map" list={list} cur={cur} /></>;
  if (cur === 'sub') return <>{head}<SubProcessorPanel /><NextButton v="transfer" label="Continue to data transfer" /></>;
  if (cur === 'matrix') return <>{head}
    <div className="card"><div className="tw"><table><thead><tr><th>Requirement</th><th>Rule</th><th>Engine</th><th>Clause</th><th>Obligation / evidence</th><th>Result</th></tr></thead><tbody>
      {D.checks.map(c => <tr key={c.id} className="click" data-act="selCheck" data-id={c.id} onClick={() => act.selCheck(c.id)}>
        <td>{reqName(c.req)}</td><td><Rid id={c.id} /></td><td><ETag L={engineOf(c)} /></td><td>{c.clauses[0] ? <Cid id={c.clauses[0].id} /> : <span className="muted">—</span>}</td>
        <td>{c.clauses[0] && c.clauses[0].obligation ? c.clauses[0].obligation.text : c.input}</td><td><Badge s={c.status} /></td></tr>)}
    </tbody></table></div></div>
    <NextButton v="transfer" label="Continue to data transfer" />
  </>;

  const mapped = D.checks.filter(c => c.clauses.length && c.rule.type !== 'jurisdiction');
  const defaultId = (D.checks.find(c => c.id === (D.subMode === 'named' ? 'SP-002' : 'INC-001')) || mapped[0] || {}).id;
  const selId = S.sel.check && D.checks.find(c => c.id === S.sel.check) ? S.sel.check : defaultId;
  const ch = D.checks.find(c => c.id === selId);
  return <>{head}
    <div className="row"><label className="ql" htmlFor="pick">Trace rule</label>
      <select id="pick" className="sm" data-act="pick" value={selId} onChange={e => act.select('check', e.target.value)}>{D.checks.map(c => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}</select>
    </div>
    {ch && !ch.clauses[0] ? <div className="card pad stack"><div className="eyebrow">Evidence rule · no contract clause</div><h2><Rid id={ch.id} /> {ch.name}</h2>
      <dl className="kv"><dt>Requirement</dt><dd>{reqName(ch.req)}</dd><dt>Input</dt><dd>{ch.input}</dd><dt>Result</dt><dd><Badge s={ch.status} /></dd><dt>Rule note</dt><dd>{ch.note}</dd></dl>
      <p className="note">This rule is satisfied by evidence rather than contract wording. It is resolved in Evidence &amp; audit.</p></div>
      : ch ? <RulePipeline ch={ch} /> : null}
    <div className="row"><button className="btn" data-act="tab" data-k="map" data-v="sub" onClick={() => act.setTab('map', 'sub')}>Sub-processor assessment</button><button className="btn primary" data-act="go" data-v="transfer" onClick={() => act.go('transfer')}>Continue to data transfer <Icon n="arrow" s={15} /></button></div>
  </>;
}
