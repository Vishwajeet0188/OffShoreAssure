import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { useAuth, displayName } from '../context/AuthContext.jsx';
import { STAGES, stageStatus, ACTORS } from '../lib/stages.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';
import { activeMember } from '../lib/membership.js';

/* Buyer dashboard: only real data from the API, plus where each stage of the assessment stands. */
export default function Dashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const active = activeMember(auth.membership);
  useEffect(() => { if (active) api('/requirements').then(r => setList(r.requirements)).catch(x => setErr(x.message)); }, [active]);
  const drafts = list ? list.filter(r => r.status === 'draft').length : null;
  const submitted = list ? list.filter(r => r.status === 'submitted').length : null;
  return (
    <>
      <PageHead eyebrow={'Buyer dashboard · ' + (auth.profile?.organisationName || '')} title={'Welcome, ' + displayName(auth.user, auth.profile).split(' ')[0]}
        lead="Start by describing the service you plan to outsource. Each stage below builds on the one before it."
        right={active ? <Link className="btn primary" to="/requirements/new" data-act="new-requirement">+ New requirement</Link> : null} />
      <div className="role-note" data-section="role-note">
        <span className="role-pill">Buyer</span>
        <p>You are signed in as a <b>buyer</b>: the organisation that plans to outsource a service. You submit requirements, select a vendor and receive the assessment report.
          <span className="note"> Vendors (suppliers) use a separate vendor portal, arriving with Stages 2–3. The OffshoreAssure team uses the admin console.</span></p>
      </div>
      {!active ? (
        <section className={'card vstatus vstatus-' + (auth.membership === 'pending' ? 'pending' : 'rejected')} data-section="membership">
          <div className="vstatus-head"><div><div className="eyebrow">Organisation access</div>
            <h2>{auth.membership === 'pending' ? `Waiting for ${auth.profile?.organisationName} to approve you` : `Your request to join ${auth.profile?.organisationName} was not approved`}</h2></div></div>
          <p>{auth.membership === 'pending'
            ? `${auth.profile?.organisationName} is already registered on OffshoreAssure. Its owner has been emailed and must approve you before you can see or create its requirements and assessments.`
            : 'If you do work there, ask the organisation’s owner to contact the OffshoreAssure team. Otherwise, change the organisation in your profile.'}</p>
          <div className="row"><Link className="btn sm" to="/complete-profile">Change organisation</Link></div>
        </section>
      ) : null}
      {err ? <p className="form-err">{err}</p> : null}
      {active ? <>
      <div className="dash-tiles">
        <Link className="dash-tile" to="/requirements"><span className="note">Requirements in draft</span><b>{drafts ?? '—'}</b></Link>
        <Link className="dash-tile" to="/requirements"><span className="note">Assessments created</span><b>{submitted ?? '—'}</b></Link>
      </div>
      <div className="card">
        <div className="ch"><div><h2>Your requirements</h2><div className="sub">Stage 1 · Requirement</div></div><Link className="link" to="/requirements">View all <Icon n="arrow" s={13} /></Link></div>
        {!list ? <p className="note pad">Loading…</p> : list.length === 0 ? (
          <div className="pad stack" style={{ alignItems: 'flex-start' }}>
            <p className="note" style={{ margin: 0 }}>You have not started a requirement yet.</p>
            <Link className="btn primary" to="/requirements/new">Start your first requirement</Link>
          </div>
        ) : (
          <div className="tw"><table>
            <thead><tr><th>Requirement</th><th>Assessment ID</th><th>Status</th><th>Last updated</th></tr></thead>
            <tbody>{list.slice(0, 5).map(r => (
              <tr key={r.id} className="click" onClick={() => navigate('/requirements/' + r.id)}>
                <td><b>{r.title || 'Untitled requirement'}</b></td>
                <td className="mono">{r.assessment?.reference || <span className="muted">—</span>}</td>
                <td>{r.status === 'submitted' ? <Badge s="Submitted" /> : <Badge s="Draft" />}</td>
                <td className="mono">{fmtTime(r.status === 'submitted' ? r.submittedAt : r.updatedAt)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      </> : null}
      <div className="card">
        <div className="ch"><div><h2>Assessment journey</h2><div className="sub">The nine stages, in order. Stages become available as they are built.</div></div></div>
        <ol className="journey">
          {STAGES.map(s => {
            const st = stageStatus(s);
            return (
              <li key={s.n} className={'journey-' + st}>
                <Link to={s.path || '/stage/' + s.slug}>
                  <span className="journey-n">{s.n}</span>
                  <span className="journey-t"><b>{s.title}</b><span className="note">Steps {s.steps[0][0]}–{s.steps[s.steps.length - 1][0]} · {[...new Set(s.steps.flatMap(x => [x[2], x[3]]))].map(a => ACTORS[a]).join(', ')}</span></span>
                  <span className="journey-s">{st === 'not-started' ? 'Not available yet' : st === 'partial' ? 'In development' : 'Complete · available'}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
