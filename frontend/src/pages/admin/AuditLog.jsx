import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { eventLabel, eventTone, eventDetail } from '../../lib/events.js';
import { PageHead } from '../../components/common/PageHead.jsx';

const csv = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

/* Audit log (Evidence Record): every registration, sign-in and admin action. Read-only; rows cannot be edited. */
export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('search') || '');
  const event = params.get('event') || '';
  const search = params.get('search') || '';
  const page = Number(params.get('page') || 1);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); setParams(p, { replace: true }); };
  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (event) p.set('event', event); if (search) p.set('search', search);
    api('/admin/audit?' + p).then(setD).catch(x => setErr(x.message));
  }, [page, event, search]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => { if (q.trim() !== search) set('search', q.trim()); }, 350); return () => clearTimeout(t); }); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const rows = [['Time', 'Event', 'User', 'Detail', 'IP']].concat(d.events.map(e => [new Date(e.at).toISOString(), eventLabel(e.event), e.actor_email, eventDetail(e), e.ip]));
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(csv).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `offshoreassure-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return (
    <>
      <PageHead eyebrow="Admin console · Evidence record" title="Audit log" lead="Every registration, verification, sign-in and admin action, with time, user and IP address. Entries are append-only: they cannot be edited or deleted."
        right={d ? <button className="btn" onClick={exportCsv} disabled={!d.events.length}>Export CSV</button> : null} />
      <div className="card">
        <div className="ch" style={{ gap: 12, flexWrap: 'wrap' }}>
          <select aria-label="Event type" value={event} onChange={e => set('event', e.target.value)} style={{ maxWidth: 280 }}>
            <option value="">All events</option>
            <option value="user.sign">All sign-in events</option>
            {(d?.eventTypes || []).map(t => <option key={t} value={t}>{eventLabel(t)}</option>)}
          </select>
          <input type="search" aria-label="Search audit log" placeholder="Search by email or detail" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 340 }} />
          <span className="note" style={{ marginLeft: 'auto' }}>{d ? `${d.total} event${d.total === 1 ? '' : 's'}` : ''}</span>
        </div>
        {err ? <p className="form-err" style={{ padding: '0 20px' }}>{err}</p> : null}
        <div className="tw"><table>
          <thead><tr><th>Time</th><th>Event</th><th>User</th><th>Detail</th><th>IP</th></tr></thead>
          <tbody>
            {!d ? <tr><td colSpan="5" className="note">Loading…</td></tr>
              : d.events.length === 0 ? <tr><td colSpan="5" className="note">No events match.</td></tr>
              : d.events.map(e => (
                <tr key={e.id}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtTime(e.at)}</td><td><span className={'b b-' + eventTone(e.event)}>{eventLabel(e.event)}</span></td>
                  <td>{e.actor_email || '—'}</td><td className="note">{eventDetail(e)}</td><td className="mono note">{e.ip || '—'}</td></tr>))}
          </tbody>
        </table></div>
        {d && pages > 1 ? <div className="row" style={{ padding: '10px 20px', justifyContent: 'flex-end' }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</button>
          <span className="note">Page {page} of {pages}</span>
          <button className="btn sm" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</button>
        </div> : null}
      </div>
    </>
  );
}
