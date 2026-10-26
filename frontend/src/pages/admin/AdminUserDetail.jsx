import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { eventLabel, eventTone, eventDetail, STATUS_BADGE } from '../../lib/events.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { BackArrow } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';
import { confirmAction } from '../../components/extras/ConfirmDialog.jsx';

/* One customer: profile, account status and full audit history. */
export default function AdminUserDetail() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api('/admin/users/' + id)
        .then(setD)
        .catch(x => setErr(x.message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async next => {
    setBusy(true);
    setErr('');
    try {
      await api('/admin/users/' + id, { method: 'PATCH', body: { status: next } });
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  if (err && !d)
    return (
      <>
        <Link className="link" to="/admin/users">
          <BackArrow s={14} /> All users
        </Link>
        <p className="form-err">{err}</p>
      </>
    );
  if (!d) return <Loading />;
  const u = d.user;
  const [tone, label] = STATUS_BADGE[u.status];
  const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
  return (
    <>
      <Link
        className="link"
        to={u.isAdmin ? '/admin/team' : '/admin/users'}
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        <BackArrow s={14} /> {u.isAdmin ? 'Admin team' : 'Buyer users'}
      </Link>
      <div className="ph" style={{ marginTop: 10 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Customer account
          </div>
          <h1>{u.fullName || u.email}</h1>
          <p className="lead">
            {u.email}
            {u.organisationName ? ' · ' + u.organisationName : ''}
          </p>
        </div>
        <div className="row">
          <Badge s={tone} label={label} />
          {u.id === me.id || u.status === 'unverified' ? null : u.status === 'active' ? (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirmAction({
                    title: 'Deactivate this account?',
                    message:
                      'The user will be signed out and will not be able to sign in. You can activate the account again later.',
                    confirmLabel: 'Deactivate',
                  })
                )
                  setStatus('inactive');
              }}
            >
              Deactivate account
            </button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={() => setStatus('active')}>
              {u.status === 'pending' ? 'Approve account' : 'Activate account'}
            </button>
          )}
        </div>
      </div>
      {err ? (
        <p className="form-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="adm-grid">
        <div className="card pad stack">
          <h2>Profile</h2>
          {u.organisationName ? (
            <dl className="kv">
              <dt>Full name</dt>
              <dd>{u.fullName}</dd>
              <dt>Organisation</dt>
              <dd>{u.organisationName}</dd>
              <dt>Sector</dt>
              <dd>{u.sector}</dd>
              <dt>Role</dt>
              <dd>{u.jobRole}</dd>
              <dt>Phone</dt>
              <dd>{u.phone || '—'}</dd>
              <dt>Profile updated</dt>
              <dd className="mono">{u.profileUpdatedAt ? fmtTime(u.profileUpdatedAt) : '—'}</dd>
            </dl>
          ) : (
            <p className="note">The customer has not completed their profile yet.</p>
          )}
        </div>
        <div className="card pad stack">
          <h2>Account</h2>
          <dl className="kv">
            <dt>Registered</dt>
            <dd className="mono">{fmtTime(u.createdAt)}</dd>
            <dt>Email verified</dt>
            <dd className="mono">{u.emailVerifiedAt ? fmtTime(u.emailVerifiedAt) : 'Not yet'}</dd>
            <dt>Last sign-in</dt>
            <dd className="mono">{u.lastLoginAt ? fmtTime(u.lastLoginAt) : 'Never'}</dd>
            <dt>Failed sign-ins</dt>
            <dd>
              {u.failedLogins}
              {locked ? (
                <>
                  {' '}
                  · <span className="b b-coral">Locked until {fmtTime(u.lockedUntil)}</span>
                </>
              ) : null}
            </dd>
            <dt>Account type</dt>
            <dd>{u.isAdmin ? 'OffshoreAssure admin' : 'Customer'}</dd>
            <dt>Came from</dt>
            <dd data-field="signup-source">{describeSource(u.signupSource)}</dd>
          </dl>
        </div>
      </div>
      <div className="card">
        <div className="ch">
          <div>
            <h2>Activity history</h2>
            <div className="sub">From the audit log · {d.events.length} events</div>
          </div>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>By</th>
                <th>Detail</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {d.events.map((e, i) => (
                <tr key={i}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {fmtTime(e.at)}
                  </td>
                  <td>
                    <span className={'b b-' + eventTone(e.event)}>{eventLabel(e.event)}</span>
                  </td>
                  <td>{e.actor_email === u.email ? 'Customer' : e.actor_email || '—'}</td>
                  <td className="note">{eventDetail(e)}</td>
                  <td className="mono note">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* "linkedin / social · campaign launch-2026" from the UTM tags saved at sign-up. */
function describeSource(source) {
  if (!source) return 'Direct (no campaign link)';
  const channel = [source.utm_source, source.utm_medium].filter(Boolean).join(' / ');
  const campaign = source.utm_campaign ? ` · campaign ${source.utm_campaign}` : '';
  return (channel || 'Campaign link') + campaign;
}
