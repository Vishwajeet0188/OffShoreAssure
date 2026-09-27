import { USERS } from '../data/prototype-data.js';
import { userById, actionState } from '../engine/engines.js';
import { engineOf, userName } from '../lib/constants.js';
import { fmtDate } from '../lib/format.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Badge, Sev, Rid, ETag } from '../components/common/Badges.jsx';
import { PageHead, Tabs, useTab, GoButton } from '../components/common/Blocks.jsx';

const OPEN = ['Open', 'Evidence requested'], PROG = ['Evidence received', 'Ready to close'];

/* Step 10 · Workflow actions generated from open compliance issues (and delivery alerts you raise). */
export default function Actions() {
  const { a, D, act } = useAssessment();
  const st = x => actionState(a, D, x);
  const list = [['all', 'All', a.actions.length], ['open', 'Open', a.actions.filter(x => OPEN.includes(st(x))).length], ['prog', 'In progress', a.actions.filter(x => PROG.includes(st(x))).length], ['done', 'Completed', a.actions.filter(x => st(x) === 'Complete').length]];
  const cur = useTab('act', list);
  const shown = a.actions.filter(x => cur === 'all' || (cur === 'open' && OPEN.includes(st(x))) || (cur === 'prog' && PROG.includes(st(x))) || (cur === 'done' && st(x) === 'Complete'));
  return (
    <>
      <PageHead eyebrow="Step 10 · Workflow" title="Actions & workflow" lead="Generated automatically from open issues. Each action carries its rule, source and evidence link. It can only be closed once the linked evidence is verified."
        right={<GoButton v="evidence" className="btn">Open evidence</GoButton>} />
      <div className="card">
        <div style={{ padding: '4px 20px 0' }}><Tabs k="act" list={list} cur={cur} /></div>
        {shown.length ? shown.map(x => {
          const s = st(x); const c = D.checks.find(k => k.id === x.ruleId); const alert = D.delivery && D.delivery.alerts.find(y => 'DEL:' + y.key === x.ruleId);
          return (
            <div className="act" key={x.id}>
              <div>
                <div className="row"><span className="mono muted">{x.id}</span><Sev s={x.priority} /><Badge s={s} /><ETag L={x.ruleId.startsWith('DEL') ? 'D' : c ? engineOf(c) : 'A'} /></div>
                <h3 style={{ marginTop: 8, fontSize: 16 }}>{x.title}</h3>
                <div className="meta"><span>Owner <b>{userName(x.owner)}</b> · {userById(x.owner).role}</span><span>Due <b>{fmtDate(x.due)}</b></span><span>Source <b>{x.source}</b></span><span>Rule <Rid id={x.ruleId.replace('DEL:', 'DEL · ')} /></span></div>
                {c ? <p className="note" style={{ marginTop: 8 }}>{c.note}</p> : alert ? <p className="note" style={{ marginTop: 8 }}>{alert.detail}</p> : null}
              </div>
              <div className="btns">
                <label className="vh" htmlFor={'as-' + x.id}>Assign {x.id}</label>
                <select className="sm" id={'as-' + x.id} data-act="assign" data-id={x.id} value={x.owner} onChange={e => act.assign(x.id, e.target.value)}>{USERS.map(u => <option key={u.id} value={u.id}>Assign: {u.name}</option>)}</select>
                {x.ev ? <button className="btn sm" data-act="request" data-ev={x.ev} disabled={!!a.requested[x.ev] || s !== 'Open'} onClick={() => act.request(x.ev)}>Request evidence</button> : null}
                <button className="btn sm primary" data-act="complete" data-id={x.id} disabled={s !== 'Ready to close'} title={s === 'Ready to close' ? 'Close this action' : 'Linked evidence must be verified first'} onClick={() => act.complete(x.id)}>{s === 'Complete' ? 'Completed' : 'Mark complete'}</button>
              </div>
            </div>);
        }) : <div className="empty"><p className="note">No actions in this view.</p></div>}
      </div>
      <p className="note">Risk → obligation → action → evidence. Evidence added in Evidence &amp; audit updates these states automatically.</p>
    </>
  );
}
