import { TAXONOMY, VENDORS } from '../data/prototype-data.js';
import { extractTargets } from '../engine/engines.js';
import { PROC_STEPS } from '../lib/constants.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge, Rid, Cid } from '../components/common/Badges.jsx';
import { PageHead, EngineCard, Tabs, useTab, NextButton, GoButton } from '../components/common/Blocks.jsx';
import ClauseDetail, { clauseFinding } from '../components/assessment/ClauseDetail.jsx';

/* Step 4 · Engine B: Contract analysis (upload, processing steps, clause classification, key information). */
export default function Contract() {
  const { S, a, D, act } = useAssessment();
  const v = VENDORS[a.vendorId]; const an = D.analysis; const busy = S.proc != null;
  const tabList = an ? [['rel', 'Extracted clauses', an.relevant.length], ['info', 'Key information'], ['all', 'All clauses', an.clauses.length]] : [['rel']];
  const cur = useTab('contract', tabList);

  const head = (
    <>
      <PageHead eyebrow="Step 4 · Engine B" title="Contract analysis" lead="Upload the supplier agreement. The Contract engine splits it into clauses, classifies them against a fixed taxonomy, and extracts obligations, third parties and service-level targets." />
      {an && !busy ? <EngineCard L="B" sub="Contract-to-operational rules"
        inputs={[<span className="mono">{a.contractName}</span>, an.clauses.length + ' numbered clauses', 'Parties: ' + an.parties.Supplier]}
        rules={[<><Rid id="TAXONOMY" /> {TAXONOMY.filter(t => t.relevant).length} clause categories</>, <><Rid id="EXTRACT" /> obligation / deadline / party schema</>, <><Rid id="HITL" /> hold below 75% confidence</>, <><Rid id="DP · PC · SEC · INC · SP" /> clause rules</>]}
        result={<div className="stack" style={{ gap: 6 }}><div><b className="serif" style={{ fontSize: 24 }}>{an.obligations.length}</b> obligations · <b className="serif" style={{ fontSize: 24 }}>{an.relevant.length}</b> relevant clauses</div><div className="note">{an.subprocessors.length} sub-processor(s) · {extractTargets(an).length} service-level targets passed to Engine D</div></div>} /> : null}
      <div className="card pad stack">
        <div className="upl">
          <div className="row" style={{ gap: 14 }}>
            <span className="ic copper" style={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--card)' }}><Icon n="upload" s={20} /></span>
            <div><b>Upload supplier agreement</b><div className="note">Use the prepared sample, or your own contract as a .txt file with numbered clauses ("7.1 Heading. Text").</div></div>
          </div>
          <div className="row">
            <button className="btn" data-act="sampleContract" onClick={act.sampleContract}>Use {v.contract}</button>
            <label className="btn" htmlFor="up-contract">Choose file</label>
            <input className="vh" type="file" id="up-contract" data-up="contract" accept=".txt,.md,text/plain" onChange={e => { if (e.target.files.length) act.uploadContract(e.target.files[0]); e.target.value = ''; }} />
          </div>
        </div>
        {a.contractName ? <div className="spread">
          <div className="row"><span className="file"><Icon n="doc" s={14} />{a.contractName}</span>{a.contractAnalysed ? <Badge s="Satisfied" label="Extraction complete" /> : <span className="note">Ready to analyse</span>}</div>
          <button className="btn primary" data-act="analyse" disabled={busy} onClick={act.analyse}>{a.contractAnalysed ? 'Re-analyse' : 'Upload & analyse'}</button>
        </div> : null}
      </div>
    </>
  );

  if (busy) return <>{head}<div className="card pad"><div className="steps">{PROC_STEPS.map((s, i) => (
    <div key={s} className={'step ' + (i < S.proc ? 'done' : i === S.proc ? 'run' : 'wait')}><span className="s">{i < S.proc ? '✓' : ''}</span>{s}{i === S.proc ? <span className="note">Processing…</span> : null}</div>
  ))}</div></div></>;
  if (!an) return head;

  const sp = an.subprocessors[0];
  const banner = sp ? <div className="outcome plum"><div><div className="eyebrow">Third party detected</div><div className="big">{sp.name} identified as a sub-processor</div></div><p>Clause {sp.clause}. A second-level assessment (rule set SP-001) has been opened. <button className="link" data-act="subTab" onClick={act.subTab}>Open sub-processor assessment <Icon n="arrow" s={13} /></button></p></div> : null;
  const tabs = <Tabs k="contract" list={tabList} cur={cur} />;

  if (cur === 'info') {
    const tg = extractTargets(an);
    return <>{head}{banner}{tabs}
      <div className="grid g2 top-al">
        <div className="card pad"><dl className="kv">
          <dt>Document</dt><dd>{an.title}</dd><dt>Customer</dt><dd>{an.parties.Customer}</dd><dt>Supplier</dt><dd>{an.parties.Supplier}</dd>
          <dt>Governing law</dt><dd>{(an.clauses.find(c => /governing law/i.test(c.heading)) || {}).text || '—'}</dd>
          <dt>Third parties</dt><dd>{an.entities.length ? an.entities.map((e, i) => <span key={i}>{i ? <br /> : null}{e.name + ' (' + e.role + ', clause ' + e.clause + ')'}</span>) : 'None named'}</dd>
          <dt>Jurisdictions</dt><dd>{[...new Set(an.clauses.flatMap(c => c.countries))].join(', ') || '—'}</dd>
        </dl></div>
        <div className="card"><div className="ch"><div><h2>Service-level targets</h2><div className="sub">Passed to Engine D (Delivery Assurance)</div></div></div>
          <div className="tw"><table><thead><tr><th>Metric</th><th>Target</th><th>Clause</th></tr></thead><tbody>
            {tg.length ? tg.map(x => <tr key={x.key}><td>{x.label}</td><td className="mono">{(x.dir === 'min' ? '≥ ' : '≤ ') + x.target + x.unit}</td><td><Cid id={x.clause} /></td></tr>) : <tr><td colSpan="3" className="note">No measurable targets found.</td></tr>}
          </tbody></table></div></div>
      </div>
      <NextButton v="obligations" label="Continue to obligation identification" />
    </>;
  }

  const rows = cur === 'all' ? an.clauses : an.relevant;
  const selId = S.sel.clause && an.clauses.find(c => c.id === S.sel.clause) ? S.sel.clause : (an.clauses.find(c => c.cat === (an.subprocessors.length ? 'subprocessor' : 'incident')) || an.relevant[0] || an.clauses[0] || {}).id;
  return <>{head}{banner}{tabs}
    <div className="grid g2 top-al">
      <div className="card"><div className="tw"><table><thead><tr><th>Clause</th><th>Category</th><th>Finding</th><th className="num">Conf.</th></tr></thead><tbody>
        {rows.map(c => { const f = clauseFinding(c, D); return (
          <tr key={c.id} className={'click' + (c.id === selId ? ' sel' : '')} data-act="clause" data-id={c.id} onClick={() => act.select('clause', c.id)}>
            <td><Cid id={c.id} /></td><td>{c.label}</td><td>{f ? <Badge s={f} /> : <span className="note">Not relevant</span>}</td><td className="num mono">{c.confidence ? Math.round(c.confidence * 100) + '%' : '—'}</td>
          </tr>); })}
      </tbody></table></div></div>
      <ClauseDetail c={an.clauses.find(c => c.id === selId)} />
    </div>
    <div className="row"><GoButton v="obligations">Continue to obligation identification <Icon n="arrow" s={15} /></GoButton><span className="note">Prototype extraction: a schema-bound parser stands in for the LLM call, with the same output schema.</span></div>
  </>;
}
