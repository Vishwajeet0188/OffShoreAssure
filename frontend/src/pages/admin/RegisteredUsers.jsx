import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtDate, fmtTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { STATUS_BADGE as STATUS } from '../../lib/events.js';
import { confirmAction } from '../../components/extras/ConfirmDialog.jsx';
const TABS = [
  ['', 'All'],
  ['active', 'Active'],
  ['unverified', 'Email not verified'],
  ['pending', 'Pending approval'],
  ['inactive', 'Inactive'],
];

/* Stage 0 · Admin: Registered Users. Visible only to the OffshoreAssure team (server checks is_admin). */
export default function RegisteredUsers() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search) p.set('search', search);
      if (status) p.set('status', status);
      setData(await api('/admin/users?' + p));
    } catch (x) {
      setErr(x.message);
    }
  }, [page, search, status]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const setUserStatus = async (u, next) => {
    setBusyId(u.id);
    setErr('');
    try {
      await api('/admin/users/' + u.id, { method: 'PATCH', body: { status: next } });
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusyId(null);
    }
  };

  const c = data?.counts || {};
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHead
        eyebrow="Admin console · Buyers"
        title="Buyer users"
        lead="Every customer who has registered on OffshoreAssure. Open a user to see their profile and full activity history. Customers and the public cannot see this page."
      />
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        {[
          ['All users', c.all],
          ['Active', c.active],
          ['Email not verified', c.unverified],
          ['Pending approval', c.pending],
          ['Inactive', c.inactive],
        ].map(([l, n]) => (
          <div className="kpi" key={l} style={{ cursor: 'default' }}>
            <span className="h">{l}</span>
            <span className="n">{n ?? '—'}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="ch" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="tabs" role="tablist" style={{ margin: 0 }}>
            {TABS.map(([v, l]) => (
              <button
                key={v || 'all'}
                className={'tab' + (status === v ? ' on' : '')}
                role="tab"
                aria-selected={status === v}
                onClick={() => {
                  setStatus(v);
                  setPage(1);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label="Search users"
            placeholder="Search email, name or organisation"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
        </div>
        {err ? (
          <p className="form-err" role="alert" style={{ padding: '0 20px' }}>
            {err}
          </p>
        ) : null}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Organisation</th>
                <th>Role</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr>
                  <td colSpan="7" className="note">
                    Loading…
                  </td>
                </tr>
              ) : data.users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="note">
                    No users match.
                  </td>
                </tr>
              ) : (
                data.users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <Link className="adm-ulink" to={'/admin/users/' + u.id}>
                        <b>{u.fullName || '—'}</b>
                      </Link>
                      <div className="note">{u.email}</div>
                    </td>
                    <td>
                      {u.organisationName || <span className="muted">Profile not completed</span>}
                      {u.sector ? <div className="note">{u.sector}</div> : null}
                    </td>
                    <td>{u.jobRole || '—'}</td>
                    <td>
                      <Badge s={STATUS[u.status][0]} label={STATUS[u.status][1]} />
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(u.createdAt)}
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {u.lastLoginAt ? fmtTime(u.lastLoginAt) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {u.id === me.id || u.status === 'unverified' ? null : u.status === 'active' ? (
                        <button
                          className="btn sm"
                          disabled={busyId === u.id}
                          onClick={async () => {
                            if (
                              await confirmAction({
                                title: `Deactivate ${u.email}?`,
                                message:
                                  'They will be signed out and will not be able to sign in. You can activate the account again later.',
                                confirmLabel: 'Deactivate',
                              })
                            )
                              setUserStatus(u, 'inactive');
                          }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="btn sm primary"
                          disabled={busyId === u.id}
                          onClick={() => setUserStatus(u, 'active')}
                        >
                          {u.status === 'pending' ? 'Approve' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && pages > 1 ? (
          <div className="row" style={{ padding: '10px 20px', justifyContent: 'flex-end' }}>
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </button>
            <span className="note">
              Page {page} of {pages}
            </span>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </div>
      <p className="note">Account changes are recorded in the audit trail with the admin's name and time.</p>
    </>
  );
}
