import { VENDORS, SCENARIOS } from '../data/prototype-data.js';
import { isPass, isSoft } from '../engine/engines.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Badge, Rid, Cid } from '../components/common/Badges.jsx';
import { PageHead, EngineCard, Trace, NextButton } from '../components/common/Blocks.jsx';
import { EntityFlow } from '../components/assessment/SubProcessorPanel.jsx';

/* Step 7 · Engine C: international data transfer (restricted-transfer safeguard gate, or adequacy path). */
export default function DataTransfer() {
  const { a, D, act } = useAssessment();
  const v = VENDORS[a.vendorId]; const j = D.juris; const an = D.analysis;
  const restricted = !(j.status === 'adequate' || j.status === 'domestic');
  const x1 = D.checks.find(c => c.id === 'XFER-001'); const x2 = D.checks.find(c => c.id === 'XFER-002');
  const head = <PageHead eyebrow="Step 7 · Engine C" title="International data transfer" lead="The destination is looked up in the transfer rule table first. The outcome decides the workflow: a safeguard gate for restricted transfers, or an adequacy path with governance checks carried forward." />;

  if (!D.reqs.find(r => r.id === 'XFER')) return <>{head}
    <div className="card empty"><p className="note">No personal data leaves the UK in this scope, so the Data Transfer engine does not run.</p><button className="btn primary" data-act="transferDone" onClick={act.transferDone}>Confirm and continue</button></div>
    {a.transferDone ? <NextButton v="delivery" label="Continue to delivery assurance" /> : null}
  </>;

  const gateSt = restricted ? (x2 ? x2.status : '—') : 'Adequacy identified';
  const sp = an.subprocessors[0]; const cats = a.scope.dataCats;
  const t = a.transfer;
  const radio = (k, q, opts) => (
    <div className="stack" style={{ gap: 7 }}><span className="ql">{q}</span><div className="checks">
      {opts.map(o => <label key={o} className={'chk' + (t[k] === o ? ' on' : '')}><input type="radio" name={'t-' + k} data-act="tq" data-k={k} value={o} checked={t[k] === o} onChange={() => act.setTransfer(k, o)} />{o}</label>)}
    </div></div>
  );
  const gov = D.reqStatus.SUB;

  return (
    <>
      {head}
      {a.transferDone ? <EngineCard L="C" sub="Intelligent data transfer risk gate"
        inputs={[<>Destination: {v.country}{x1.clauses[0] ? <> <Cid id={x1.clauses[0].id} /></> : null}</>, 'Data: ' + cats.slice(0, 3).join(', ') + (cats.length > 3 ? '…' : ''), restricted ? 'Safeguard answers: ' + [t.mechanism, t.contractual, t.tra].join(' / ') : 'No safeguard questions needed']}
        rules={[<><Rid id="XFER-001" /> jurisdiction lookup</>, restricted ? <><Rid id="XFER-002" /> mechanism + contract + TRA gate</> : <span className="note">XFER-002 not triggered (adequacy)</span>, <><Rid id="SP-001" /> governance carried forward</>]}
        result={<div className="stack" style={{ gap: 6 }}><Badge s={gateSt} label={restricted ? (isPass(gateSt) ? 'Safeguard verified' : isSoft(gateSt) ? 'Subject to review' : 'Review required') : 'Adequacy path identified'} /><span className="note">{j.basis}</span></div>} /> : null}
      <EntityFlow a={a} v={v} sp={sp} originLabel="Origin" warnSecond={false}
        firstArrow={<div className={'arrow' + (restricted ? ' warn' : '')}><small>{(cats.slice(0, 2).join(', ') || 'Personal data') + (cats.length > 2 ? ' +' + (cats.length - 2) : '')}</small><div className="ln"></div><small>{a.category}</small></div>} />
      <div className="grid g2 top-al">
        <div className="card pad stack"><div className="eyebrow">Transfer detected</div><h2 className="serif" style={{ fontSize: 22 }}>United Kingdom → {v.country}</h2>
          <dl className="kv"><dt>Information involved</dt><dd>{cats.join(', ')}</dd>
            <dt>Contract evidence</dt><dd>{x1.clauses[0] ? 'Clause ' + x1.clauses[0].id + ': “' + x1.clauses[0].text + '”' : 'No data-location clause'}</dd>
            <dt>Rule table lookup</dt><dd><Rid id="XFER-001" /> {j.basis}</dd>
            <dt>Transfer type</dt><dd>{restricted ? <Badge s="Review required" label="Potential restricted transfer" /> : <Badge s="Adequacy identified" label="Adequacy pathway identified" />}</dd></dl>
        </div>
        {restricted ? (
          <div className="card pad stack"><div className="eyebrow">Transfer assessment · rule XFER-002</div>
            {radio('mechanism', '1. What transfer mechanism is currently documented?', ['UK IDTA', 'UK Addendum', 'UK adequacy regulations', 'BCR', 'Exception', 'Not identified'])}
            {radio('contractual', '2. Is contractual protection documented?', ['Yes', 'No'])}
            {radio('tra', '3. Has the transfer risk assessment / data protection test been completed?', ['Yes', 'No'])}
            {a.preset && SCENARIOS[a.preset].transfer.mechanism && !t.mechanism ? <button className="link" data-act="tqFill" onClick={act.tqFill}>Fill use-case answers</button> : null}
            <div className="row"><button className="btn primary" data-act="runGate" disabled={!(t.mechanism && t.contractual && t.tra)} onClick={act.runGate}>Run transfer gate</button></div>
          </div>
        ) : (
          <div className="card pad stack"><div className="eyebrow">Prototype result</div>
            <div className="outcome sage" style={{ padding: '12px 16px' }}><div className="big" style={{ fontSize: 18 }}>ADEQUACY PATH IDENTIFIED</div></div>
            <table><tbody>
              <tr><td>Transfer destination</td><td><b>{v.country}</b></td></tr>
              <tr><td>UK adequacy status</td><td><Badge s="Identified" /></td></tr>
              <tr><td>Transfer route</td><td>Adequacy pathway identified</td></tr>
              <tr><td>Processor / sub-processor governance</td><td>{D.reqs.find(r => r.id === 'SUB') ? <Badge s={gov} label={gov === 'Review required' ? 'Additional verification required' : gov} /> : '—'}</td></tr>
            </tbody></table>
            <p className="note">Adequacy removes the need for an alternative transfer mechanism. It does not remove processor and sub-processor obligations, which stay open under SP-001.</p>
            <div className="row"><button className="btn primary" data-act="transferDone" disabled={!!a.transferDone} onClick={act.transferDone}>{a.transferDone ? 'Transfer assessment recorded' : 'Confirm transfer assessment'}</button></div>
          </div>
        )}
      </div>
      {restricted && a.transferDone && x2 ? <>
        <div className={'outcome ' + (x2.status === 'Satisfied' ? 'sage' : isSoft(x2.status) ? 'plum' : 'amber')}>
          <div><div className="eyebrow">Data transfer risk gate</div><div className="big">STATUS: {x2.status === 'Satisfied' ? 'SAFEGUARD VERIFIED' : isSoft(x2.status) ? 'EVIDENCE SUBMITTED · SUBJECT TO REVIEW' : 'REVIEW REQUIRED'}</div></div>
          <p>{x2.status === 'Satisfied' ? 'The transfer mechanism and assessment are verified.' : 'The transfer cannot be marked as safeguarded until the mechanism, contractual protection and transfer risk assessment are confirmed with evidence.'}</p>
        </div>
        <Trace title="Transfer gate execution" open rows={[['Destination ' + v.country, 'XFER-001', j.basis], [x2.input, 'XFER-002', <><Badge s={x2.status} /> <span className="note">{x2.note}</span></>]]} />
      </> : null}
      {!restricted && sp ? <div className="card"><div className="ch"><h2>Transfer + sub-processor combined view</h2></div><div className="tw"><table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>
        {[['UK → ' + v.country + ' destination', <Badge s="Adequacy identified" />], ['Processor identified', <Badge s="Identified" label="Yes" />], ['Sub-processor identified', <Badge s="Identified" label="Yes" />]]
          .concat(D.checks.filter(c => ['SP-001', 'SP-004', 'SP-005', 'SP-003', 'SP-006'].includes(c.id)).map(c => [c.name, <Badge s={c.status} />]))
          .map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>)}
      </tbody></table></div></div> : null}
      {a.transferDone ? <NextButton v="delivery" label="Continue to delivery assurance" /> : null}
    </>
  );
}
