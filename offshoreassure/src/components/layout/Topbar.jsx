import { useEffect, useRef } from 'react';
import { USERS, VENDORS, RULES } from '../../data/prototype-data.js';
import { reqName } from '../../lib/constants.js';
import { ago } from '../../lib/format.js';
import { allAudit, evIcon } from '../../lib/portfolio.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Icon } from '../common/Icon.jsx';

/* Search across suppliers, assessments and (when an assessment is open) its clauses and rule checks. */
function SearchResults() {
  const { S, D, act } = useAssessment();
  const q = (S.q || '').trim().toLowerCase(); if (q.length < 2) return null;
  const res = [];
  Object.values(VENDORS).forEach(v => { if ((v.name + ' ' + v.country + ' ' + v.service).toLowerCase().includes(q)) res.push(['Suppliers', v.name, v.country + ' · ' + v.service, 'suppliers', '', v.id]); });
  S.list.forEach(a => { if ((a.id + ' ' + a.name).toLowerCase().includes(q)) res.push(['Assessments', a.name || a.id, a.id, 'open', a.id]); });
  if (D && D.analysis) {
    D.analysis.clauses.forEach(c => { if ((c.id + ' ' + c.heading + ' ' + c.text).toLowerCase().includes(q)) res.push(['Contract clauses', 'Clause ' + c.id + ' · ' + c.heading, c.label, 'clause', c.id]); });
    D.checks.forEach(c => { if ((c.id + ' ' + c.name).toLowerCase().includes(q)) res.push(['Obligations & rules', c.id + ' · ' + c.name, c.status, 'check', c.id]); });
  } else RULES.forEach(r => { if ((r.id + ' ' + r.name).toLowerCase().includes(q)) res.push(['Rules', r.id + ' · ' + r.name, reqName(r.req), 'go', 'rules']); });
  if (!res.length) return <div className="drop"><div className="grp">No matches</div></div>;
  let g = '';
  return (
    <div className="drop">
      {res.slice(0, 12).map((r, i) => {
        const head = r[0] !== g ? (g = r[0]) : null;
        return [
          head ? <div className="grp" key={'g' + i}>{head}</div> : null,
          <button key={i} data-act="sr" data-k={r[3]} data-id={r[4] || ''} data-sup={r[5] || ''} onClick={() => act.searchPick(r[3], r[4] || '', r[5] || '')}>
            <b style={{ fontSize: 13 }}>{r[1]}</b><span className="note">{r[2]}</span>
          </button>
        ];
      })}
    </div>
  );
}

function BellPopover() {
  const { S } = useAssessment();
  const ev = allAudit(S.list);
  return (
    <div className="bellpop">
      <div className="spread" style={{ padding: '8px 16px' }}><b>Recent activity</b><span className="note">Governance evidence log</span></div>
      <div className="act-list">
        {ev.length ? ev.slice(0, 6).map((e, i) => { const [t, ic] = evIcon(e); return (
          <div className="it" key={i}>
            <span className={'ic ' + t} style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center' }}><Icon n={ic} s={15} /></span>
            <div><b style={{ fontSize: 13 }}>{e.event}</b><div className="note">{e.aid}{e.detail ? ' · ' + e.detail.slice(0, 70) : ''}</div></div>
            <span className="note">{ago(e.at)}</span>
          </div>); })
          : <div className="it"><span></span><span className="note">No activity yet. Start a demonstration scenario.</span><span></span></div>}
      </div>
    </div>
  );
}

export default function Topbar() {
  const { S, me, act } = useAssessment();
  const sRef = useRef(S); sRef.current = S;
  const ev = allAudit(S.list); const unread = ev.filter(e => new Date(e.at).getTime() > (S.bellSeen || 0)).length;

  /* Close the notifications popover and search results on an outside click or Escape. */
  useEffect(() => {
    const onClick = e => {
      const s = sRef.current;
      if (s.bell && !e.target.closest('.bellpop') && !e.target.closest('[data-act=bell]')) act.closeBell();
      if (s.q && !e.target.closest('.search')) act.setQuery('');
    };
    const onKey = e => { if (e.key === 'Escape') act.closePopups(); };
    document.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [act]);

  return (
    <header className="top">
      <div className="search">
        <Icon n="search" s={17} />
        <label className="vh" htmlFor="q">Search</label>
        <input type="text" id="q" placeholder="Search suppliers, contracts, obligations, rules…" value={S.q || ''} autoComplete="off" onChange={e => act.setQuery(e.target.value)} />
        <div id="qres"><SearchResults /></div>
      </div>
      <div className="right">
        <div style={{ position: 'relative' }}>
          <button className="bell" data-act="bell" aria-label="Notifications" onClick={act.toggleBell}><Icon n="bell" s={21} />{unread ? <i>{Math.min(unread, 9)}</i> : null}</button>
          {S.bell ? <BellPopover /> : null}
        </div>
        <div className="user">
          <span className="avatar">{me.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
          <div>
            <label className="vh" htmlFor="role">Viewing as</label>
            <select id="role" data-act="role" value={S.role} onChange={e => act.setRole(e.target.value)}>
              {USERS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              <option value="vendor">Supplier contact</option>
            </select>
            <div className="role">{me.role}</div>
          </div>
        </div>
        <button className="btn sm" data-act="reset" title="Clear all prototype data" onClick={act.reset}>Reset demo</button>
      </div>
    </header>
  );
}
