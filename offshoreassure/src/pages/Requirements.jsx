import { TRIGGER_TEXT, REQUIREMENTS, DATA_CATS, ACTIVITIES } from '../data/prototype-data.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Badge, MuteBadge } from '../components/common/Badges.jsx';
import { PageHead, NextButton } from '../components/common/Blocks.jsx';

const QS = [['personal', 'Will the supplier process personal data?'], ['customerInfo', 'Will the supplier access customer information?'], ['internalSystems', 'Will the supplier access internal systems?'], ['privileged', 'Will the supplier hold privileged or administrative access?'], ['overseas', 'Will processing occur outside the UK?'], ['subcontractors', 'Will the supplier use subcontractors or sub-processors?'], ['confidential', 'Will confidential business information be shared?']];

export function YesNo({ on, label, onYes, onNo, act, k }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      <button className={on ? 'on' : ''} data-act={act} data-k={k} data-v="1" onClick={onYes}>Yes</button>
      <button className={!on ? 'on' : ''} data-act={act} data-k={k} data-v="0" onClick={onNo}>No</button>
    </div>
  );
}

/* Step 2 · Requirement analysis (Engine A trigger rules over the scope answers). */
export default function Requirements() {
  const { a, D, act } = useAssessment();
  const s = a.scope; const ctx = D.ctx;
  const checks = (k, items) => (
    <div className="checks">{items.map(c => (
      <label key={c} className={'chk' + (s[k].includes(c) ? ' on' : '')}><input type="checkbox" data-act="cat" data-k={k} value={c} checked={s[k].includes(c)} onChange={e => act.toggleScopeItem(k, c, e.target.checked)} />{c}</label>
    ))}</div>
  );
  return (
    <>
      <PageHead eyebrow="Step 2 · Requirement analysis · Engine A" title="Define the outsourcing" lead="Answer what the supplier will do and touch. Each requirement on the right is produced by a trigger rule over these answers. Change an answer and the list changes." />
      <div className="grid g2 top-al">
        <div className="stack">
          <div className="card pad"><h3>Data and access</h3>
            {QS.map(([k, q]) => <div className="qrow" key={k}><span>{q}</span><YesNo on={s[k]} label={q} act="yn" k={k} onYes={() => act.setScope(k, true)} onNo={() => act.setScope(k, false)} /></div>)}
          </div>
          <div className="card pad stack"><h3>Data categories</h3>{checks('dataCats', DATA_CATS)}<h3 style={{ marginTop: 6 }}>What will the supplier do?</h3>{checks('activities', ACTIVITIES)}</div>
          <div className="row"><button className="btn primary" data-act="genReqs" onClick={act.genReqs}>{a.reqsGenerated ? 'Regenerate requirements' : 'Generate compliance requirements'}</button></div>
        </div>
        <div className="card">
          <div className="ch"><div><h2>{a.reqsGenerated ? D.reqs.length + ' compliance requirements identified' : 'Requirements preview'}</h2><div className="sub">{a.reqsGenerated ? 'Stored. These become the scoring areas, the contract mapping targets and the report rows.' : 'Not stored until you generate them.'}</div></div></div>
          <div className="stack pad" style={{ gap: 10 }}>
            {REQUIREMENTS.map(r => { const on = r.when(ctx); const idx = D.reqs.findIndex(x => x.id === r.id); return (
              <div key={r.id} className={'req' + (on ? '' : ' off')} style={{ padding: '12px 14px' }}>
                <div className="spread"><span className="code">{(on && idx >= 0 ? String(idx + 1).padStart(2, '0') + ' · ' : '') + 'REQ-' + r.id}</span>{on ? <Badge s="Triggered" /> : <MuteBadge>Not triggered</MuteBadge>}</div>
                <h3>{r.name}</h3>
                {on ? <p className="why"><b>Reason:</b> {r.reason(ctx)}</p> : null}
                <div className="trig">IF {TRIGGER_TEXT[r.id]}</div>
              </div>); })}
          </div>
        </div>
      </div>
      {a.reqsGenerated ? <NextButton v="compliance" label="Continue to the Compliance engine" /> : null}
    </>
  );
}
