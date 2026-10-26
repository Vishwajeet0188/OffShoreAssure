import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtDate, fmtTime } from '../../lib/format.js';
import { VERIFY_LABEL } from '../../lib/roles.js';
import { eventLabel, eventTone, eventDetail } from '../../lib/events.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { BackArrow } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = list => (list || []).map(c => regionName.of(c)).join(', ');
const TABS = [
  ['pending', 'Pending verification'],
  ['approved', 'Verified'],
  ['rejected', 'Not verified'],
  ['', 'All'],
];

/* Admin · Vendors (suppliers): companies registered through the vendor sign-up, and their verification (ASS-001). */
export default function AdminVendors() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending';
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (search) p.set('search', search);
    api('/admin/vendors?' + p)
      .then(setD)
      .catch(x => setErr(x.message));
  }, [status, search]);
  const c = d?.counts || {};
  return (
    <>
      <PageHead
        eyebrow="Admin console · Vendors"
        title="Vendors (suppliers)"
        lead="Companies that registered as vendors. Verify each company's identity, registration and jurisdiction (ASS-001) before its profile is shown to buyers."
      />
      <div className="adm-tiles adm-tiles-3">
        <Link className="adm-tile" to="/admin/vendors?status=pending">
          <span className="adm-tile-l">Pending verification</span>
          <span className={'adm-tile-n' + (c.pending ? ' amber' : '')}>{c.pending ?? '—'}</span>
        </Link>
        <Link className="adm-tile" to="/admin/vendors?status=approved">
          <span className="adm-tile-l">Verified</span>
          <span className="adm-tile-n sage">{c.approved ?? '—'}</span>
        </Link>
        <Link className="adm-tile" to="/admin/vendors?status=rejected">
          <span className="adm-tile-l">Not verified</span>
          <span className="adm-tile-n">{c.rejected ?? '—'}</span>
        </Link>
      </div>
      <div className="card">
        <div className="ch" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="tabs" role="tablist" style={{ margin: 0 }}>
            {TABS.map(([v, l]) => (
              <button
                key={v || 'all'}
                role="tab"
                aria-selected={status === v}
                className={'tab' + (status === v ? ' on' : '')}
                onClick={() => setParams(v ? { status: v } : { status: '' }, { replace: true })}
              >
                {l}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label="Search vendors"
            placeholder="Search company or registration number"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 320 }}
          />
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
                <th>Company</th>
                <th>Registered in</th>
                <th>Delivers from</th>
                <th>Services</th>
                <th>Users</th>
                <th>Status</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {!d ? (
                <tr>
                  <td colSpan="7" className="note">
                    Loading…
                  </td>
                </tr>
              ) : d.vendors.length === 0 ? (
                <tr>
                  <td colSpan="7" className="note">
                    No vendors here.
                  </td>
                </tr>
              ) : (
                d.vendors.map(v => (
                  <tr key={v.id} className="click" onClick={() => navigate('/admin/vendors/' + v.id)}>
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/admin/vendors/' + v.id}
                        onClick={e => e.stopPropagation()}
                      >
                        <b>{v.name}</b>
                      </Link>
                      <div className="note mono">{v.registrationNumber}</div>
                    </td>
                    <td>{countries([v.country])}</td>
                    <td>{countries(v.deliveryCountries)}</td>
                    <td className="note">{v.services.join(', ')}</td>
                    <td>{v.users}</td>
                    <td>
                      <Badge
                        s={VERIFY_LABEL[v.verificationStatus][0]}
                        label={VERIFY_LABEL[v.verificationStatus][1]}
                      />
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(v.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function AdminVendorDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const load = useCallback(
    () =>
      api('/admin/vendors/' + id)
        .then(setD)
        .catch(x => setErr(x.message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);
  const decide = async status => {
    setBusy(true);
    setErr('');
    setOk('');
    try {
      await api('/admin/vendors/' + id, { method: 'PATCH', body: { status, note } });
      setNote('');
      setOk(
        status === 'approved'
          ? 'Vendor verified. Its users have been emailed.'
          : 'Vendor marked as not verified. Its users have been emailed with your reason.',
      );
      await load();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const back = (
    <Link
      className="link"
      to="/admin/vendors"
      style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
    >
      <BackArrow s={14} /> Vendors
    </Link>
  );
  if (err && !d)
    return (
      <>
        {back}
        <p className="form-err">{err}</p>
      </>
    );
  if (!d) return <Loading />;
  const v = d.vendor;
  const st = v.verificationStatus;
  return (
    <>
      {back}
      <PageHead
        eyebrow="Admin console · Vendor"
        title={v.name}
        lead={`${countries([v.country])} · registration ${v.registrationNumber}`}
        right={<Badge s={VERIFY_LABEL[st][0]} label={VERIFY_LABEL[st][1]} />}
      />
      {ok ? (
        <div className="rq-msg ok" role="status">
          <b>{ok}</b>
        </div>
      ) : null}
      <div className="adm-grid">
        <div className="card pad stack">
          <h2>Company profile</h2>
          <dl className="kv">
            <dt>Legal name</dt>
            <dd>{v.name}</dd>
            <dt>Registration number</dt>
            <dd className="mono">{v.registrationNumber}</dd>
            <dt>Country of registration</dt>
            <dd>{countries([v.country])}</dd>
            <dt>Delivers from</dt>
            <dd>{countries(v.deliveryCountries)}</dd>
            <dt>Services</dt>
            <dd>{v.services.join(', ')}</dd>
            <dt>Website</dt>
            <dd>{v.website || '—'}</dd>
            <dt>Description</dt>
            <dd>{v.description || '—'}</dd>
            <dt>Registered</dt>
            <dd className="mono">{fmtTime(v.createdAt)}</dd>
          </dl>
        </div>
        <div className="card pad stack" data-section="verify">
          <h2>Verification (ASS-001)</h2>
          <p className="note" style={{ margin: 0 }}>
            Check the company against its official register (identity, registration and jurisdiction). Buyers
            only see verified vendors.
          </p>
          {v.verifiedAt ? (
            <p className="note" style={{ margin: 0 }}>
              Last decision {fmtTime(v.verifiedAt)}
              {v.verifiedByEmail ? ' by ' + v.verifiedByEmail : ''}
              {v.verificationNote ? ` · reason: ${v.verificationNote}` : ''}
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="vd-note">Reason (required to reject; shown to the vendor)</label>
            <textarea
              id="vd-note"
              maxLength={500}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Registration number not found in the national register"
            />
          </div>
          {err ? (
            <p className="form-err" role="alert">
              {err}
            </p>
          ) : null}
          <div className="row">
            <button
              className="btn primary"
              disabled={busy || st === 'approved'}
              onClick={() => decide('approved')}
              data-act="approve"
            >
              Verify vendor
            </button>
            <button
              className="btn"
              disabled={busy || st === 'rejected'}
              onClick={() => decide('rejected')}
              data-act="reject"
            >
              Mark as not verified
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="ch">
          <h2>Vendor users</h2>
          <span className="note">{d.users.length}</span>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {d.users.map(u => (
                <tr key={u.id}>
                  <td>
                    <Link className="adm-ulink" to={'/admin/users/' + u.id}>
                      <b>{u.fullName}</b>
                    </Link>
                    <div className="note">{u.email}</div>
                  </td>
                  <td>{u.jobRole}</td>
                  <td>{u.status}</td>
                  <td className="mono">{u.lastLoginAt ? fmtTime(u.lastLoginAt) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" data-section="vendor-assessments">
        <div className="ch">
          <div>
            <h2>Buyer assessments</h2>
            <div className="sub">Stage 2 · where buyers shortlisted or selected this vendor</div>
          </div>
          <span className="note">{d.assessments?.length || 0}</span>
        </div>
        {!d.assessments?.length ? (
          <p className="note pad">Not on any buyer's shortlist yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Buyer</th>
                  <th>Status</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {d.assessments.map(x => (
                  <tr key={x.reference}>
                    <td>
                      <Link className="adm-ulink mono" to={'/admin/assessments/' + x.reference}>
                        <b>{x.reference}</b>
                      </Link>
                      <div className="note">{x.title}</div>
                    </td>
                    <td>{x.buyerName}</td>
                    <td>
                      {x.selected ? (
                        <Badge s="Complete" label="Selected" />
                      ) : (
                        <Badge
                          s="In progress"
                          label={x.source === 'invitation' ? 'Invited · shortlisted' : 'Shortlisted'}
                        />
                      )}
                    </td>
                    <td className="mono">{fmtTime(x.addedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <div className="ch">
          <h2>History</h2>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>By</th>
                <th>Detail</th>
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
                  <td>{e.actor_email || '—'}</td>
                  <td className="note">{eventDetail(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
