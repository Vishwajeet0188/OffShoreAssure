import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { ago } from '../../lib/format.js';
import { eventLabel, eventTone, eventDetail } from '../../lib/events.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import { LATER_PAGES } from './ComingStage.jsx';
import Loading from '../../components/extras/Loading.jsx';

function Tile({ label, value, foot, tone, to }) {
  const body = (<>
    <span className="adm-tile-l">{label}</span>
    <span className={'adm-tile-n' + (tone ? ' ' + tone : '')}>{value ?? '—'}</span>
    {foot ? <span className="note">{foot}</span> : null}
  </>);
  return to ? <Link className="adm-tile" to={to}>{body}</Link> : <div className="adm-tile">{body}</div>;
}

/* Registrations per day, last 14 days: one series, single hue, hover tooltip, table fallback for screen readers. */
function RegistrationsChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 190, padL = 28, padB = 26, padT = 12;
  const max = Math.max(2, ...days.map(d => d.n));
  const step = (W - padL) / days.length, bw = Math.max(6, step - 6);
  const y = v => H - padB - (v / max) * (H - padB - padT);
  const ticks = [0, Math.ceil(max / 2), max];
  const lbl = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <div className="adm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="New registrations per day, last 14 days" onMouseLeave={() => setHover(null)}>
        {ticks.map(t => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" /><text x={padL - 8} y={y(t) + 4} textAnchor="end" className="adm-axis">{t}</text></g>)}
        {days.map((d, i) => {
          const x = padL + i * step + (step - bw) / 2, top = y(d.n);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * step} y={padT} width={step} height={H - padB - padT} fill="transparent" />
              {d.n > 0 ? <path d={`M${x},${H - padB} V${top + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - padB} Z`} fill="var(--copper)" opacity={hover == null || hover === i ? 1 : 0.55} /> : null}
              {i % 2 === 1 || i === days.length - 1 ? <text x={padL + i * step + step / 2} y={H - 8} textAnchor="middle" className="adm-axis">{lbl(d.day)}</text> : null}
            </g>
          );
        })}
      </svg>
      {hover != null ? <div className="adm-tip" style={{ left: `${Math.min(86, Math.max(14, ((padL + hover * step + step / 2) / W) * 100))}%` }}><b>{days[hover].n}</b> registration{days[hover].n === 1 ? '' : 's'}<span>{lbl(days[hover].day)}</span></div> : null}
      <table className="vh"><caption>Registrations per day</caption><tbody>{days.map(d => <tr key={d.day}><td>{d.day}</td><td>{d.n}</td></tr>)}</tbody></table>
    </div>
  );
}

export default function AdminOverview() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/admin/overview').then(setD).catch(x => setErr(x.message)); }, []);
  if (err) return <p className="form-err">{err}</p>;
  if (!d) return <Loading />;
  const u = d.users;
  const maxSector = Math.max(1, ...d.sectors.map(s => s.n));
  return (
    <>
      <PageHead eyebrow="Admin console" title="Platform overview" lead="Customers registered on OffshoreAssure, how their accounts are progressing, and the latest account activity." />
      <div className="adm-tiles">
        <Tile label="Buyers registered" value={u.total} foot={`${u.new7d} new in the last 7 days`} to="/admin/users" />
        <Tile label="Active accounts" value={u.active} tone="sage" foot={`${u.profilesCompleted} completed their profile`} to="/admin/users?status=active" />
        <Tile label="Email not verified" value={u.unverified} tone={u.unverified ? 'amber' : ''} foot="Registered, code not confirmed" to="/admin/users?status=unverified" />
        <Tile label="Vendors to verify" value={d.vendors?.pending} tone={d.vendors?.pending ? 'amber' : ''} foot={`${d.vendors?.approved || 0} verified · ${u.inactive} inactive buyer${u.inactive === 1 ? '' : 's'}`} to="/admin/vendors?status=pending" />
        <Tile label="Buyer organisations" value={d.organisations} foot="From completed profiles" to="/admin/buyers" />
        <Tile label="Sign-ins (24h)" value={d.activity.signIns24h} foot={`${d.activity.failedSignIns24h} failed · ${d.activity.codesSent24h} codes sent`} tone={d.activity.failedSignIns24h > 10 ? 'coral' : ''} to="/admin/audit?event=user.sign" />
      </div>
      <div className="adm-grid">
        <div className="card">
          <div className="ch"><div><h2>New registrations</h2><div className="sub">Customers per day, last 14 days</div></div></div>
          <div style={{ padding: '6px 18px 16px' }}><RegistrationsChart days={d.registrationsByDay} /></div>
        </div>
        <div className="card">
          <div className="ch"><div><h2>Customers by sector</h2><div className="sub">From completed profiles</div></div></div>
          <div className="adm-bars">
            {d.sectors.length ? d.sectors.map(s => (
              <div key={s.sector} className="adm-barrow">
                <span>{s.sector}</span>
                <span className="adm-bartrack"><i style={{ width: (s.n / maxSector * 100) + '%' }} /></span>
                <b className="mono">{s.n}</b>
              </div>)) : <p className="note">No customers yet.</p>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="ch"><h2>Latest activity</h2><Link className="link" to="/admin/audit">Open audit log <Icon n="arrow" s={13} /></Link></div>
        <div className="tw"><table>
          <thead><tr><th>When</th><th>Event</th><th>User</th><th>Detail</th></tr></thead>
          <tbody>{d.recent.map((e, i) => (
            <tr key={i}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{ago(e.at)}</td><td><span className={'b b-' + eventTone(e.event)}>{eventLabel(e.event)}</span></td><td>{e.actor_email || '—'}</td><td className="note">{eventDetail(e)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="ch"><div><h2>Coming with later stages</h2><div className="sub">Admin areas that fill in when the client confirms the remaining rules</div></div></div>
        <div className="adm-later-grid">
          {Object.entries(LATER_PAGES).map(([k, p]) => (
            <Link key={k} to={'/admin/' + k} className="adm-later-item">
              <span className="adm-stage">{p.stage}</span><b>{p.title}</b><span className="note">{p.party}</span>
            </Link>))}
        </div>
      </div>
    </>
  );
}
