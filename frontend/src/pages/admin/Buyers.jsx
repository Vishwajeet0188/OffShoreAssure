import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtDate, fmtTime } from '../../lib/format.js';
import { STATUS_BADGE } from '../../lib/events.js';
import { MEMBERSHIP } from '../../lib/membership.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';

/* Buyer organisations (customers), grouped by the organisation in each user's profile. */
export default function Buyers() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState({});
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api('/admin/buyers' + (search ? '?search=' + encodeURIComponent(search) : ''))
      .then(setD)
      .catch(x => setErr(x.message));
  }, [search, tick]);
  const decide = async (u, action) => {
    try {
      await api('/admin/buyers/members/' + u.id, { method: 'PATCH', body: { action } });
      setTick(t => t + 1);
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <>
      <PageHead
        eyebrow="Admin console · Buyers"
        title="Buyer organisations"
        lead="Customer organisations registered on OffshoreAssure and the people from each one. Open a person to see their full account and activity."
      />
      {d ? (
        <div className="adm-tiles adm-tiles-3">
          <div className="adm-tile">
            <span className="adm-tile-l">Organisations</span>
            <span className="adm-tile-n">{d.totals.organisations}</span>
          </div>
          <div className="adm-tile">
            <span className="adm-tile-l">People in organisations</span>
            <span className="adm-tile-n">{d.totals.users}</span>
          </div>
          <Link className="adm-tile" to="/admin/users">
            <span className="adm-tile-l">Registered, profile not completed</span>
            <span className="adm-tile-n">{d.totals.withoutProfile}</span>
            <span className="note">Not yet linked to an organisation</span>
          </Link>
        </div>
      ) : null}
      <div className="card">
        <div className="ch">
          <input
            type="search"
            aria-label="Search organisations"
            placeholder="Search organisation, person or email"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <span className="note">
            {d ? `${d.organisations.length} organisation${d.organisations.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        {err ? (
          <p className="form-err" style={{ padding: '0 20px' }}>
            {err}
          </p>
        ) : null}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Sector</th>
                <th>People</th>
                <th>Active</th>
                <th>First registered</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!d ? (
                <tr>
                  <td colSpan="7" className="note">
                    Loading…
                  </td>
                </tr>
              ) : d.organisations.length === 0 ? (
                <tr>
                  <td colSpan="7" className="note">
                    No buyer organisations yet.
                  </td>
                </tr>
              ) : (
                d.organisations.flatMap(o => [
                  <tr key={o.key} className="adm-orgrow">
                    <td>
                      <b>{o.name}</b>
                      {o.pending ? (
                        <>
                          {' '}
                          <span className="b b-amber">{o.pending} waiting</span>
                        </>
                      ) : null}
                    </td>
                    <td>{o.sectors.join(', ')}</td>
                    <td>{o.users.length}</td>
                    <td>{o.active}</td>
                    <td className="mono">{fmtDate(o.firstRegistered)}</td>
                    <td className="mono">{o.lastSignIn ? fmtTime(o.lastSignIn) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn sm"
                        aria-expanded={!!open[o.key]}
                        onClick={() => setOpen(s => ({ ...s, [o.key]: !s[o.key] }))}
                      >
                        {open[o.key] ? 'Hide people' : 'Show people'}
                      </button>
                    </td>
                  </tr>,
                  open[o.key] ? (
                    <tr key={o.key + '-p'} className="adm-sub">
                      <td colSpan="7">
                        <table>
                          <tbody>
                            {o.users.map(u => (
                              <tr key={u.id}>
                                <td>
                                  <Link className="adm-ulink" to={'/admin/users/' + u.id}>
                                    <b>{u.fullName}</b>
                                  </Link>
                                  <div className="note">{u.email}</div>
                                </td>
                                <td>{u.jobRole}</td>
                                <td>
                                  <Badge s={STATUS_BADGE[u.status][0]} label={STATUS_BADGE[u.status][1]} />{' '}
                                  <Badge
                                    s={MEMBERSHIP[u.membership][0]}
                                    label={MEMBERSHIP[u.membership][1]}
                                  />
                                </td>
                                <td>
                                  {u.membership === 'pending' ? (
                                    <div className="row">
                                      <button
                                        className="btn sm primary"
                                        onClick={() => decide(u, 'approve')}
                                        data-act="admin-approve-member"
                                      >
                                        Approve
                                      </button>
                                      <button className="btn sm" onClick={() => decide(u, 'reject')}>
                                        Reject
                                      </button>
                                    </div>
                                  ) : null}
                                </td>
                                <td className="mono note">
                                  {u.lastLoginAt
                                    ? 'Last sign-in ' + fmtTime(u.lastLoginAt)
                                    : 'Never signed in'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null,
                ])
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
